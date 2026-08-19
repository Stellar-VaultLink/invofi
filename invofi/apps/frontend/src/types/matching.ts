/**
 * Lender Preferences & Matching Engine types
 *
 * LenderPreferences are stored client-side via useLocalStorage (no account
 * needed) and optionally persisted to Supabase for authenticated lenders.
 * MatchResult and MatchQuality are pure computation outputs produced by
 * lib/matching.ts and never stored on-chain.
 */

import type { Currency, Invoice } from '@/types';

// ── Risk profile ──────────────────────────────────────────────────────────────

/**
 * Conservative: favour short-duration, low-amount invoices from originators
 *   with a clean repayment history; accept lower yield for safety.
 * Moderate: balanced scoring across all factors.
 * Aggressive: willing to accept longer durations, larger amounts, and
 *   newer originators in exchange for higher yield potential.
 */
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

// ── Currency preference ───────────────────────────────────────────────────────

/** 'both' means the lender accepts either currency with no penalty. */
export type CurrencyPreference = Currency | 'both';

// ── Core preferences shape ────────────────────────────────────────────────────

export interface LenderPreferences {
  /** Risk appetite — drives the weight matrix in the scoring algorithm. */
  riskProfile: RiskProfile;

  /** Currency preference. 'both' = no penalty for either. */
  currencyPreference: CurrencyPreference;

  /**
   * Minimum acceptable APY in basis points (e.g., 500 = 5.00%).
   * Invoices whose available rate is below this threshold receive a hard
   * penalty in the yield score component.
   */
  minYieldBps: number;

  /**
   * Optional: maximum invoice amount in stroops the lender is willing to
   * finance. 0 means "no cap".
   */
  maxAmountStroops: bigint;

  /**
   * Optional: minimum invoice amount in stroops. Filters out micro-invoices.
   * 0 means "no floor".
   */
  minAmountStroops: bigint;

  /**
   * Maximum due-date horizon in days. Invoices due further out than this
   * receive a penalty. 0 means "no max horizon".
   */
  maxDueDays: number;
}

// ── Default preferences ───────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: LenderPreferences = {
  riskProfile: 'moderate',
  currencyPreference: 'both',
  minYieldBps: 500,      // 5% APY minimum
  maxAmountStroops: 0n,  // no cap
  minAmountStroops: 0n,  // no floor
  maxDueDays: 0,         // no horizon cap
};

// ── Match quality tier ────────────────────────────────────────────────────────

/**
 * Derived from the final normalised score (0–100):
 *   excellent ≥ 75 | good ≥ 50 | fair ≥ 25 | poor < 25
 */
export type MatchQuality = 'excellent' | 'good' | 'fair' | 'poor';

// ── Score breakdown (for transparency / tooltip) ─────────────────────────────

export interface ScoreBreakdown {
  /** 0–100 sub-score: how well the invoice's risk profile matches lender's appetite. */
  riskScore: number;
  /** 0–100 sub-score: currency alignment. */
  currencyScore: number;
  /** 0–100 sub-score: available yield vs. lender's minimum requirement. */
  yieldScore: number;
  /** 0–100 sub-score: originator's historical performance (repaid vs. defaulted). */
  historyScore: number;
  /** 0–100 sub-score: time-to-due-date alignment. */
  durationScore: number;
}

// ── Match result ──────────────────────────────────────────────────────────────

export interface MatchResult {
  invoice: Invoice;
  /** Weighted composite score, 0–100. Higher is better. */
  score: number;
  /** Human-readable quality tier derived from score. */
  quality: MatchQuality;
  /** Per-factor breakdown for display / debugging. */
  breakdown: ScoreBreakdown;
}

// ── Originator history (fetched from Supabase offers mirror) ─────────────────

export interface OriginatorHistory {
  originatorAddress: string;
  totalOffers: number;
  repaidOffers: number;
  defaultedOffers: number;
}

// ── Serialisable form of LenderPreferences (localStorage-safe) ───────────────
// bigint can't be JSON.stringify'd directly; we store amounts as decimal strings.

export interface LenderPreferencesSerialized {
  riskProfile: RiskProfile;
  currencyPreference: CurrencyPreference;
  minYieldBps: number;
  maxAmountStroops: string;
  minAmountStroops: string;
  maxDueDays: number;
}

export function serializePreferences(p: LenderPreferences): LenderPreferencesSerialized {
  return {
    riskProfile: p.riskProfile,
    currencyPreference: p.currencyPreference,
    minYieldBps: p.minYieldBps,
    maxAmountStroops: p.maxAmountStroops.toString(),
    minAmountStroops: p.minAmountStroops.toString(),
    maxDueDays: p.maxDueDays,
  };
}

export function deserializePreferences(s: LenderPreferencesSerialized): LenderPreferences {
  return {
    riskProfile: s.riskProfile,
    currencyPreference: s.currencyPreference,
    minYieldBps: s.minYieldBps,
    maxAmountStroops: BigInt(s.maxAmountStroops),
    minAmountStroops: BigInt(s.minAmountStroops),
    maxDueDays: s.maxDueDays,
  };
}
