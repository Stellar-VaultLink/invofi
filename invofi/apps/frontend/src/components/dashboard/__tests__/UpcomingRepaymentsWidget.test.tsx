import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UpcomingRepaymentsWidget } from '@/components/dashboard/UpcomingRepaymentsWidget';
import type { Invoice } from '@/types';

function makeInvoice(overrides: Partial<Invoice> & { id: string; due_date: number }): Invoice {
  return {
    originator: 'GAAAA...',
    amount: 10_000_000n, // 1 XLM
    currency: 'XLM',
    status: 'Financed' as const,
    ...overrides,
  };
}

describe('UpcomingRepaymentsWidget', () => {
  it('shows the empty message when no financed invoices', () => {
    render(<UpcomingRepaymentsWidget invoices={[]} />);
    expect(screen.getByText(/No financed invoices/i)).toBeInTheDocument();
  });

  it('shows the empty message when invoices exist but none are Financed', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', status: 'Pending' as const, due_date: 1_800_000_000 }),
      makeInvoice({ id: 'inv-2', status: 'Repaid' as const, due_date: 1_800_000_000 }),
    ];
    render(<UpcomingRepaymentsWidget invoices={invoices} />);
    expect(screen.getByText(/No financed invoices/i)).toBeInTheDocument();
  });

  it('renders a single Financed invoice', () => {
    const invoices = [makeInvoice({ id: 'inv-abc', due_date: 1_800_000_000 })];
    render(<UpcomingRepaymentsWidget invoices={invoices} />);
    expect(screen.getByText('inv-abc')).toBeInTheDocument();
    expect(screen.getByText(/1\.00 XLM/)).toBeInTheDocument();
    // Should link to the invoice detail page
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/invoices/inv-abc');
  });

  it('sorts Financed invoices by due date (ascending)', () => {
    const invoices = [
      makeInvoice({ id: 'inv-later', due_date: 1_800_000_000 }),
      makeInvoice({ id: 'inv-sooner', due_date: 1_700_000_000 }),
    ];
    render(<UpcomingRepaymentsWidget invoices={invoices} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/invoices/inv-sooner');
    expect(links[1]).toHaveAttribute('href', '/invoices/inv-later');
  });

  it('filters out non-Financed invoices', () => {
    const invoices = [
      makeInvoice({ id: 'inv-financed', status: 'Financed' as const, due_date: 1_800_000_000 }),
      makeInvoice({ id: 'inv-pending', status: 'Pending' as const, due_date: 1_800_000_000 }),
      makeInvoice({ id: 'inv-repaid', status: 'Repaid' as const, due_date: 1_800_000_000 }),
    ];
    render(<UpcomingRepaymentsWidget invoices={invoices} />);
    expect(screen.getByText('inv-financed')).toBeInTheDocument();
    expect(screen.queryByText('inv-pending')).not.toBeInTheDocument();
    expect(screen.queryByText('inv-repaid')).not.toBeInTheDocument();
  });
});