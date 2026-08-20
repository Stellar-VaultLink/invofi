// ── Live transports (issue #221) ─────────────────────────────────────────────
// Two interchangeable sources feed the live dashboard:
//
//  1. `createWebSocketTransport` — connects to a relay (e.g. the keeper's
//     SSE/WS endpoint, or any server that mirrors on-chain events) that pushes
//     `position_updated`, `yield_calculated`, and `repayment_received`
//     envelopes. Reconnects with exponential backoff (first retry within ~1s)
//     and gives up to the polling fallback after repeated initial failures.
//
//  2. `createPollingTransport` — the graceful-degradation path. It subscribes
//     to the Soroban RPC event stream via the SDK's `listenToEvents` (already
//     the project's documented SSE/WS upgrade path — see `apps/sdk/events.ts`)
//     and turns on-chain events into the same normalized updates. A periodic
//     Supabase resync (owned by the engine) fills any gaps.
//
// Both produce `LivePositionUpdate`s so the reducer and UI are transport-agnostic.

import { listenToEvents, type ProtocolEventName } from '@invofi/sdk';
import type { ConnectionStatus, LivePositionUpdate, WsEnvelope } from './types';
import { stroopsFromWire } from './convert';

// ── Shared handle ────────────────────────────────────────────────────────────

export interface TransportHandle {
  start: () => void;
  stop: () => void;
}

export interface TransportCallbacks {
  onUpdate: (update: LivePositionUpdate) => void;
  onConnectionChange: (status: ConnectionStatus, detail?: string) => void;
  /** Called when a resync of all positions is warranted. */
  onResync: () => void;
}

// ── WebSocket relay transport ────────────────────────────────────────────────

export interface WebSocketTransportOptions extends TransportCallbacks {
  url: string;
  /** First reconnect delay after a drop. Default 1000ms (reconnect ≤ 5s). */
  reconnectBaseMs?: number;
  /** Ceiling for the exponential backoff. Default 30s. */
  maxBackoffMs?: number;
  /** How many failed initial connect attempts before giving up to polling. */
  maxReconnectAttempts?: number;
  /** Repeated failures after a successful connect before giving up. Default 8. */
  maxRelayFailures?: number;
  /** How long to wait for the handshake before treating it as failed. Default 10s. */
  connectTimeoutMs?: number;
  /** Called once when the relay is permanently unavailable. */
  onGiveUp: (reason: string) => void;
}

/** Map a relay envelope to a normalized `LivePositionUpdate`, or null. */
export function decodeEnvelope(raw: string): LivePositionUpdate | null {
  let parsed: WsEnvelope;
  try {
    parsed = JSON.parse(raw) as WsEnvelope;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null;

  // Both transports stamp the same received-time shape.
  const updatedAt = Date.now();
  try {
    switch (parsed.type) {
      case 'position_updated':
        if (typeof parsed.positionId !== 'string') return null;
        return {
          kind: 'position_updated',
          positionId: parsed.positionId,
          fields: parsed.fields ?? {},
          updatedAt,
        };
      case 'yield_calculated':
        if (typeof parsed.positionId !== 'string' || typeof parsed.apy !== 'number') return null;
        return {
          kind: 'yield_calculated',
          positionId: parsed.positionId,
          apy: parsed.apy,
          earnedToDate: stroopsFromWire(parsed.earnedToDate),
          updatedAt,
        };
      case 'repayment_received':
        if (typeof parsed.positionId !== 'string') return null;
        // The normalized update uses amountRepaid, not progress — accept
        // updates that omit progress and reject malformed amounts up front.
        if (
          typeof parsed.amountRepaid !== 'string' &&
          typeof parsed.amountRepaid !== 'number' &&
          typeof parsed.amountRepaid !== 'bigint'
        ) {
          return null;
        }
        return {
          kind: 'repayment_received',
          positionId: parsed.positionId,
          amountRepaid: stroopsFromWire(parsed.amountRepaid),
          remaining:
            parsed.remaining === undefined ? undefined : stroopsFromWire(parsed.remaining),
          fullyRepaid: parsed.fullyRepaid === true,
          updatedAt,
        };
      default:
        return null;
    }
  } catch {
    // A malformed amount must never crash the message handler.
    return null;
  }
}

/**
 * WebSocket relay client with exponential-backoff reconnection.
 *
 * Reconnect schedule (base 1s, doubling, capped): 1s → 2s → 4s → … so a
 * dropped live connection is restored within ~1–5 seconds (acceptance
 * criterion). If the relay never connects within `maxReconnectAttempts`
 * attempts, `onGiveUp` fires so the caller can degrade to polling.
 */
export function createWebSocketTransport(
  options: WebSocketTransportOptions,
): TransportHandle {
  const {
    url,
    onUpdate,
    onConnectionChange,
    onResync,
    onGiveUp,
    reconnectBaseMs = 1_000,
    maxBackoffMs = 30_000,
    maxReconnectAttempts = 3,
    maxRelayFailures = 8,
    connectTimeoutMs = 10_000,
  } = options;

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let everConnected = false;
  let consecutiveFailures = 0;

  function backoffFor(attempt: number): number {
    return Math.min(maxBackoffMs, reconnectBaseMs * 2 ** Math.min(attempt, 6));
  }

  function clearConnectTimer(): void {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  }

  function connect(): void {
    if (stopped) return;
    onConnectionChange(everConnected ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      handleFailure('invalid WebSocket URL');
      return;
    }
    socket = ws;

    // A stalled handshake fires neither onopen nor onclose — bound it.
    connectTimer = setTimeout(() => {
      if (stopped || socket !== ws) return;
      socket = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
      handleFailure('connect timed out');
    }, connectTimeoutMs);

    ws.onopen = () => {
      if (stopped || socket !== ws) return;
      clearConnectTimer();
      everConnected = true;
      // Note: the failure counter is NOT reset here. Once live, a drop counts
      // against `maxRelayFailures` so a relay that keeps failing hands off to
      // polling instead of reconnecting forever.
      onConnectionChange('connected');
      // The relay may have missed events while we were offline — resync.
      onResync();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (stopped || socket !== ws) return;
      const update = decodeEnvelope(String(event.data));
      if (update) onUpdate(update);
    };

    ws.onerror = () => {
      // onclose follows — the close handler owns retry logic.
    };

    ws.onclose = () => {
      if (stopped || socket !== ws) return;
      clearConnectTimer();
      socket = null;
      handleFailure('connection closed');
    };
  }

  function handleFailure(reason: string): void {
    if (stopped) return;

    if (everConnected) {
      // We were live and dropped — reconnect with backoff, but only so far: a
      // relay that stays down must hand off to the polling fallback.
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxRelayFailures) {
        onGiveUp(reason);
        return;
      }
      const backoff = backoffFor(consecutiveFailures - 1);
      onConnectionChange('reconnecting', `retry in ${Math.round(backoff / 1000)}s`);
      reconnectTimer = setTimeout(connect, backoff);
      return;
    }

    // Never connected yet — a few attempts, then hand off to polling.
    consecutiveFailures += 1;
    if (consecutiveFailures >= maxReconnectAttempts) {
      onGiveUp(reason);
      return;
    }
    onConnectionChange('connecting', `attempt ${consecutiveFailures + 1}`);
    reconnectTimer = setTimeout(connect, backoffFor(consecutiveFailures));
  }

  function stop(): void {
    stopped = true;
    clearConnectTimer();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.onopen = socket.onclose = socket.onmessage = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
      socket = null;
    }
  }

  return { start: connect, stop };
}

