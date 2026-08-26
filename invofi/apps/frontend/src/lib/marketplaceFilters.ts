import type { Currency, Invoice, InvoiceStatus } from '@/types';

/**
 * Marketplace browse-all filter state (issue #81).
 *
 * The marketplace page composes several independent narrowing mechanisms:
 *   - server-side:  status='Pending' + currency + searched id (useMarketplace)
 *   - client-side:  debounced search, status/currency selects, amount range,
 *                   and sort (this page)
 *
 * This module owns the *client-side* filter state shape plus the URL
 * query-parameter (de)serialization so lenders can share a filtered view
 * (e.g. "USDC, financed, 500–10,000") via a plain link.
 */

export interface MarketplaceFilters {
  currency: Currency | 'ALL';
  status: InvoiceStatus | 'ALL';
  /** String form so the number inputs can be bound 1:1 ('' = unset). */
  minAmount: string;
  maxAmount: string;
}

export const CURRENCY_OPTIONS: readonly Currency[] = ['XLM', 'USDC'];
export const STATUS_OPTIONS: readonly InvoiceStatus[] = [
  'Pending',
  'Financed',
  'Overdue',
];

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
  currency: 'ALL',
  status: 'ALL',
  minAmount: '',
  maxAmount: '',
};

/** Query-parameter names — keep in sync with anything that links to /marketplace. */
export const FILTER_QUERY_KEYS = {
  currency: 'currency',
  status: 'status',
  minAmount: 'min_amount',
  maxAmount: 'max_amount',
} as const;

function parseParam<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | 'ALL' {
  return raw !== null && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : 'ALL';
}

/**
 * Parse marketplace filter state from a URL query string (no leading '?').
 * Unknown/invalid values silently fall back to their defaults so a stale or
 * hand-edited link can never crash the page.
 */
export function filtersFromQuery(query: string): MarketplaceFilters {
  const params = new URLSearchParams(query);
  return {
    currency: parseParam<Currency>(params.get(FILTER_QUERY_KEYS.currency), CURRENCY_OPTIONS),
    status: parseParam<InvoiceStatus>(params.get(FILTER_QUERY_KEYS.status), STATUS_OPTIONS),
    minAmount: params.get(FILTER_QUERY_KEYS.minAmount) ?? '',
    maxAmount: params.get(FILTER_QUERY_KEYS.maxAmount) ?? '',
  };
}

/** Serialize filter state to a query string; '' when everything is a default. */
export function filtersToQuery(filters: MarketplaceFilters): string {
  const params = new URLSearchParams();
  if (filters.currency !== 'ALL') params.set(FILTER_QUERY_KEYS.currency, filters.currency);
  if (filters.status !== 'ALL') params.set(FILTER_QUERY_KEYS.status, filters.status);
  if (filters.minAmount) params.set(FILTER_QUERY_KEYS.minAmount, filters.minAmount);
  if (filters.maxAmount) params.set(FILTER_QUERY_KEYS.maxAmount, filters.maxAmount);
  return params.toString();
}

/**
 * Client-side status + amount-range composition over an already-fetched page
 * of invoices. Non-numeric min/max are ignored (treated as unset) — the inputs
 * are type=number so this only guards against hand-edited URLs.
 */
export function applyStatusAndAmountFilter(
  invoices: Invoice[],
  filters: MarketplaceFilters,
): Invoice[] {
  const min = filters.minAmount ? Number(filters.minAmount) : NaN;
  const max = filters.maxAmount ? Number(filters.maxAmount) : NaN;
  return invoices.filter(inv => {
    if (filters.status !== 'ALL' && inv.status !== filters.status) return false;
    const amount = Number(inv.amount);
    if (!Number.isNaN(min) && amount < min) return false;
    if (!Number.isNaN(max) && amount > max) return false;
    return true;
  });
}