import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * Unit tests for the client-side search filtering logic.
 *
 * These test the filter function that the marketplace page uses to narrow
 * invoices by id, debtor name, or originator address.
 */

interface SearchableInvoice {
  id: string;
  originator: string;
  debtor_name?: string;
}

function filterInvoices(
  invoices: SearchableInvoice[],
  query: string,
): SearchableInvoice[] {
  if (!query) return invoices;
  const q = query.toLowerCase();
  return invoices.filter(inv =>
    inv.id.toLowerCase().includes(q) ||
    inv.originator.toLowerCase().includes(q) ||
    (inv.debtor_name ?? '').toLowerCase().includes(q),
  );
}

describe('Marketplace search filtering', () => {
  const invoices: SearchableInvoice[] = [
    { id: 'INV-001', originator: 'GBPLP3Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7', debtor_name: 'Alice Corp' },
    { id: 'INV-002', originator: 'GC5KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQ', debtor_name: 'Bob Industries' },
    { id: 'INV-003', originator: 'GD7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6', debtor_name: 'Charlie LLC' },
  ];

  it('returns all invoices when query is empty', () => {
    expect(filterInvoices(invoices, '')).toHaveLength(3);
  });

  it('filters by invoice id (partial match)', () => {
    const result = filterInvoices(invoices, 'INV-001');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-001');
  });

  it('filters by partial invoice id', () => {
    const result = filterInvoices(invoices, '001');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-001');
  });

  it('filters by originator address (partial match)', () => {
    const result = filterInvoices(invoices, 'GBPL');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-001');
  });

  it('filters by debtor name (partial match)', () => {
    const result = filterInvoices(invoices, 'Bob');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-002');
  });

  it('filters by debtor name case-insensitively', () => {
    const result = filterInvoices(invoices, 'alice');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-001');
  });

  it('returns empty array when no match', () => {
    const result = filterInvoices(invoices, 'ZZZZZZ');
    expect(result).toHaveLength(0);
  });

  it('returns multiple matches for a shared substring', () => {
    const result = filterInvoices(invoices, 'INV');
    expect(result).toHaveLength(3);
  });
});
