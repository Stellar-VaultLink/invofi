import { describe, expect, it } from 'vitest';
import {
  amountToStroops,
  formatAmount,
  toStroopsBigInt,
  INVOICE_STATUS_COLORS,
  OFFER_STATUS_COLORS,
} from './utils';

describe('monetary utilities', () => {
  it('converts whole, fractional, and zero amounts to stroops', () => {
    expect(amountToStroops('1')).toBe(10_000_000n);
    expect(amountToStroops('12.3456789')).toBe(123_456_789n);
    expect(amountToStroops('0')).toBe(0n);
  });

  it('preserves a negative sign and truncates excess fractional precision', () => {
    expect(amountToStroops('-1.25')).toBe(-12_500_000n);
    expect(amountToStroops('1.123456789')).toBe(11_234_567n);
    expect(amountToStroops('0.0000001')).toBe(1n);
  });

  it('honors a custom decimal precision', () => {
    expect(amountToStroops('42.5', 2)).toBe(4_250n);
    expect(formatAmount(4_250n, 2)).toBe('42.5');
  });

  it('formats stroops without losing the sign or insignificant precision', () => {
    expect(formatAmount(123_450_000n)).toBe('12.345');
    expect(formatAmount(-12_500_000n)).toBe('-1.25');
    expect(formatAmount(0n)).toBe('0');
  });

  it('normalizes contract stroops and Supabase human-unit strings', () => {
    expect(toStroopsBigInt(42n)).toBe(42n);
    expect(toStroopsBigInt('10000')).toBe(100_000_000_000n);
    expect(toStroopsBigInt('10000.01')).toBe(100_000_100_000n);
    expect(toStroopsBigInt('')).toBe(0n);
  });
});

// Dark-mode coverage (issue #173): every status badge used across the
// dashboard/marketplace/portfolio/invoice pages must carry a `dark:`
// variant for its background, text, and border so it stays readable when
// the `dark` class is applied to <html>, not just the light-mode default.
describe('status badge dark-mode coverage', () => {
  it('pairs every invoice status color with dark:bg/text/border variants', () => {
    for (const classes of Object.values(INVOICE_STATUS_COLORS)) {
      expect(classes).toMatch(/dark:bg-/);
      expect(classes).toMatch(/dark:text-/);
      expect(classes).toMatch(/dark:border-/);
    }
  });

  it('pairs every offer status color with dark:bg/text/border variants', () => {
    for (const classes of Object.values(OFFER_STATUS_COLORS)) {
      expect(classes).toMatch(/dark:bg-/);
      expect(classes).toMatch(/dark:text-/);
      expect(classes).toMatch(/dark:border-/);
    }
  });
});
