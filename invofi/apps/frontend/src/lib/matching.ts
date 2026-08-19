/**
 * Invoice-lender matching engine
 *
 * Produces a MatchResult for each Invoice given a LenderPreferences object.
 * The algorithm is a weighted sum of five sub-scores (each 0–100):
 *
 *   score = Σ weight_i × subScore_i
 *
 * Weight sets vary by risk profile so conservative lenders lean heavily on
 * history/duration safety while aggressive lenders chase yield.
 *
 * Performance: pure synchronous JS with no I/O — scoring 1 000 invoices
 * takes well under 1 ms in V8 (see tests).
 */

import type { Invoice } from '@/types';
import type {
  LenderPreferences,
  MatchQuality,
  MatchResult,
  OriginatorHistory,
  RiskProfile,
  ScoreBreakdown,
} from '@/types/matching';
import { STROOPS_PER_XLM } from '@/lib/constants';

// ── Weight matrices ───────────────────────────────────────────────────────────

/**
 * Weights must sum to 1.0 per profile.
 * risk / currency / yield / history / duration
 */
const WEIGHT_MATRIX: Record<RiskProfile, [number, number, number, number, number]> = {
  //                  risk   currency  yield   history  duration
  conservative: [0.30,  0.15,    0.10,   0.30,    0.15],
  moderate:     [0.20,  0.15,    0.25,   0.20,    0.20],
  aggressive:   [0.15,  0.10,    0.40,   0.15,    0.20],
};

// ── Risk score ────────────────────────────────────────────────────────────────

/**
 * Approximate risk tier from invoice fields:
 *   - Amount: small (<10k XLM) → A, medium (<100k) → B, large → C
 *   - Age:    new (<7d) adds risk; older invoices are better-known
 *   - Days to due: very short (<7d) or already past → C; 7-30d → B; >30d → A
 *
 * Returns 0–100 where 100 = "perfectly safe" for a conservative lender.
 * Aggressive lenders benefit from lower risk scores via their weight matrix.
 */
function computeRiskScore(
  invoice: Invoice,
  prefs: LenderPreferences,
  nowSecs: number,
): number {
  const amountXlm = Number(invoice.amount) / STROOPS_PER_XLM;
  const daysToDue = (invoice.due_date - nowSecs) / 86_400;

  // Amount component (0–100, high = small = safer)
  let amountScore: number;
  if (amountXlm <= 10_000)       amountScore = 100;
  else if (amountXlm <= 50_000)  amountScore = 80;
  else if (amountXlm <= 100_000) amountScore = 55;
  else if (amountXlm <= 500_000) amountScore = 30;
  else                           amountScore = 10;

  // Duration component (0–100, high = comfortable horizon)
  let durationRisk: number;
  if (daysToDue < 0)       durationRisk = 5;    // overdue
  else if (daysToDue < 7)  durationRisk = 30;
  else if (daysToDue < 30) durationRisk = 70;
  else if (daysToDue < 90) durationRisk = 90;
  else                     durationRisk = 75;   // very long → slightly riskier

  const rawRisk = amountScore * 0.5 + durationRisk * 0.5;

  // Aggressive lenders score higher on risky invoices (they want risk)
  if (prefs.riskProfile === 'aggressive') {
    // Mirror: aggressive treats "risky" as desirable
    return 100 - rawRisk;
  }
  return rawRisk;
}

// ── Currency score ────────────────────────────────────────────────────────────

function computeCurrencyScore(
  invoice: Invoice,
  prefs: LenderPreferences,
): number {
  if (prefs.currencyPreference === 'both') return 100;
  return invoice.currency === prefs.currencyPreference ? 100 : 20;
}

// ── Yield score ───────────────────────────────────────────────────────────────

/**
 * Estimates available yield from the RISK_TIERS base rate inferred by invoice
 * amount, then compares to the lender's minimum requirement.
 *
 * In a real deployment the marketplace offers can be queried to find the best
 * available rate; here we use the protocol's base rates as a proxy since the
 * matching engine runs client-side without an extra round-trip.
 *
 * Approximate APY: base_rate_bps + duration_bonus (longer → better yield)
 */
function estimateYieldBps(invoice: Invoice, nowSecs: number): number {
  const amountXlm = Number(invoice.amount) / STROOPS_PER_XLM;
  const daysToDue = Math.max(0, (invoice.due_date - nowSecs) / 86_400);

  // Infer risk tier from amount
  let baseBps: number;
  if (amountXlm <= 10_000)       baseBps = 500;   // tier A
  else if (amountXlm <= 100_000) baseBps = 800;   // tier B
  else                           baseBps = 1_200; // tier C

  // Longer duration → extra yield (up to +200 bps)
  const durationBonus = Math.min(200, Math.floor(daysToDue / 30) * 40);

  return baseBps + durationBonus;
}

function computeYieldScore(
  invoice: Invoice,
  prefs: LenderPreferences,
  nowSecs: number,
): number {
  const estimatedBps = estimateYieldBps(invoice, nowSecs);

  if (prefs.minYieldBps === 0) return 100; // no requirement

  if (estimatedBps >= prefs.minYieldBps) {
    // Excess yield relative to minimum — cap bonus at 2× min
    const excess = estimatedBps - prefs.minYieldBps;
    const bonus = Math.min(20, Math.floor((excess / prefs.minYieldBps) * 20));
    return Math.min(100, 80 + bonus);
  }

  // Below minimum — penalty proportional to shortfall
  const shortfallRatio = (prefs.minYieldBps - estimatedBps) / prefs.minYieldBps;
  return Math.max(0, Math.round(80 * (1 - shortfallRatio)));
}

