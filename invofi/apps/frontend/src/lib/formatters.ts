import { STROOPS_PER_XLM } from './constants';

export const DEFAULT_CURRENCY_STORAGE_KEY = 'invofi-default-currency';

/** Read the user's preferred display currency from localStorage, defaulting to
 *  'XLM' when none is stored or the environment has no Storage API. */
export function getDefaultCurrency(): string {
  if (typeof window === 'undefined') return 'XLM';
  try {
    const stored = window.localStorage.getItem(DEFAULT_CURRENCY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string;
      if (parsed === 'XLM' || parsed === 'USDC') return parsed;
    }
  } catch {
    /* localStorage unavailable — use default */
  }
  return 'XLM';
}

export function formatAmount(stroops: string | number | bigint, currency?: string): string {
  const units = Number(stroops) / STROOPS_PER_XLM;
  const cur = currency || getDefaultCurrency();
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(units) + ` ${cur}`;
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
