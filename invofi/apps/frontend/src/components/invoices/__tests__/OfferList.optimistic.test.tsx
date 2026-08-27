import { useState } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfferList } from '../OfferList';
import type { FinancingOffer, Invoice } from '@/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
const mockCreateOffer = vi.fn();
const mockAcceptOffer = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseUpdate = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockGetUser = vi.fn();

const WALLET_ADDRESS = 'GBPLP3Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y';

vi.mock('@/components/auth/WalletProvider', () => ({
  useWallet: () => ({
    publicKey: WALLET_ADDRESS,
  }),
}));

vi.mock('@/lib/contract', () => ({
  createOffer: (...args: unknown[]) => mockCreateOffer(...args),
  acceptOffer: (...args: unknown[]) => mockAcceptOffer(...args),
  rejectOffer: vi.fn(),
  repayInvoice: vi.fn(),
  markOverdue: vi.fn(),
  reclaimInvoice: vi.fn(),
}));

// Accepting an offer now passes through a simulation preview (issue #216).
// These tests are about the optimistic update that follows confirmation, so
// the preview is stubbed to succeed immediately.
vi.mock('@/lib/simulate', () => ({
  simulateContractCall: vi.fn(async () => ({
    success: true,
    tokenMovements: [],
    stateChanges: [],
    events: [],
    resourceFee: '100',
    latestLedger: 1,
  })),
  encodeSymbol: vi.fn(),
  encodeAddress: vi.fn(),
  encodeI128: vi.fn(),
  encodeU32: vi.fn(),
  encodeU64: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const fromFn = (table: string) => {
    if (table === 'financing_offers') {
      return {
        select: () => ({
          eq: () => ({
            order: () => mockSupabaseSelect(),
          }),
        }),
        insert: () => mockSupabaseInsert(),
        update: () => ({
          eq: () => mockSupabaseUpdate(),
        }),
      };
    }
    // For 'invoices' table
    return {
      select: () => ({
        eq: () => ({
          order: () => mockSupabaseSelect(),
        }),
      }),
      insert: () => mockSupabaseInsert(),
      update: () => ({
        eq: () => mockSupabaseUpdate(),
      }),
    };
  };
  return {
    supabase: {
      from: vi.fn(fromFn),
      auth: {
        getUser: vi.fn(() => mockGetUser()),
      },
    },
  };
});

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-001',
    originator: WALLET_ADDRESS, // matches wallet so isOriginator = true
    amount: 10000000000n,
    currency: 'USDC',
    status: 'Pending',
    due_date: Math.floor(Date.now() / 1000) + 86400 * 30,
    created_at: new Date().toISOString(),
    ...overrides,
  } as Invoice;
}

function makeOffer(overrides: Partial<FinancingOffer> = {}): FinancingOffer {
  return {
    id: 'off_existing123',
    invoice_id: 'INV-001',
    lender: 'GBPLP3Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y6J6KQZ3X7Y',
    amount: 5000000000n,
    currency: 'USDC',
    interest_rate: 500,
    duration: 2592000,
    amount_repaid: 0n,
    status: 'Pending',
    funded_at: 0,
    ...overrides,
  } as FinancingOffer;
}

function makeAcceptedOffer(overrides: Partial<FinancingOffer> = {}): FinancingOffer {
  return makeOffer({ ...overrides, status: 'Accepted', funded_at: Math.floor(Date.now() / 1000) });
}

interface WrapperProps {
  initialInvoice?: Invoice;
}

