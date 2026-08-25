import { describe, expect, it } from 'vitest';
import {
  offerApy,
  remainingStroops,
  repaymentProgress,
  totalDueStroops,
  totalYieldStroops,
  yieldEarnedStroops,
} from './yield';

const DAY = 86_400;
const offer = {
  amount: 1_000_000_000n, // 100 XLM
  amount_repaid: 0n,
  interest_rate: 500, // 5.00%
  duration: 30 * DAY,
  funded_at: 1_000_000,
};

describe('yield / repayment math', () => {
  it('computes simple-interest yield and total due', () => {
    expect(totalYieldStroops(offer)).toBe(50_000_000n); // 5% of principal
    expect(totalDueStroops(offer)).toBe(1_050_000_000n);
  });

  it('annualizes the agreed rate into an APY', () => {
    // 5% over 30 days → ~60.83% over a 365-day year.
    expect(offerApy(offer)).toBeCloseTo(60.83, 1);
    expect(offerApy({ interest_rate: 500, duration: 365 * DAY })).toBeCloseTo(5, 5);
    expect(offerApy({ interest_rate: 500, duration: 0 })).toBe(0);
  });

  it('accrues yield linearly from funded_at, capped at the total', () => {
    expect(yieldEarnedStroops(offer, offer.funded_at)).toBe(0n);
    expect(yieldEarnedStroops(offer, offer.funded_at + 15 * DAY)).toBe(25_000_000n);
    expect(yieldEarnedStroops(offer, offer.funded_at + 60 * DAY)).toBe(50_000_000n); // capped
    expect(yieldEarnedStroops({ ...offer, funded_at: 0 })).toBe(0n);
    expect(yieldEarnedStroops({ ...offer, duration: 0 })).toBe(0n);
  });

  it('keeps accrual arithmetic in bigint for amounts above Number.MAX_SAFE_INTEGER', () => {
    // 3_000_000_000_000_000n stroops (~300M XLM) — Number() would round it.
    const bigOffer = {
      amount: 3_000_000_000_000_000n,
      amount_repaid: 0n,
      interest_rate: 500,
      duration: 30 * DAY,
      funded_at: 1_000_000,
    };
    // Halfway: exact bigint division, no float rounding.
    expect(yieldEarnedStroops(bigOffer, bigOffer.funded_at + 15 * DAY)).toBe(75_000_000_000_000n);
    expect(yieldEarnedStroops(bigOffer, bigOffer.funded_at + 30 * DAY)).toBe(150_000_000_000_000n);
  });

  it('tracks remaining and repayment progress', () => {
    expect(remainingStroops(offer)).toBe(1_050_000_000n);
    expect(repaymentProgress(offer)).toBe(0);

    const halfRepaid = { ...offer, amount_repaid: 525_000_000n };
    expect(remainingStroops(halfRepaid)).toBe(525_000_000n);
    expect(repaymentProgress(halfRepaid)).toBeCloseTo(0.5, 5);

    const overpaid = { ...offer, amount_repaid: 2_000_000_000n };
    expect(remainingStroops(overpaid)).toBe(0n);
    expect(repaymentProgress(overpaid)).toBe(1);
  });
});