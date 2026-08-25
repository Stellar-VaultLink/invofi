import { STROOPS_PER_XLM } from './constants';

export function formatAmount(stroops: string | number | bigint, currency: string = 'XLM'): string {
  const units = Number(stroops) / STROOPS_PER_XLM;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(units) + ` ${currency}`;
}

/**
 * Currency-aware display helper — alias for `formatAmount` with an explicit
 * name that makes the currency context clear. Produces e.g. "1.23 XLM".
 * Use this consistently for all amount displays to ensure every view shows
 * the currency alongside the numeric value.
 */
export function formatCurrencyAmount(
  stroops: string | number | bigint,
  currency: string = 'XLM',
): string {
  return formatAmount(stroops, currency);
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
