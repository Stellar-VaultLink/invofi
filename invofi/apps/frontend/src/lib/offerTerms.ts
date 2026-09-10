/**
 * Client-side offer term math for the offer form live preview.
 *
 * The on-chain contract computes repayment with a simple (non-compounded)
 * yield: total_due = principal + principal * rate_bps / 10_000. These helpers
 * mirror that math and additionally annualize it (APR/APY) so lenders can see
 * what their terms mean in real money before submitting.
 */

/** Contract-enforced bounds (mirrors the offer schema in OfferList.tsx). */
export const MIN_RATE_BPS = 1;
export const MAX_RATE_BPS = 5000;
export const MIN_DURATION_DAYS = 1;
export const MAX_DURATION_DAYS = 365;

export interface OfferTerms {
  /** Parsed principal in human units. */
  principal: number;
  /** Interest rate in basis points (1 bps = 0.01%). */
  rateBps: number;
  /** Term length in days. */
  durationDays: number;
  /** Simple rate as a percentage (rateBps / 100), e.g. 500 -> 5. */
  simpleRatePct: number;
  /** Simple interest owed in human units (contract math). */
  interest: number;
  /** Principal + interest in human units. */
  totalRepayment: number;
  /** Annualized simple rate: simpleRatePct * 365 / durationDays. */
  annualizedApr: number;
  /** Annualized compounded rate using a 360-day banker's year (360/durationDays periods). */
  annualizedApy: number;
  /** True when rateBps is outside the contract-allowed range. */
  rateOutOfRange: boolean;
  /** True when durationDays is outside the contract-allowed range. */
  durationOutOfRange: boolean;
}

const DAYS_PER_YEAR = 365;

/**
 * Compute the offer terms for a live preview. Returns null when the principal
 * cannot be parsed as a positive number. Range violations are reported via
 * flags (not null) so the UI can show inline warnings while the user types.
 */
export function computeOfferTerms(
  principalInput: string | number,
  rateBps: number,
  durationDays: number,
): OfferTerms | null {
  const principal = typeof principalInput === 'number'
    ? principalInput
    : Number.parseFloat(String(principalInput).trim());

  if (!Number.isFinite(principal) || principal <= 0) return null;
  // A blank rate/duration field yields '' which coerces to 0 — that is a
  // legitimate "out of range" state; only NaN (unparseable) short-circuits.
  if (!Number.isFinite(rateBps) || !Number.isFinite(durationDays)) return null;

  const simpleRatePct = rateBps / 100;
  const interest = (principal * rateBps) / 10_000;
  const totalRepayment = principal + interest;

  const annualizedApr = durationDays > 0
    ? simpleRatePct * (DAYS_PER_YEAR / durationDays)
    : 0;

  let annualizedApy = 0;
  if (durationDays > 0) {
    // Annualise by compounding the per-term rate using a 360-day banker's year
    // (360 / durationDays periods), matching standard APY convention.
    annualizedApy =
      (Math.pow(1 + rateBps / 10_000, 360 / durationDays) - 1) * 100;
  }

  return {
    principal,
    rateBps,
    durationDays,
    simpleRatePct,
    interest,
    totalRepayment,
    annualizedApr,
    annualizedApy,
    rateOutOfRange: rateBps < MIN_RATE_BPS || rateBps > MAX_RATE_BPS,
    durationOutOfRange:
      durationDays < MIN_DURATION_DAYS || durationDays > MAX_DURATION_DAYS,
  };
}

/** Human-friendly formatting for the preview, e.g. 5 -> "5.00%". */
export function formatPct(value: number, fractionDigits = 2): string {
  return `${value.toFixed(fractionDigits)}%`;
}

/** Format a money amount with thousands separators, e.g. 10500 -> "10,500". */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}