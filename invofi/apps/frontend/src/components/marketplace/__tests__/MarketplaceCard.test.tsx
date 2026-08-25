import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import type { Invoice } from '@/types';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-001',
    originator: 'GBPLP3Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y',
    amount: '10000000',
    currency: 'XLM',
    status: 'Pending',
    due_date: Math.floor(Date.now() / 1000) + 86400 * 10,
    created_at: new Date().toISOString(),
    ...overrides,
  } as Invoice;
}

describe('MarketplaceCard', () => {
  it('renders invoice amount and currency', () => {
    render(<MarketplaceCard invoice={makeInvoice()} />);
    expect(screen.getByText(/XLM/)).toBeInTheDocument();
  });

  it('renders invoice status badge', () => {
    render(<MarketplaceCard invoice={makeInvoice({ status: 'Financed' })} />);
    expect(screen.getByText('Financed')).toBeInTheDocument();
  });

  it('renders a "Make Offer" link to the invoice detail page', () => {
    const invoice = makeInvoice({ id: 'INV-999' });
    render(<MarketplaceCard invoice={invoice} />);
    const link = screen.getByRole('link', { name: /make offer/i });
    expect(link).toHaveAttribute('href', '/invoices/INV-999');
  });

  it('shows overdue label for past-due invoices', () => {
    const pastDue = Math.floor(Date.now() / 1000) - 86400 * 3;
    render(<MarketplaceCard invoice={makeInvoice({ due_date: pastDue })} />);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('shows days remaining label for near-due invoices', () => {
    const nearDue = Math.floor(Date.now() / 1000) + 86400 * 3;
    render(<MarketplaceCard invoice={makeInvoice({ due_date: nearDue })} />);
    expect(screen.getByText(/Due in 3d/i)).toBeInTheDocument();
  });
});
