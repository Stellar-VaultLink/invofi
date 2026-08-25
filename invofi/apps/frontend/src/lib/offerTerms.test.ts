import { describe, it, expect } from 'vitest';
import {
  computeOfferTerms,
  formatPct,
  formatMoney,
  MIN_RATE_BPS,
  MAX_RATE_BPS,
  MIN_DURATION_DAYS,
  MAX_DURATION_DAYS,
} from './offerTerms';

describe('computeOfferTerms', () => {
  it('computes the acceptance example: 500 bps over 30 days on a 10,000 invoice', () => {
    const terms = computeOfferTerms('10000', 500, 30);
    expect(terms).not.toBeNull();
    expect(terms!.simpleRatePct).toBeCloseTo(5, 8);
    expect(terms!.interest).toBeCloseTo(500, 8);
    expect(terms!.totalRepayment).toBeCloseTo(10500, 8);
    // Annualized simple rate: 5% * 365/30
    expect(terms!.annualizedApr).toBeCloseTo(60.833_333, 4);
    // Annualized compounded rate over the term
    expect(terms!.annualizedApy).toBeCloseTo(79.585_6, 2);
    expect(terms!.rateOutOfRange).toBe(false);
    expect(terms!.durationOutOfRange).toBe(false);
  });

  it('accepts both string and numeric principal inputs', () => {
    const fromString = computeOfferTerms('2500.50', 1000, 60);
    const fromNumber = computeOfferTerms(2500.5, 1000, 60);
    expect(fromString).not.toBeNull();
    expect(fromNumber).not.toBeNull();
    expect(fromString!.principal).toBeCloseTo(fromNumber!.principal, 8);
    expect(fromString!.interest).toBeCloseTo(fromNumber!.interest, 8);
  });

  it('uses simple (non-compounded) contract math for repayment', () => {
    // 2,000 XLM at 400 bps over 90 days -> 4% simple interest
    // (400 bps = 4%; interest = principal * rateBps / 10_000 = 2000 * 0.04 = 80)
    const terms = computeOfferTerms('2000', 400, 90);
    expect(terms!.interest).toBeCloseTo(80, 8);
    expect(terms!.totalRepayment).toBeCloseTo(2080, 8);
    // Contract math never compounds within the term
    expect(terms!.totalRepayment).toBeLessThan(2000 * Math.pow(1.08, 1));
  });

  it('returns null for unparseable or non-positive principal', () => {
    expect(computeOfferTerms('', 500, 30)).toBeNull();
    expect(computeOfferTerms('abc', 500, 30)).toBeNull();
    expect(computeOfferTerms('0', 500, 30)).toBeNull();
    expect(computeOfferTerms('-100', 500, 30)).toBeNull();
    expect(computeOfferTerms('NaN', 500, 30)).toBeNull();
  });

  it('flags rates outside the contract-allowed range', () => {
    expect(computeOfferTerms('10000', MIN_RATE_BPS - 1, 30)!.rateOutOfRange).toBe(true);
    expect(computeOfferTerms('10000', MAX_RATE_BPS + 1, 30)!.rateOutOfRange).toBe(true);
    expect(computeOfferTerms('10000', MIN_RATE_BPS, 30)!.rateOutOfRange).toBe(false);
    expect(computeOfferTerms('10000', MAX_RATE_BPS, 30)!.rateOutOfRange).toBe(false);
  });

  it('flags durations outside the contract-allowed range', () => {
    expect(computeOfferTerms('10000', 500, MIN_DURATION_DAYS - 1)!.durationOutOfRange).toBe(true);
    expect(computeOfferTerms('10000', 500, MAX_DURATION_DAYS + 1)!.durationOutOfRange).toBe(true);
    expect(computeOfferTerms('10000', 500, MIN_DURATION_DAYS)!.durationOutOfRange).toBe(false);
    expect(computeOfferTerms('10000', 500, MAX_DURATION_DAYS)!.durationOutOfRange).toBe(false);
  });

  it('does not divide by zero for zero duration', () => {
    const terms = computeOfferTerms('10000', 500, 0);
    expect(terms).not.toBeNull();
    expect(terms!.durationOutOfRange).toBe(true);
    expect(Number.isFinite(terms!.annualizedApr)).toBe(true);
  });
});

describe('formatPct', () => {
  it('formats percentages with two fraction digits by default', () => {
    expect(formatPct(5)).toBe('5.00%');
    expect(formatPct(60.833_333)).toBe('60.83%');
  });

  it('honors a custom fraction digits argument', () => {
    expect(formatPct(5, 1)).toBe('5.0%');
  });
});

describe('formatMoney', () => {
  it('adds thousands separators', () => {
    expect(formatMoney(10500)).toBe('10,500');
    expect(formatMoney(1234567.5)).toBe('1,234,567.5');
  });
});