// ── Live portfolio reducer (issue #221) ──────────────────────────────────────
// Pure state transitions for the dashboard. The context provider dispatches
// here from the engine; components read the resulting `LivePosition`s. Because
// every action goes through this reducer, tests can drive the full data flow
// without React.

import type { FinancingOffer } from '@invofi/sdk';
import { toStroopsBigInt } from '@/lib/utils';
import { safeStroopsFromWire } from './convert';
import type { ConnectionStatus, LivePosition, LivePositionUpdate, LiveTransport } from './types';
import { offerApy, remainingStroops, repaymentProgress, totalDueStroops, yieldEarnedStroops } from './yield';
import { usdPriceFor } from './prices';
import { STROOPS_PER_XLM } from '@/lib/constants';

export interface LivePortfolioState {
  connection: ConnectionStatus;
  /** Optional human-readable detail for the status pill (e.g. "retry in 2s"). */
  connectionDetail: string | null;
  transport: LiveTransport;
  positions: LivePosition[];
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last data-changing event (for "updated Xs ago" hints). */
  lastUpdatedAt: number | null;
}

export type LivePortfolioAction =
  | { type: 'connection'; connection: ConnectionStatus; transport: LiveTransport; detail?: string | null }
  | { type: 'positions'; offers: FinancingOffer[] }
  | { type: 'update'; update: LivePositionUpdate }
  | { type: 'loading'; loading: boolean }
  | { type: 'error'; error: string | null }
  | { type: 'reset' };

export const INITIAL_LIVE_PORTFOLIO_STATE: LivePortfolioState = {
  connection: 'connecting',
  connectionDetail: null,
  transport: 'websocket',
  positions: [],
  loading: true,
  error: null,
  lastUpdatedAt: null,
};

/** Compute every derived live field for a single position row. */
export function deriveLivePosition(
  offer: FinancingOffer,
  nowSecs: number = Date.now() / 1000,
): LivePosition {
  const price = usdPriceFor(offer.currency);
  const remaining = remainingStroops(offer);
  return {
    ...offer,
    amount: toStroopsBigInt(offer.amount),
    amount_repaid: toStroopsBigInt(offer.amount_repaid),
    totalDue: totalDueStroops(offer),
    remaining,
    repaymentProgress: repaymentProgress(offer),
    apy: offerApy(offer),
    earnedToDate: yieldEarnedStroops(offer, nowSecs),
    liveValueUsd: (Number(remaining) / STROOPS_PER_XLM) * price,
    updatedAt: Date.now(),
  };
}

/** Build a live row from a stored row + an update, or undefined if unknown. */
function applyUpdate(
  position: LivePosition | undefined,
  update: LivePositionUpdate,
): LivePosition | undefined {
  if (!position) return undefined;
  const now = update.updatedAt ?? Date.now();

  switch (update.kind) {
    case 'position_updated': {
      const merged: FinancingOffer = {
        ...position,
        status: update.fields.status ?? position.status,
        funded_at:
          update.fields.funded_at !== undefined ? Number(update.fields.funded_at) : position.funded_at,
        currency: update.fields.currency ?? position.currency,
        amount: safeStroopsFromWire(update.fields.amount ?? position.amount),
        amount_repaid: safeStroopsFromWire(update.fields.amount_repaid ?? position.amount_repaid),
      };
      const derived = deriveLivePosition(merged, now / 1000);
      return { ...derived, updatedAt: now };
    }

    case 'yield_calculated':
      return {
        ...position,
        apy: update.apy,
        earnedToDate: update.earnedToDate,
        updatedAt: now,
      };

    case 'repayment_received': {
      let amountRepaid: bigint;
      if (update.remaining !== undefined) {
        // Cumulative outstanding claim: monotonic, so a replayed or stale
        // delivery can never double-count a repayment.
        const derived = totalDueStroops(position) - update.remaining;
        amountRepaid = derived > position.amount_repaid ? derived : position.amount_repaid;
      } else {
        amountRepaid = position.amount_repaid + update.amountRepaid;
      }
      const merged = {
        ...position,
        amount_repaid: amountRepaid,
      };
      const derived = deriveLivePosition(merged, now / 1000);
      return {
        ...derived,
        status: update.fullyRepaid ? 'Repaid' : derived.status,
        updatedAt: now,
      };
    }
  }
}

export function livePortfolioReducer(
  state: LivePortfolioState,
  action: LivePortfolioAction,
): LivePortfolioState {
  switch (action.type) {
    case 'connection':
      return {
        ...state,
        connection: action.connection,
        transport: action.transport,
        connectionDetail: action.detail ?? null,
      };

    case 'positions':
      return {
        ...state,
        positions: action.offers.map(offer => deriveLivePosition(offer)),
        loading: false,
        error: null,
        lastUpdatedAt: Date.now(),
      };

    case 'update': {
      const { update } = action;
      let changed = false;
      const positions = state.positions.map(position => {
        if (position.id !== update.positionId) return position;
        const next = applyUpdate(position, update);
        if (!next) return position;
        changed = true;
        return next;
      });
      if (!changed) return state;
      return { ...state, positions, lastUpdatedAt: Date.now() };
    }

    case 'loading':
      return { ...state, loading: action.loading };

    case 'error':
      return { ...state, error: action.error };

    case 'reset':
      return INITIAL_LIVE_PORTFOLIO_STATE;

    default:
      return state;
  }
}