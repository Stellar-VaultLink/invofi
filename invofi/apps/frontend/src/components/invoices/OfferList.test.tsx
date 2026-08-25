import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfferList } from './OfferList';
import type { FinancingOffer, Invoice } from '@/types';

// ── Module mocks ────────────────────────────────────────────────────────────
// Wallet mock is a vi.fn() so each test can set the connected user's role.
const { useWalletMock, contractMocks, supabaseMock } = vi.hoisted(() => {
  const useWalletMock = vi.fn(() => ({ publicKey: 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT' }));
  const contractMocks = {
    createOffer: vi.fn(),
    acceptOffer: vi.fn(),
    rejectOffer: vi.fn(),
    repayInvoice: vi.fn(),
    markOverdue: vi.fn(),
    reclaimInvoice: vi.fn(),
  };
  const supabaseMock = {
    from: vi.fn(() => {
      const t: any = {
        select: vi.fn(() => t),
        eq: vi.fn(() => t),
        order: vi.fn(() => t),
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
        update: vi.fn(() => t),
        then: (cb: (r: any) => void) => Promise.resolve(cb({ data: [], error: null })),
      };
      return t;
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
    },
  };
  return { useWalletMock, contractMocks, supabaseMock };
});

vi.mock('@/components/auth/WalletProvider', () => ({
  useWallet: useWalletMock,
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/contract', () => contractMocks);
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

// Supabase chainable query stub for seed-data overrides.
function chain(data: any[] = []): any {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.then = (cb: (r: any) => void) => Promise.resolve(cb({ data, error: null }));
  return q;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const ORIGINATOR = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
const LENDER = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

const invoice: Invoice = {
  id: 'inv_1',
  originator: ORIGINATOR,
  amount: 10000000n,
  currency: 'USDC',
  due_date: 9999999999,
  status: 'Pending',
};

const offer: FinancingOffer = {
  id: 'offer_1',
  invoice_id: 'inv_1',
  lender: LENDER,
  amount: 10000000n,
  currency: 'USDC',
  interest_rate: 500,
  duration: 30 * 86_400,
  amount_repaid: 0n,
  status: 'Pending',
  funded_at: 0,
};

function renderList() {
  const onUpdate = vi.fn();
  render(<OfferList invoiceId="inv_1" invoice={invoice} onUpdate={onUpdate} />);
  return { onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  contractMocks.createOffer.mockResolvedValue({ ...offer, id: 'offer_new' });
  contractMocks.acceptOffer.mockResolvedValue({ ...offer, status: 'Accepted' });
});

describe('OfferList — optimistic UI (issue #191)', () => {
  // ── Accept flow (originator role) ──────────────────────────────────────────
  describe('accept_offer', () => {
    beforeEach(() => {
      useWalletMock.mockReturnValue({ publicKey: ORIGINATOR });
    });

    it('applies the accepted state immediately when the originator clicks Accept', async () => {
      supabaseMock.from.mockReturnValueOnce(
        chain([{ ...offer, amount: '10000', amount_repaid: '0' }]),
      );
      renderList();
      const acceptButtons = await screen.findAllByRole('button', { name: /accept/i });
      expect(acceptButtons.length).toBeGreaterThan(0);

      // Make acceptOffer hang so we can observe the optimistic state.
      let resolveAccept!: (o: FinancingOffer) => void;
      contractMocks.acceptOffer.mockReturnValue(new Promise<FinancingOffer>(res => { resolveAccept = res; }));

      fireEvent.click(acceptButtons[0]);

      // Optimistic: the offer badge flips to "Accepting…" immediately.
      await waitFor(() => {
        expect(screen.getByText('Accepting…')).toBeInTheDocument();
      });

      // Reconcile: resolve the contract call, pending badge disappears.
      await act(async () => {
        resolveAccept({ ...offer, status: 'Accepted' });
      });
      await waitFor(() => {
        expect(screen.getByText('Accepted')).toBeInTheDocument();
        expect(screen.queryByText('Accepting…')).not.toBeInTheDocument();
      });
    });

    it('rolls the offer state back to Pending when acceptance fails', async () => {
      supabaseMock.from.mockReturnValueOnce(
        chain([{ ...offer, amount: '10000', amount_repaid: '0' }]),
      );
      const { onUpdate } = renderList();
      const acceptButtons = await screen.findAllByRole('button', { name: /accept/i });

      contractMocks.acceptOffer.mockRejectedValue(new Error('tx failed'));
      fireEvent.click(acceptButtons[0]);

      // Optimistic: Accepting… appears, then the error rolls back to Pending.
      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.queryByText('Accepting…')).not.toBeInTheDocument();
      });
      // Invoice status was rolled back too.
      expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Pending' }));
    });
  });

  // ── Create flow (lender role) ─────────────────────────────────────────────
  describe('create_offer', () => {
    beforeEach(() => {
      useWalletMock.mockReturnValue({ publicKey: LENDER });
    });

    it('shows a Submitting badge immediately while createOffer is in flight, then reconciles', async () => {
      renderList();
      // Open the offer form.
      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));

      let resolveCreate!: (o: FinancingOffer) => void;
      contractMocks.createOffer.mockReturnValue(new Promise<FinancingOffer>(res => { resolveCreate = res; }));

      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '2500' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      // Optimistic: a Submitting… card appears instantly, before the contract resolves.
      await waitFor(() => {
        expect(screen.getByText('Submitting…')).toBeInTheDocument();
      });

      // Reconcile with the authoritative offer.
      await act(async () => {
        resolveCreate({ ...offer, id: 'offer_new', amount: 250000000n });
      });
      await waitFor(() => {
        expect(screen.queryByText('Submitting…')).not.toBeInTheDocument();
      });
    });

    it('removes the optimistic card and reopens the form when createOffer fails', async () => {
      renderList();
      fireEvent.click(screen.getByRole('button', { name: /make offer/i }));

      contractMocks.createOffer.mockRejectedValue(new Error('insufficient balance'));
      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '2500' } });
      fireEvent.click(screen.getByRole('button', { name: /submit offer/i }));

      // The optimistic card appears and then disappears on rollback.
      await waitFor(() => {
        expect(screen.getByText('Submitting…')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.queryByText('Submitting…')).not.toBeInTheDocument();
        // Form reopened with the lender's values intact for retry.
        expect(screen.getByText('New Financing Offer')).toBeInTheDocument();
      });
    });
  });
});