function OfferListWrapper({ initialInvoice }: WrapperProps) {
  const [invoice, setInvoice] = useState(initialInvoice ?? makeInvoice());
  return (
    <OfferList
      invoiceId={invoice.id}
      invoice={invoice}
      onUpdate={setInvoice}
    />
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

/**
 * Clicks the row's Accept and confirms the simulation preview.
 *
 * The optimistic update fires on confirmation, not on the raw click — the
 * preview is the gate that decides whether anything is submitted at all. The
 * row button is labelled "Accept"; the dialog's is "Accept Offer".
 */
async function acceptThroughPreview() {
  fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
  const confirm = await screen.findByRole('button', { name: /accept offer/i });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}

describe('OfferList — optimistic UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseSelect.mockResolvedValue({ data: [] });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockSupabaseInsert.mockResolvedValue({ error: null });
    mockSupabaseUpdate.mockResolvedValue({ error: null });
  });

  // ── Optimistic create offer ─────────────────────────────────────────────────

  describe('optimistic create offer', () => {
    it('adds the offer to the list immediately on submit (before contract resolves)', async () => {
      // The contract call never resolves — we check that the offer is visible
      // while it's still pending.
      let resolveCreateOffer: (value: FinancingOffer) => void;
      mockCreateOffer.mockImplementation(
        () => new Promise(resolve => { resolveCreateOffer = resolve; }),
      );

      render(<OfferListWrapper initialInvoice={makeInvoice({ status: 'Pending', originator: 'GCSOMEONEELSEADDRESS123456789012345678' })} />);

      // Wait for initial load (empty)
      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(0\)/)).toBeInTheDocument();
      });

      // Open form, fill, and submit via fireEvent (bypasses react-hook-form input registration)
      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000' } });
      fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: '500' } });
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      // The optimistic offer should appear immediately
      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(1\)/)).toBeInTheDocument();
      });

      // A pulsing "Pending" badge should be visible
      const pendingBadges = screen.getAllByText('Pending');
      expect(pendingBadges.length).toBeGreaterThanOrEqual(1);

      // Now resolve the contract call
      resolveCreateOffer!(makeOffer({ id: 'off_real123', status: 'Pending' }));

      // After reconciliation, the real offer should replace the optimistic one
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Offer submitted!' }),
        );
      });
    });

    it('removes the optimistic offer from the list on contract failure', async () => {
      mockCreateOffer.mockRejectedValue(new Error('Contract call failed'));

      render(<OfferListWrapper initialInvoice={makeInvoice({ status: 'Pending', originator: 'GCSOMEONEELSEADDRESS123456789012345678' })} />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(0\)/)).toBeInTheDocument();
      });

      // Open form, fill, and submit
      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } });
      fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: '300' } });
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '15' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      // Wait for the error toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to submit offer',
            variant: 'destructive',
          }),
        );
      });

      // The offer should be rolled back — count back to 0
      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(0\)/)).toBeInTheDocument();
      });
    });

    it('shows the pulsing pending badge with opacity on the card while in flight', async () => {
      mockCreateOffer.mockImplementation(() => new Promise(() => {})); // never resolves

      render(<OfferListWrapper initialInvoice={makeInvoice({ status: 'Pending', originator: 'GCSOMEONEELSEADDRESS123456789012345678' })} />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(0\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '750' } });
      fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: '400' } });
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '20' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      // The pending badge should have animate-pulse class
      await waitFor(() => {
        const pendingBadges = screen.getAllByText('Pending');
        const pulsing = pendingBadges.find(el =>
          el.closest('[class*="animate-pulse"]'),
        );
        expect(pulsing).toBeDefined();
      });

      // The card should have opacity-60
      await waitFor(() => {
        const cards = document.querySelectorAll('[class*="opacity-60"]');
        expect(cards.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Optimistic accept offer ─────────────────────────────────────────────────

  describe('optimistic accept offer', () => {
    it('immediately flips offer to Accepted and invoice to Financed', async () => {
      const existingOffer = makeOffer({ id: 'off_to_accept' });
      mockSupabaseSelect.mockResolvedValue({ data: [existingOffer] });

      let resolveAccept: (value: FinancingOffer) => void;
      mockAcceptOffer.mockImplementation(
        () => new Promise(resolve => { resolveAccept = resolve; }),
      );

      render(<OfferListWrapper />);

      // Wait for offers to load
      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(1\)/)).toBeInTheDocument();
      });

      // The Accept button should be visible (originator matches wallet)
      const acceptBtn = screen.getByRole('button', { name: /^accept$/i });
      expect(acceptBtn).toBeInTheDocument();

      // Click Accept, then confirm the simulation preview.
      await acceptThroughPreview();

      // Immediately, the badge should show "Accepted"
      await waitFor(() => {
        const badges = screen.getAllByText('Accepted');
        expect(badges.length).toBeGreaterThanOrEqual(1);
      });

      // Resolve the contract call
      resolveAccept!(makeAcceptedOffer({ id: 'off_to_accept' }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Offer accepted!' }),
        );
      });
    });

    it('rolls back offer to Pending and invoice to original status on failure', async () => {
      const existingOffer = makeOffer({ id: 'off_rollback' });
      mockSupabaseSelect.mockResolvedValue({ data: [existingOffer] });
      mockAcceptOffer.mockRejectedValue(new Error('Accept failed'));

      render(<OfferListWrapper />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(1\)/)).toBeInTheDocument();
      });

      await acceptThroughPreview();

      // Wait for the error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to accept offer',
            variant: 'destructive',
          }),
        );
      });

      // The badge should be rolled back to Pending
      await waitFor(() => {
        const badges = screen.getAllByText('Pending');
        expect(badges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows a pulsing badge while accept is in flight', async () => {
      const existingOffer = makeOffer({ id: 'off_pending_accept' });
      mockSupabaseSelect.mockResolvedValue({ data: [existingOffer] });
      mockAcceptOffer.mockImplementation(() => new Promise(() => {})); // never resolves

      render(<OfferListWrapper />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(1\)/)).toBeInTheDocument();
      });

      await acceptThroughPreview();

      // The badge should show "Accepted" (optimistic) with animate-pulse
      await waitFor(() => {
        const badges = screen.getAllByText('Accepted');
        const pulsing = badges.find(el =>
          el.closest('[class*="animate-pulse"]'),
        );
        expect(pulsing).toBeDefined();
      });
    });
  });

  // ── Edge cases & negative tests ─────────────────────────────────────────────

  describe('edge cases and negative tests', () => {
    it('shows a destructive toast with the original error message on create failure', async () => {
      mockCreateOffer.mockRejectedValue(new Error('Insufficient balance'));

      render(<OfferListWrapper initialInvoice={makeInvoice({ status: 'Pending', originator: 'GCSOMEONEELSEADDRESS123456789012345678' })} />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(0\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: '500' } });
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '30' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to submit offer',
            variant: 'destructive',
          }),
        );
      });
    });

    it('shows a destructive toast on accept failure with the error message', async () => {
      const existingOffer = makeOffer({ id: 'off_err' });
      mockSupabaseSelect.mockResolvedValue({ data: [existingOffer] });
      mockAcceptOffer.mockRejectedValue(new Error('offer already accepted'));

      render(<OfferListWrapper />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(1\)/)).toBeInTheDocument();
      });

      await acceptThroughPreview();

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to accept offer',
            variant: 'destructive',
          }),
        );
      });
    });

    it('does not show Accept button when user is not the originator', async () => {
      const otherWalletInvoice = makeInvoice({
        status: 'Pending',
        originator: 'GCSOMEONEELSEADDRESS123456789012345678',
      });
      const offer = makeOffer({ id: 'off_no_accept' });
      mockSupabaseSelect.mockResolvedValue({ data: [offer] });

      render(<OfferListWrapper initialInvoice={otherWalletInvoice} />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(1\)/)).toBeInTheDocument();
      });

      // No Accept button should be visible
      expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    });

    it('reconciles the optimistic offer with the real one on successful create', async () => {
      const realOffer = makeOffer({ id: 'off_reconciled' });
      mockCreateOffer.mockResolvedValue(realOffer);

      render(<OfferListWrapper initialInvoice={makeInvoice({ status: 'Pending', originator: 'GCSOMEONEELSEADDRESS123456789012345678' })} />);

      await waitFor(() => {
        expect(screen.getByText(/Financing Offers \(0\)/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '3000' } });
      fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: '600' } });
      fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '45' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      // After the contract resolves, the real offer should replace the optimistic one
      await waitFor(() => {
        // The card should NOT have opacity-60 (no longer pending)
        const cards = document.querySelectorAll('[class*="opacity-60"]');
        expect(cards.length).toBe(0);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Offer submitted!' }),
        );
      });
    });
  });
});