// ── History score ─────────────────────────────────────────────────────────────

/**
 * Measures originator trustworthiness via their repayment record.
 * Falls back to 50 (neutral) when no history is available (new originator).
 */
function computeHistoryScore(
  invoice: Invoice,
  history: Map<string, OriginatorHistory>,
): number {
  const record = history.get(invoice.originator);

  if (!record || record.totalOffers === 0) return 50; // neutral for new originators

  const repayRate = record.repaidOffers / record.totalOffers;
  const defaultRate = record.defaultedOffers / record.totalOffers;

  // Base score from repay rate
  let score = repayRate * 100;

  // Heavy penalty for defaults — each default beyond the first knocks 10pts
  if (record.defaultedOffers > 0) {
    score -= Math.min(40, record.defaultedOffers * 10);
  }

  // Bonus for volume: 5+ repaid deals shows genuine track record
  if (record.repaidOffers >= 5) score = Math.min(100, score + 10);
  if (record.repaidOffers >= 10) score = Math.min(100, score + 5);

  return Math.max(0, Math.round(score));
}

// ── Duration score ────────────────────────────────────────────────────────────

/**
 * Measures how well the invoice's due-date horizon aligns with the lender's
 * maxDueDays preference.
 */
function computeDurationScore(
  invoice: Invoice,
  prefs: LenderPreferences,
  nowSecs: number,
): number {
  const daysToDue = (invoice.due_date - nowSecs) / 86_400;

  if (daysToDue < 0) return 0; // already overdue — never a good match

  if (prefs.maxDueDays > 0 && daysToDue > prefs.maxDueDays) {
    // Invoice is beyond the lender's horizon — linear penalty
    const overRatio = (daysToDue - prefs.maxDueDays) / prefs.maxDueDays;
    return Math.max(0, Math.round(80 * (1 - Math.min(1, overRatio))));
  }

  // Sweet-spot scoring: 7–90 days is ideal for most lenders
  if (daysToDue < 1)   return 10;
  if (daysToDue < 7)   return 50;
  if (daysToDue < 90)  return 100;
  if (daysToDue < 180) return 80;
  return 60;
}

// ── Quality tier ──────────────────────────────────────────────────────────────

export function scoreToQuality(score: number): MatchQuality {
  if (score >= 75) return 'excellent';
  if (score >= 50) return 'good';
  if (score >= 25) return 'fair';
  return 'poor';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a single invoice against the given preferences.
 *
 * @param invoice     Invoice to evaluate.
 * @param prefs       Lender's preferences.
 * @param history     Map of originator address → historical repayment stats.
 *                    Pass an empty Map if no history is available.
 * @param nowSecs     Current time as a Unix timestamp in seconds. Defaults to
 *                    Date.now()/1000 — injectable for deterministic testing.
 */
export function scoreInvoice(
  invoice: Invoice,
  prefs: LenderPreferences,
  history: Map<string, OriginatorHistory> = new Map(),
  nowSecs: number = Date.now() / 1000,
): MatchResult {
  const [wRisk, wCurrency, wYield, wHistory, wDuration] = WEIGHT_MATRIX[prefs.riskProfile];

  const riskScore     = computeRiskScore(invoice, prefs, nowSecs);
  const currencyScore = computeCurrencyScore(invoice, prefs);
  const yieldScore    = computeYieldScore(invoice, prefs, nowSecs);
  const historyScore  = computeHistoryScore(invoice, history);
  const durationScore = computeDurationScore(invoice, prefs, nowSecs);

  const breakdown: ScoreBreakdown = {
    riskScore,
    currencyScore,
    yieldScore,
    historyScore,
    durationScore,
  };

  const score = Math.round(
    wRisk     * riskScore     +
    wCurrency * currencyScore +
    wYield    * yieldScore    +
    wHistory  * historyScore  +
    wDuration * durationScore,
  );

  return {
    invoice,
    score,
    quality: scoreToQuality(score),
    breakdown,
  };
}

/**
 * Filter and sort a list of invoices by match quality against the lender's
 * preferences.
 *
 * @param invoices    All candidate invoices (typically status = 'Pending').
 * @param prefs       Lender's preferences.
 * @param history     Originator history map.
 * @param opts.limit  Maximum results to return (default 20).
 * @param opts.minScore  Minimum score to include in results (default 0).
 * @param opts.nowSecs   Injectable timestamp for tests.
 */
export function matchInvoices(
  invoices: Invoice[],
  prefs: LenderPreferences,
  history: Map<string, OriginatorHistory> = new Map(),
  opts: { limit?: number; minScore?: number; nowSecs?: number } = {},
): MatchResult[] {
  const { limit = 20, minScore = 0, nowSecs = Date.now() / 1000 } = opts;

  const results: MatchResult[] = [];

  for (const invoice of invoices) {
    // Hard filters before scoring (fast path)
    if (prefs.minAmountStroops > 0n && BigInt(invoice.amount) < prefs.minAmountStroops) continue;
    if (prefs.maxAmountStroops > 0n && BigInt(invoice.amount) > prefs.maxAmountStroops) continue;

    const result = scoreInvoice(invoice, prefs, history, nowSecs);
    if (result.score >= minScore) {
      results.push(result);
    }
  }

  // Sort descending by score, then by soonest due-date as tiebreaker
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.invoice.due_date - b.invoice.due_date;
  });

  return results.slice(0, limit);
}
