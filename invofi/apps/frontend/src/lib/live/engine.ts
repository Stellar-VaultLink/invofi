// ── Live portfolio engine (issue #221) ───────────────────────────────────────
// Owns the transport lifecycle and the per-position throttling:
//
//  1. Resyncs positions from the caller's fetch function (initial + periodic +
//     reconnect safety net).
//  2. Prefers a WebSocket relay; degrades to Soroban event polling when the
//     relay is missing or unreachable (graceful-degradation criterion).
//  3. Recomputes accruing yield once per second for active positions, so
//     "earned to date" moves in real time even between discrete events.
//  4. Routes every update through a per-position throttle (≤ 1/sec/position)
//     before handing it to the reducer.

import type { FinancingOffer } from '@invofi/sdk';
import type { PerKeyThrottle } from './throttle';
import { createPerKeyThrottle } from './throttle';
import type { ConnectionStatus, LivePositionUpdate, LiveTransport } from './types';
import { offerApy, yieldEarnedStroops, isActiveOffer } from './yield';
import { createPollingTransport, createWebSocketTransport, type TransportHandle } from './transports';

export interface LivePortfolioEngineOptions {
  wsUrl: string | null;
  contractIds: string[];
  rpcUrl: string;
  networkPassphrase: string;
  /** Full-state fetch (e.g. Supabase mirror). Never rejects — return [] on failure. */
  fetchPositions: () => Promise<FinancingOffer[]>;
  onPositions: (offers: FinancingOffer[]) => void;
  onUpdate: (update: LivePositionUpdate) => void;
  onConnectionChange: (status: ConnectionStatus, transport: LiveTransport, detail?: string) => void;
  /** Max one delivered update per position per this window. Default 1000ms. */
  throttleMs?: number;
  /** Periodic full resync in both modes. Default 10s. */
  resyncIntervalMs?: number;
  /** How often to recompute accruing yield. Default 1000ms. */
  yieldTickMs?: number;
}

export class LivePortfolioEngine {
  private readonly opts: LivePortfolioEngineOptions;
  private ws: TransportHandle | null = null;
  private polling: TransportHandle | null = null;
  private throttle: PerKeyThrottle<LivePositionUpdate> | null = null;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private yieldTimer: ReturnType<typeof setInterval> | null = null;
  private latestOffers: FinancingOffer[] = [];
  /** Last dispatched accrual per position — unchanged ticks are skipped. */
  private readonly lastEarned = new Map<string, bigint>();
  private started = false;
  private stopped = false;
  private degradedToPolling = false;
  private resyncInFlight: Promise<void> | null = null;
  private resyncGeneration = 0;

  constructor(options: LivePortfolioEngineOptions) {
    this.opts = options;
  }

  /** Throttle key: one coalescing slot per position per update kind. */
  private static key(update: LivePositionUpdate): string {
    return `${update.positionId}:${update.kind}`;
  }

  /** Establish the live stream. Resolves after the first positions resync. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const {
      wsUrl,
      contractIds,
      rpcUrl,
      networkPassphrase,
      onUpdate,
      onConnectionChange,
      throttleMs = 1_000,
      resyncIntervalMs = 10_000,
      yieldTickMs = 1_000,
    } = this.opts;

    this.throttle = createPerKeyThrottle<LivePositionUpdate>(throttleMs, (_key, update) => {
      onUpdate(update);
    });

    if (wsUrl) {
      this.ws = createWebSocketTransport({
        url: wsUrl,
        onUpdate: update => this.throttle?.(LivePortfolioEngine.key(update), update),
        onConnectionChange: (status, detail) => onConnectionChange(status, 'websocket', detail),
        onResync: () => void this.resync(),
        onGiveUp: reason => this.degradeToPolling(reason),
      });
      this.ws.start();
    } else {
      this.degradeToPolling('no WebSocket relay configured');
    }

    // Continuous accrual: recompute yields for active positions each tick.
    // Unchanged values are skipped — a fresh updatedAt alone isn't an update.
    this.yieldTimer = setInterval(() => {
      if (this.stopped) return;
      const nowSecs = Date.now() / 1000;
      for (const offer of this.latestOffers) {
        if (!isActiveOffer(offer)) continue;
        const earnedToDate = yieldEarnedStroops(offer, nowSecs);
        if (this.lastEarned.get(offer.id) === earnedToDate) continue;
        this.lastEarned.set(offer.id, earnedToDate);
        const update: LivePositionUpdate = {
          kind: 'yield_calculated',
          positionId: offer.id,
          apy: offerApy(offer),
          earnedToDate,
          updatedAt: Date.now(),
        };
        this.throttle?.(LivePortfolioEngine.key(update), update);
      }
    }, yieldTickMs);

    // Periodic safety-net resync (both modes) so brand-new positions appear.
    this.resyncTimer = setInterval(() => void this.resync(), resyncIntervalMs);

    await this.resync();
  }

  /** Switch from the relay to the polling fallback, once. */
  private degradeToPolling(reason: string): void {
    if (this.stopped || this.degradedToPolling) return;
    this.degradedToPolling = true;
    this.ws?.stop();
    this.ws = null;
    this.opts.onConnectionChange('polling', 'polling', reason);
    this.polling = createPollingTransport({
      contractIds: this.opts.contractIds,
      rpcUrl: this.opts.rpcUrl,
      networkPassphrase: this.opts.networkPassphrase,
      onUpdate: update => this.throttle?.(LivePortfolioEngine.key(update), update),
      onConnectionChange: (status, detail) =>
        this.opts.onConnectionChange(status, 'polling', detail),
      onResync: () => void this.resync(),
    });
    this.polling.start();
  }

  /**
   * Full-state resync. In-flight requests are shared (never concurrent), and a
   * generation counter discards responses superseded by a newer resync so a
   * stale response can't overwrite fresher positions.
   */
  private resync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.resyncInFlight) return this.resyncInFlight;
    const generation = ++this.resyncGeneration;
    this.resyncInFlight = this.opts
      .fetchPositions()
      .then(offers => {
        if (this.stopped || generation !== this.resyncGeneration) return;
        this.latestOffers = offers;
        this.opts.onPositions(offers);
      })
      .catch(() => {
        // A failed resync is non-fatal — the live stream keeps the last state.
      })
      .then(() => {
        if (generation === this.resyncGeneration) this.resyncInFlight = null;
      });
    return this.resyncInFlight;
  }

  /** Force an immediate full resync (used by refresh buttons + auth changes). */
  resyncNow(): void {
    void this.resync();
  }

  /**
   * Tear down every timer and transport. Terminal: an engine cannot be
   * restarted after `stop()`. Construct a new instance instead.
   */
  stop(): void {
    this.stopped = true;
    this.resyncGeneration += 1;
    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
    }
    if (this.yieldTimer) {
      clearInterval(this.yieldTimer);
      this.yieldTimer = null;
    }
    this.ws?.stop();
    this.ws = null;
    this.polling?.stop();
    this.polling = null;
    // Deliver anything still pending before dropping the throttle.
    this.throttle?.flush();
    this.throttle?.stop();
    this.throttle = null;
    this.lastEarned.clear();
  }
}