/**
 * Locale-aware value formatting (issue #227).
 *
 * Everything here goes through the platform `Intl` APIs rather than string
 * concatenation, because the differences between locales are not cosmetic:
 *
 * - Digit grouping and the decimal separator differ (`1,234.50` vs `1.234,50`
 *   vs the Arabic-Indic digits some `ar` regions default to).
 * - Currency *placement* is locale-dependent, and in RTL locales the symbol
 *   sits on the other side of the number. `Intl.NumberFormat` with
 *   `style: 'currency'` is the only thing that gets this right.
 * - Date field order differs (`Aug 24, 2026` vs `24 août 2026` vs
 *   `2026年8月24日`), which no format string can cover for twelve locales.
 * - Relative time ("3 days remaining") needs `Intl.RelativeTimeFormat`;
 *   English's single plural rule is wrong for Arabic (six forms) and for CJK
 *   (none).
 *
 * The pure functions below take an explicit locale so they are testable
 * without React; components should use the `useFormat()` hook in
 * `src/hooks/useFormat.ts`, which binds the reader's active locale.
 */

import { STROOPS_PER_XLM } from './constants';
import { toStroopsBigInt } from './utils';

/**
 * Assets InvoFi denominates in. `XLM` has no ISO 4217 code, so it cannot go
 * through `style: 'currency'`; it is formatted as a decimal with the ticker
 * appended in the locale's own writing order.
 */
const ISO_CURRENCIES: Record<string, string> = { USDC: 'USD' };

/** Stroops → a human amount, as a `number` safe for `Intl` (7 dp). */
function stroopsToUnits(stroops: bigint | number | string | null | undefined): number {
  const value = toStroopsBigInt(stroops);
  const whole = value / BigInt(STROOPS_PER_XLM);
  const fraction = value % BigInt(STROOPS_PER_XLM);
  return Number(whole) + Number(fraction) / STROOPS_PER_XLM;
}

/**
 * Formats an on-chain amount for display, e.g. `1.234,50 $` (de) or
 * `‏10,000.00 US$` (ar, with the symbol mirrored by the locale's own rules).
 */
export function formatCurrency(
  stroops: bigint | number | string | null | undefined,
  currency: string,
  locale: string,
  options: { maximumFractionDigits?: number } = {},
): string {
  const units = stroopsToUnits(stroops);
  const iso = ISO_CURRENCIES[currency];

  if (iso) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: iso,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
    }).format(units);
  }

  // XLM and any future non-ISO asset: locale-formatted number, ticker
  // appended after a non-breaking space so the amount and its ticker are
  // never split across a line break.
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: options.maximumFractionDigits ?? 7,
  }).format(units);
  return `${number}\u00A0${currency}`;
}

/** A plain locale-formatted number (no currency), e.g. counts and totals. */
export function formatNumber(
  value: number | bigint | string | null | undefined,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat(locale, options).format(numeric);
}

/** Basis points → a locale-formatted percentage, e.g. `5.00%` / `%5,00`. */
export function formatPercent(
  basisPoints: number | bigint | string | null | undefined,
  locale: string,
): string {
  const numeric = Number(basisPoints ?? 0);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric / 10_000);
}

/** Accepts Unix seconds, milliseconds, or an ISO string. */
function toDate(timestamp: number | bigint | string | null | undefined): Date | null {
  if (timestamp === null || timestamp === undefined || timestamp === '') return null;
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric) && numeric !== 0) {
    // Below ~1e11 the value is Unix *seconds*, above it milliseconds.
    return new Date(numeric < 1e11 ? numeric * 1000 : numeric);
  }
  const parsed = new Date(String(timestamp));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A date in the locale's own field order, e.g. `2026年8月24日`. */
export function formatDate(
  timestamp: number | bigint | string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = toDate(timestamp);
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** A date and time, for audit trails and event timelines. */
export function formatDateTime(
  timestamp: number | bigint | string | null | undefined,
  locale: string,
): string {
  return formatDate(timestamp, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Whole days between now and `timestamp`, negative when overdue. Split out so
 * the plural/overdue *wording* stays in the message catalogue (where Arabic
 * can supply its six plural forms) rather than being hardcoded here.
 */
export function daysUntil(timestamp: number | bigint | string | null | undefined): number | null {
  const date = toDate(timestamp);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/**
 * "in 3 days" / "3 days ago", in the reader's language and with the correct
 * plural form for it.
 */
export function formatRelativeDays(days: number, locale: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}

/**
 * A truncated Stellar address. Deliberately *not* localised: strkeys are
 * base32 identifiers, and the ellipsis stays visually centred in RTL because
 * the surrounding element carries `dir="ltr"`.
 */
export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}
