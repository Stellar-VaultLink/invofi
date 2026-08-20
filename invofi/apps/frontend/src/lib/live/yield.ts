// ── Yield / repayment math (issue #221) ──────────────────────────────────────
// Pure helpers shared by the reducer and the live engine. The contract uses
// simple interest: yield = principal × interest_rate / 10000, accreting
// linearly from `funded_at` across `duration` seconds. All amounts are stroops.

import type { FinancingOffer } from '@invofi/sdk';

export const SECONDS_PER_YEAR = 365 * 86_400;

/** Total agreed yield in stroops: principal × rate (simple interest). */
export function totalYieldStroops(
  offer: Pick<FinancingOffer, 'amount' | 'interest_rate'>,
): bigint {
  return (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
}

/** Amount the borrower owes in total: principal + agreed yield. */
export function totalDueStroops(
  offer: Pick<FinancingOffer, 'amount' | 'interest_rate'>,
): bigint {
  return offer.amount + totalYieldStroops(offer);
}

/** Outstanding claim in stroops (floored at 0). */
export function remainingStroops(
  offer: Pick<FinancingOffer, 'amount' | 'amount_repaid' | 'interest_rate'>,
): bigint {
  const due = totalDueStroops(offer);
  const repaid = offer.amount_repaid;
  return due > repaid ? due - repaid : 0n;
}

/** Repayment progress as a ratio 0..1 for the streaming progress bar. */
export function repaymentProgress(
  offer: Pick<FinancingOffer, 'amount' | 'amount_repaid' | 'interest_rate'>,
): number {
  const due = totalDueStroops(offer);
  if (due <= 0n) return 0;
  const ratio = Number(offer.amount_repaid) / Number(due);
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Annualized yield as a percentage. The agreed rate covers `duration` seconds,
 * so scaling it to a 365-day year gives a comparable APY across positions.
 */
export function offerApy(
  offer: Pick<FinancingOffer, 'interest_rate' | 'duration'>,
): number {
  if (offer.duration <= 0 || offer.interest_rate <= 0) return 0;
  return (offer.interest_rate / 10_000) * (SECONDS_PER_YEAR / offer.duration) * 100;
}

/**
 * Yield accrued so far, in stroops. Linear from `funded_at`, capped at the
 * total agreed yield. Returns 0 for offers that were never funded.
 */
export function yieldEarnedStroops(
  offer: Pick<FinancingOffer, 'amount' | 'interest_rate' | 'funded_at' | 'duration'>,
  nowSecs: number = Date.now() / 1000,
): bigint {
  if (offer.funded_at <= 0 || offer.duration <= 0) return 0n;
  const total = totalYieldStroops(offer);
  if (total <= 0n) return 0n;
  const elapsed = Math.max(0, nowSecs - offer.funded_at);
  if (elapsed >= offer.duration) return total;
  // Stay in bigint — Number(total) loses precision for valid large on-chain
  // amounts, and the floor must apply to the integer ratio, not a float.
  const elapsedSecs = BigInt(Math.floor(elapsed));
  return (total * elapsedSecs) / BigInt(offer.duration);
}

/** Whether an offer is actively deploying capital (its yield accrues). */
export function isActiveOffer(offer: Pick<FinancingOffer, 'status'>): boolean {
  return offer.status === 'Accepted' || offer.status === 'Financed';
}