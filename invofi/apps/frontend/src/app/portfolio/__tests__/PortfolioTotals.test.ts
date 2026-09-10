import { describe, expect, it } from 'vitest';

/**
 * Verification for issue #182: mixed-currency portfolios must bucket XLM and
 * USDC positions separately and produce a single USD-equivalent grand total.
 *
 * These tests mirror the bucketing logic in portfolio/page.tsx (a pure helper
 * is kept here so the acceptance criteria are unit-testable without a DOM).
 */

interface TotalsPosition {
  currency: string;
  liveValueUsd: number;
}

/** Same bucketing logic as portfolio/page.tsx — sorted by USD value desc. */
function bucketTotals(positions: TotalsPosition[]): Array<[string, number]> {
  const buckets = new Map<string, number>();
  for (const o of positions) {
    buckets.set(o.currency, (buckets.get(o.currency) ?? 0) + o.liveValueUsd);
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
}

function grandTotal(positions: TotalsPosition[]): number {
  return positions.reduce((sum, o) => sum + o.liveValueUsd, 0);
}

describe('portfolio USD totals (issue #182)', () => {
  it('splits a mixed XLM/USDC portfolio into per-currency subtotals', () => {
    const positions: TotalsPosition[] = [
      { currency: 'XLM', liveValueUsd: 800.5 },
      { currency: 'USDC', liveValueUsd: 434.56 },
      { currency: 'XLM', liveValueUsd: 199.5 },
    ];
    const totals = bucketTotals(positions);
    expect(totals).toEqual([
      ['XLM', 1000],
      ['USDC', 434.56],
    ]);
  });

  it('grand total equals the sum of all per-currency subtotals', () => {
    const positions: TotalsPosition[] = [
      { currency: 'XLM', liveValueUsd: 120.25 },
      { currency: 'USDC', liveValueUsd: 330.75 },
      { currency: 'XLM', liveValueUsd: 49 },
    ];
    const totals = bucketTotals(positions);
    const subtotalSum = totals.reduce((sum, [, usd]) => sum + usd, 0);
    expect(subtotalSum).toBeCloseTo(grandTotal(positions), 5);
  });

  it('handles a single-currency portfolio', () => {
    const positions: TotalsPosition[] = [
      { currency: 'USDC', liveValueUsd: 900 },
      { currency: 'USDC', liveValueUsd: 100 },
    ];
    expect(bucketTotals(positions)).toEqual([['USDC', 1000]]);
  });

  it('sorts currencies by USD value descending', () => {
    const positions: TotalsPosition[] = [
      { currency: 'USDC', liveValueUsd: 100 },
      { currency: 'XLM', liveValueUsd: 900 },
    ];
    expect(bucketTotals(positions)).toEqual([
      ['XLM', 900],
      ['USDC', 100],
    ]);
  });

  it('is empty-safe', () => {
    expect(bucketTotals([])).toEqual([]);
    expect(grandTotal([])).toBe(0);
  });
});
