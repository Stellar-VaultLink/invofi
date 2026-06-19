import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import type { InvoiceStatus, OfferStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(stroops: bigint, decimals = 7): string {
  const divisor = BigInt(10 ** decimals);
  const whole = stroops / divisor;
  const fraction = (stroops % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
}

export function amountToStroops(amount: string, decimals = 7): bigint {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction);
}

export function formatDate(timestamp: number): string {
  return format(new Date(timestamp * 1000), 'MMM d, yyyy');
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function interestRateLabel(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export function durationLabel(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
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
};

export const OFFER_STATUS_COLORS: Record<OfferStatus, string> = {
  Pending:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  Accepted:  'bg-blue-100 text-blue-800 border-blue-200',
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
