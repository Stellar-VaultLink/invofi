import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  daysUntil,
  formatAddress,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeDays,
} from './intl';

/** 10,000.00 in stroops (7 dp). */
const TEN_THOUSAND = 100_000_000_000n;

/** The amount and its ticker are joined by U+00A0 so they never line-break. */
const NBSP = '\u00A0';

describe('formatCurrency', () => {
  it('groups digits the way each locale does', () => {
    // German swaps the roles of "." and ",", so a hardcoded en-US format is
    // not merely ugly there — it reads as a different number.
    expect(formatCurrency(TEN_THOUSAND, 'XLM', 'en')).toBe(`10,000${NBSP}XLM`);
    expect(formatCurrency(TEN_THOUSAND, 'XLM', 'de')).toBe(`10.000${NBSP}XLM`);
  });

  it('places the currency symbol per locale for ISO-coded assets', () => {
    const en = formatCurrency(TEN_THOUSAND, 'USDC', 'en');
    const fr = formatCurrency(TEN_THOUSAND, 'USDC', 'fr');
    expect(en.startsWith('$')).toBe(true);
    // French puts the symbol after the amount — the exact spacing character is
    // an ICU implementation detail, so assert on placement, not on the string.
    expect(fr.startsWith('$')).toBe(false);
    expect(fr.trimEnd().endsWith('$')).toBe(true);
  });

  it('keeps non-ISO tickers as a suffix rather than inventing a symbol', () => {
    expect(formatCurrency(TEN_THOUSAND, 'XLM', 'ja')).toContain('XLM');
  });

  it('handles fractional stroops without floating-point drift', () => {
    expect(formatCurrency(25_000_000n, 'XLM', 'en')).toBe(`2.5${NBSP}XLM`);
    expect(formatCurrency(1n, 'XLM', 'en')).toBe(`0.0000001${NBSP}XLM`);
  });
});

describe('formatPercent', () => {
  it('renders basis points in the locale’s percent convention', () => {
    expect(formatPercent(500, 'en')).toBe('5.00%');
    // Turkish writes the sign first.
    expect(formatPercent(500, 'tr').startsWith('%')).toBe(true);
  });
});

describe('formatDate', () => {
  const TS = 1_787_000_000; // Unix seconds

  it('orders date fields per locale', () => {
    const en = formatDate(TS, 'en');
    const ja = formatDate(TS, 'ja');
    expect(en).not.toBe(ja);
    // CJK is year-first; English is month-first. No single format string can
    // express both, which is the reason this goes through Intl.
    expect(ja.startsWith('2026')).toBe(true);
    expect(en.startsWith('2026')).toBe(false);
    // The long form marks each field with its CJK unit.
    expect(formatDate(TS, 'ja', { dateStyle: 'long' })).toMatch(/年/);
  });

  it('accepts seconds, milliseconds and ISO strings alike', () => {
    const fromSeconds = formatDate(TS, 'en');
    const fromMillis = formatDate(TS * 1000, 'en');
    const fromIso = formatDate(new Date(TS * 1000).toISOString(), 'en');
    expect(fromMillis).toBe(fromSeconds);
    expect(fromIso).toBe(fromSeconds);
  });

  it('renders a dash for missing or unparseable input', () => {
    expect(formatDate(null, 'en')).toBe('-');
    expect(formatDate(undefined, 'en')).toBe('-');
    expect(formatDate('not a date', 'en')).toBe('-');
  });

  it('includes a time component in formatDateTime', () => {
    expect(formatDateTime(TS, 'en').length).toBeGreaterThan(formatDate(TS, 'en').length);
  });
});

describe('relative days', () => {
  afterEach(() => vi.useRealTimers());

  it('counts whole days to the due date, negative when overdue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'));
    expect(daysUntil(Math.floor(Date.parse('2026-08-27T00:00:00Z') / 1000))).toBe(3);
    expect(daysUntil(Math.floor(Date.parse('2026-08-22T00:00:00Z') / 1000))).toBe(-2);
    expect(daysUntil(null)).toBeNull();
  });

  it('uses the language’s own plural rules', () => {
    // English has two plural forms, Japanese has none, Arabic has six — which
    // is exactly why this goes through Intl rather than `${n} days`.
    expect(formatRelativeDays(3, 'en')).toBe('in 3 days');
    expect(formatRelativeDays(1, 'en')).toBe('tomorrow');
    expect(formatRelativeDays(-1, 'en')).toBe('yesterday');
    expect(formatRelativeDays(3, 'ja')).not.toContain('days');
    expect(formatRelativeDays(3, 'ar')).toMatch(/[؀-ۿ]/);
  });
});

describe('formatNumber / formatAddress', () => {
  it('formats counts per locale and survives bad input', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(1234, 'de')).toBe('1.234');
    expect(formatNumber(undefined, 'en')).toBe('0');
    expect(formatNumber('abc', 'en')).toBe('-');
  });

  it('elides a strkey without localising it', () => {
    const address = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
    expect(formatAddress(address)).toBe('GCHV…OVMT');
    expect(formatAddress('short')).toBe('short');
  });
});
