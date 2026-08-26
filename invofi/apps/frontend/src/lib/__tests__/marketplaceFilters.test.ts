import { describe, it, expect } from 'vitest';
import {
  filtersFromQuery,
  filtersToQuery,
  applyStatusAndAmountFilter,
  DEFAULT_MARKETPLACE_FILTERS,
  MarketplaceFilters,
} from '@/lib/marketplaceFilters';
import type { Currency, InvoiceStatus } from '@/types';

// Runtime: supabase returns amount as string, SDK type says bigint.
// Use as any to match the runtime shape the codebase relies on.
function makeInvoice(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'INV-001',
    originator: 'GBPLP3Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7',
    amount: '1500.00',
    currency: 'XLM' as Currency,
    status: 'Pending' as InvoiceStatus,
    created_at: '2026-08-01T00:00:00Z',
    due_date: 500000,
    ...overrides,
  };
}

describe('filtersFromQuery', () => {
  it('returns defaults for empty query', () => {
    expect(filtersFromQuery('')).toEqual(DEFAULT_MARKETPLACE_FILTERS);
  });

  it('parses known params', () => {
    const result = filtersFromQuery('currency=USDC&status=Financed&min_amount=500&max_amount=10000');
    expect(result).toEqual({
      currency: 'USDC' as Currency,
      status: 'Financed' as InvoiceStatus,
      minAmount: '500',
      maxAmount: '10000',
    });
  });

  it('ignores invalid currency values', () => {
    expect(filtersFromQuery('currency=ETH').currency).toBe('ALL');
  });

  it('ignores invalid status values', () => {
    expect(filtersFromQuery('status=Invalid').status).toBe('ALL');
  });

  it('handles partial params', () => {
    const result = filtersFromQuery('min_amount=100');
    expect(result.minAmount).toBe('100');
    expect(result.currency).toBe('ALL');
    expect(result.status).toBe('ALL');
    expect(result.maxAmount).toBe('');
  });
});

describe('filtersToQuery', () => {
  it('produces empty string for all defaults', () => {
    expect(filtersToQuery(DEFAULT_MARKETPLACE_FILTERS)).toBe('');
  });

  it('serializes non-default values', () => {
    const qs = filtersToQuery({ currency: 'USDC', status: 'ALL', minAmount: '500', maxAmount: '' });
    expect(qs).toContain('currency=USDC');
    expect(qs).toContain('min_amount=500');
    expect(qs).not.toContain('status=');
    expect(qs).not.toContain('max_amount=');
  });

  it('round-trips', () => {
    const input: MarketplaceFilters = {
      currency: 'XLM',
      status: 'Financed',
      minAmount: '1000',
      maxAmount: '50000',
    };
    expect(filtersFromQuery(filtersToQuery(input))).toEqual(input);
  });
});

describe('applyStatusAndAmountFilter', () => {
  const invoices: Invoice[] = [
    makeInvoice({ id: 'INV-001', amount: '500.00', status: 'Pending' }),
    makeInvoice({ id: 'INV-002', amount: '1500.00', status: 'Pending' }),
    makeInvoice({ id: 'INV-003', amount: '3000.00', status: 'Financed' }),
    makeInvoice({ id: 'INV-004', amount: '8000.00', status: 'Overdue' }),
  ];

  it('returns all when no filters active', () => {
    expect(applyStatusAndAmountFilter(invoices, DEFAULT_MARKETPLACE_FILTERS)).toHaveLength(4);
  });

  it('filters by minimum amount', () => {
    const result = applyStatusAndAmountFilter(invoices, { ...DEFAULT_MARKETPLACE_FILTERS, minAmount: '1000' });
    expect(result).toHaveLength(3);
    expect(result.map(i => i.id)).toEqual(['INV-002', 'INV-003', 'INV-004']);
  });

  it('filters by maximum amount', () => {
    const result = applyStatusAndAmountFilter(invoices, { ...DEFAULT_MARKETPLACE_FILTERS, maxAmount: '2000' });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.id)).toEqual(['INV-001', 'INV-002']);
  });

  it('filters by amount range', () => {
    const result = applyStatusAndAmountFilter(invoices, { ...DEFAULT_MARKETPLACE_FILTERS, minAmount: '1000', maxAmount: '5000' });
    expect(result).toHaveLength(2);
    expect(result.map(i => i.id)).toEqual(['INV-002', 'INV-003']);
  });

  it('filters by status', () => {
    const result = applyStatusAndAmountFilter(invoices, { ...DEFAULT_MARKETPLACE_FILTERS, status: 'Financed' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-003');
  });

  it('composes status and amount range', () => {
    const result = applyStatusAndAmountFilter(invoices, { currency: 'ALL', status: 'Pending', minAmount: '1000', maxAmount: '2000' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-002');
  });

  it('handles non-numeric min/max gracefully (ignores them)', () => {
    const result = applyStatusAndAmountFilter(invoices, { ...DEFAULT_MARKETPLACE_FILTERS, minAmount: 'abc', maxAmount: 'xyz' });
    expect(result).toHaveLength(4);
  });
});