// ── Soroban event-stream polling transport (fallback) ───────────────────────

const POLLING_EVENT_TYPES: ProtocolEventName[] = [
  'off_acc',
  'off_rej',
  'off_wdr',
  'off_def',
  'inv_rep',
  'pos_mint',
];

export interface PollingTransportOptions extends TransportCallbacks {
  /** Contract IDs to watch. Empty → rely on the engine's Supabase resync. */
  contractIds: string[];
  rpcUrl: string;
  networkPassphrase: string;
  /** How often to poll the RPC. Default 5000ms (one Stellar ledger ≈ 5s). */
  pollIntervalMs?: number;
}

/**
 * Graceful-degradation transport: watches the Soroban RPC event stream for the
 * user's protocol events and maps them to the same normalized updates.
 *
 * `inv_rep` maps directly to a `repayment_received` update for instant feedback;
 * every other mutation triggers a resync because status transitions need the
 * full row. A periodic Supabase resync (in the engine) is the safety net.
 */
export function createPollingTransport(
  options: PollingTransportOptions,
): TransportHandle {
  const {
    contractIds,
    rpcUrl,
    networkPassphrase,
    onUpdate,
    onConnectionChange,
    onResync,
    pollIntervalMs = 5_000,
  } = options;

  let stopListening: (() => void) | null = null;
  let stopped = false;
  let resyncPending: ReturnType<typeof setTimeout> | null = null;

  // One poll cycle can deliver a batch of events — coalesce them into a single
  // resync request (the engine's in-flight guard also dedupes concurrently).
  function requestResync(): void {
    if (stopped) return;
    if (resyncPending) return;
    resyncPending = setTimeout(() => {
      resyncPending = null;
      onResync();
    }, 0);
  }

  function start(): void {
    if (stopped) return;
    onConnectionChange('polling');
    if (!contractIds || contractIds.length === 0) return; // resync-only fallback
    stopListening = listenToEvents({
      rpcUrl,
      networkPassphrase,
      contractIds,
      eventTypes: POLLING_EVENT_TYPES,
      pollIntervalMs,
      onEvent(event) {
        if (stopped) return;
        if (event.type === 'inv_rep') {
          onUpdate({
            kind: 'repayment_received',
            positionId: event.subjectId,
            amountRepaid: event.data.amount,
            fullyRepaid: event.data.fullyRepaid,
            updatedAt: Date.now(),
          });
          // Instant feedback for repayments; other mutations need a resync.
          return;
        }
        requestResync();
      },
      onError(error) {
        // The SDK retries with back-off internally; surface the failure so the
        // UI's connection detail shows why live data may be stale.
        if (stopped) return;
        onConnectionChange('polling', `poll error: ${error.message}`);
      },
    });
  }

  function stop(): void {
    stopped = true;
    if (resyncPending) {
      clearTimeout(resyncPending);
      resyncPending = null;
    }
    if (stopListening) {
      stopListening();
      stopListening = null;
    }
  }

  return { start, stop };
}