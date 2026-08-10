import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import type { InvoiceStatus, OfferStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(stroops: bigint | number | string | null | undefined, decimals = 7): string {
  const bStroops = toStroopsBigInt(stroops);
  const divisor = BigInt(10 ** decimals);
  const whole = bStroops / divisor;
  const remainder = bStroops % divisor;
  const positiveRemainder = remainder < 0n ? -remainder : remainder;
  const fraction = positiveRemainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
}

export function amountToStroops(amount: string, decimals = 7): bigint {
  const isNegative = (amount || '').trim().startsWith('-');
  const clean = (amount || '0').replace('-', '').trim();
  const [whole = '0', fraction = ''] = clean.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const result = BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(paddedFraction || '0');
  return isNegative ? -result : result;
}

/**
 * Coerce an amount to stroops as a bigint, tolerating both sources:
 * - contract reads return i128 (bigint) already in stroops — passed through
 * - the Supabase mirror stores human-unit strings (raw form input for `amount`,
 *   `formatAmount()` output for `amount_repaid`) — all valid numeric strings are
 *   converted as human units, whether or not they contain a decimal point
 *   ("10000" and "10000.00" both mean 10⁷ stroops)
 */
export function toStroopsBigInt(value: bigint | number | string | null | undefined): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return 0n;
    if (/^\d+(\.\d{1,7})?$/.test(s)) return amountToStroops(s);
    return BigInt(s || '0');
  }
  return 0n;
}

export function formatDate(timestamp: number | bigint | string): string {
  const ts = Number(timestamp);
  if (!ts || isNaN(ts)) return '-';
  return format(new Date(ts * 1000), 'MMM d, yyyy');
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function interestRateLabel(basisPoints: number | bigint | string): string {
  return `${(Number(basisPoints) / 100).toFixed(2)}%`;
}

export function durationLabel(seconds: number | bigint | string): string {
  const days = Math.floor(Number(seconds) / 86_400);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  Pending:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  Financed:  'bg-blue-100 text-blue-800 border-blue-200',
  Repaid:    'bg-green-100 text-green-800 border-green-200',
  Overdue:   'bg-red-100 text-red-800 border-red-200',
  Cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  Disputed:  'bg-purple-100 text-purple-800 border-purple-200',
  Defaulted: 'bg-orange-100 text-orange-800 border-orange-200',
};

export const OFFER_STATUS_COLORS: Record<OfferStatus, string> = {
  Pending:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  Accepted:  'bg-blue-100 text-blue-800 border-blue-200',
  Financed:  'bg-indigo-100 text-indigo-800 border-indigo-200',
  Rejected:  'bg-red-100 text-red-800 border-red-200',
  Repaid:    'bg-green-100 text-green-800 border-green-200',
  Defaulted: 'bg-orange-100 text-orange-800 border-orange-200',
};

export function generateInvoiceId(): string {
  return `inv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function generateOfferId(): string {
  return `off_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
