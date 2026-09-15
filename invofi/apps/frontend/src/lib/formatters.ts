import { STROOPS_PER_XLM } from './constants';

export const DEFAULT_DISPLAY_CURRENCY_STORAGE_KEY = 'invofi:default-currency';
export const DEFAULT_CURRENCY = 'XLM';

/**
 * Returns the configured default display currency from localStorage, falling back to 'XLM'.
 */
export function getDefaultCurrency(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(DEFAULT_DISPLAY_CURRENCY_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'string' && parsed.trim()) {
            return parsed.trim();
          }
        } catch {
          if (typeof stored === 'string' && stored.trim()) {
            return stored.trim();
          }
        }
      }
    } catch {
      // private mode / quota exceeded / unavailable
    }
  }
  return DEFAULT_CURRENCY;
}

export const getDefaultDisplayCurrency = getDefaultCurrency;

/**
 * Format a stroops-denominated amount for display.
 *
 * Converts stroops (1 XLM = 10^7 stroops) to human units and renders them with
 * a two-decimal Intl representation plus a trailing currency code suffix,
 * e.g. `formatAmount(12_345_678, 'XLM')` → `"1.23 XLM"`.
 *
 * @remarks
 * Rounding rules (identical on every page, per issue #123):
 * - always exactly 2 fraction digits, en-US locale with thousands separators
 * - negative inputs format with a leading minus sign (`-1.23 XLM`)
 * - the currency code is appended as `" 1.23 XLM"` (not `$`/`€` symbols)
 * This helper does NOT perform currency conversion.
 */
export function formatAmount(
  stroops: string | number | bigint,
  currency: string = getDefaultCurrency(),
): string {
  const units = Number(stroops) / STROOPS_PER_XLM;
  return formatUnits(units, currency);
}

/**
 * Format an amount that is already in human units (not stroops) for display.
 * e.g. a Horizon `getXlmBalance` string `"12.3456789"` → `"12.35 XLM"`.
 * See {@link formatAmount} for the shared rounding rules.
 */
export function formatUnits(
  units: string | number,
  currency: string = getDefaultCurrency(),
): string {
  const code = currency || getDefaultCurrency();
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(units)) + ` ${code}`;
}

/**
 * Currency-aware display helper — alias for `formatAmount` with an explicit
 * name that makes the currency context clear. Produces e.g. "1.23 XLM".
 * Use this consistently for all amount displays to ensure every view shows
 * the currency alongside the numeric value.
 */
export function formatCurrencyAmount(
  stroops: string | number | bigint,
  currency: string = getDefaultCurrency(),
): string {
  return formatAmount(stroops, currency);
}

/**
 * Format a (amount, currency) pair for display — same output as
 * {@link formatAmount} but accepts inputs already in human units.
 * Produces e.g. "1.23 XLM".
 */
export function formatCurrencyPair(
  units: string | number,
  currency: string = getDefaultCurrency(),
): string {
  return formatUnits(units, currency);
}

export function formatBasisPoints(bps: number | bigint | string): string {
  return (Number(bps) / 100).toFixed(2) + '%';
}

export function formatDate(ts: number | string | bigint): string {
  const tsNum = Number(ts);
  const date = !isNaN(tsNum) && tsNum < 1e11 ? new Date(tsNum * 1000) : new Date(tsNum || String(ts));
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

export function formatRelativeDate(ts: number | string | bigint): string {
  const tsNum = Number(ts);
  const date = !isNaN(tsNum) && tsNum < 1e11 ? new Date(tsNum * 1000) : new Date(tsNum || String(ts));
  const diff = date.getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d remaining`;
}

export function formatWalletAddress(address: string, chars: number = 6): string {
  if (!address || address.length < chars * 2) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function formatDuration(seconds: number | bigint | string): string {
  const sec = Number(seconds);
  const days = Math.floor(sec / 86_400);
  if (days >= 1) return `${days} day${days !== 1 ? 's' : ''}`;
  const hours = Math.floor(sec / 3_600);
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}