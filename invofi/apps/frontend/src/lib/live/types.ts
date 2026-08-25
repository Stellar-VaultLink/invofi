// ── Live portfolio types (issue #221) ───────────────────────────────────────
// Shared contracts for the WebSocket + polling live dashboard. These are
// framework-agnostic so the transport, engine, and reducer layers stay
// unit-testable without React.

import type { Currency, FinancingOffer } from '@invofi/sdk';

/** Which live transport is currently backing the dashboard. */
export type LiveTransport = 'websocket' | 'polling';

/**
 * Connection lifecycle of the live stream.
 *
 * | Value         | Meaning                                                        |
 * |---------------|---------------------------------------------------------------|
 * | `connecting`  | Establishing the initial WebSocket connection                 |
 * | `connected`   | Streaming live updates over WebSocket                         |
 * | `reconnecting`| WebSocket dropped — retrying with exponential backoff         |
 * | `polling`     | WebSocket unavailable — Soroban event stream + Supabase poll  |
 * | `offline`     | No live source at all (no wallet, no data)                    |
 */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'polling'
  | 'offline';

/**
 * A portfolio position enriched with live-computed values. Everything the
 * dashboard renders derives from this single shape, so a full resync and an
 * incremental streamed update produce identical rows.
 */
export interface LivePosition extends FinancingOffer {
  /** Annualized yield as a percentage (agreed rate scaled to a year). */
  apy: number;
  /** Yield accrued so far, in stroops (principal × rate × elapsed/duration). */
  earnedToDate: bigint;
  /** Principal + total agreed yield, in stroops. */
  totalDue: bigint;
  /** Outstanding claim in stroops (totalDue − amount_repaid, floor 0). */
  remaining: bigint;
  /** Repayment progress as a ratio 0..1 (streaming progress bar). */
  repaymentProgress: number;
  /** Current USD value of the outstanding claim. */
  liveValueUsd: number;
  /** Epoch ms of the last update that touched this position. */
  updatedAt: number;
}

/** Partial offer fields delivered by a `position_updated` event. */
export type PositionUpdatedFields = Partial<
  Pick<FinancingOffer, 'status' | 'funded_at' | 'currency'>
> & {
  /** Amounts may arrive as strings over the wire (bigints don't survive JSON). */
  amount?: bigint | string;
  amount_repaid?: bigint | string;
};

/**
 * Normalized live update delivered to the reducer. Every transport (WebSocket
 * relay or Soroban event polling) produces these, so the UI code never cares
 * where an update came from.
 */
export type LivePositionUpdate =
  | {
      kind: 'position_updated';
      positionId: string;
      fields: PositionUpdatedFields;
      updatedAt?: number;
    }
  | {
      kind: 'yield_calculated';
      positionId: string;
      apy: number;
      earnedToDate: bigint;
      updatedAt?: number;
    }
  | {
      kind: 'repayment_received';
      positionId: string;
      /** Incremental amount of this repayment, in stroops. */
      amountRepaid: bigint;
      /**
       * Cumulative outstanding claim (totalDue − repaid) when the relay
       * provides it. When present the reducer derives `amount_repaid` from this
       * monotonic value so replayed deliveries can't double-count.
       */
      remaining?: bigint;
      fullyRepaid: boolean;
      updatedAt?: number;
    };

/**
 * Wire protocol for a WebSocket relay (see `createWebSocketTransport`).
 * The relay forwards on-chain events as one of these envelopes:
 *
 * ```jsonc
 * { "type": "position_updated",    "positionId": "off_…", "fields": { "status": "Financed", "funded_at": 1713… } }
 * { "type": "yield_calculated",    "positionId": "off_…", "apy": 12.5, "earnedToDate": "1234567" }
 * { "type": "repayment_received",  "positionId": "off_…", "amountRepaid": "1000000", "remaining": "5000000",
 *   "progress": 0.2, "fullyRepaid": false }
 * ```
 *
 * Amounts are stroops and may arrive as JSON numbers or strings (bigints do
 * not survive JSON) — the transport normalizes them with `toStroopsBigInt`.
 */
export type WsEnvelope =
  | { type: 'position_updated'; positionId: string; fields: PositionUpdatedFields }
  | {
      type: 'yield_calculated';
      positionId: string;
      apy: number;
      earnedToDate: bigint | number | string;
    }
  | {
      type: 'repayment_received';
      positionId: string;
      amountRepaid: bigint | number | string;
      remaining: bigint | number | string;
      progress: number;
      fullyRepaid: boolean;
    };

/** Value object describing the current connection for the status pill. */
export interface ConnectionInfo {
  status: ConnectionStatus;
  transport: LiveTransport;
  /** Human-readable detail (e.g. "retry in 2s" or "relay unavailable"). */
  detail?: string;
}

/** Lookup keyed by currency for USD pricing. */
export type PriceFor = (currency: Currency) => number;