import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/intl';
import { EscrowStatusesCard } from '@/components/portfolio/EscrowStatusesCard';
import type { FinancingOffer } from '@invofi/sdk';

/**
 * Verification for Epic 3.3: the portfolio escrow summary card renders one
 * row per escrowed position, counts lifecycle steps in a summary strip,
 * surfaces "unavailable" rows (read-model miss) instead of hiding them, and
 * renders nothing at all for portfolios without escrowed positions or when
 * the escrow rail is disabled.
 */

const escrowMock = vi.hoisted(() => ({
  enabled: true,
  snapshots: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/escrow', () => ({
  isEscrowEnabled: vi.fn(() => escrowMock.enabled),
  parseEscrowStatus: vi.fn((snap: Record<string, unknown>, contractId: string) => ({
    contractId,
    contractBaseId: null,
    flags: {
      disputed: (snap as { flags?: { disputed?: boolean } }).flags?.disputed === true,
      released: (snap as { flags?: { released?: boolean } }).flags?.released === true,
      resolved: false,
    },
    milestone: (snap as { milestone?: { approved?: boolean; status?: string } }).milestone ?? null,
    amount: null,
  })),
  getEscrowSnapshot: vi.fn(async (contractId: string) => {
    const snap = escrowMock.snapshots.get(contractId);
    if (!snap) throw new Error(`no read-model row for ${contractId}`);
    return snap;
  }),
  escrowStepOf: vi.fn((s: { flags: { released: boolean; disputed: boolean }; milestone: { approved: boolean } | null }) => {
    if (s.flags.released) return 'released';
    if (s.flags.disputed) return 'disputed';
    if (s.milestone?.approved) return 'releasable';
    if ((s.milestone as { status?: string } | null)?.status === 'completed') return 'awaitingApproval';
    return 'awaitingDelivery';
  }),
  escrowViewerUrl: vi.fn((cid: string) => `https://viewer.trustlesswork.com/escrow/${cid}`),
  ESCROW_VIEWER_URL_TEMPLATE: '',
}));

const CID_A = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1';
const CID_B = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2';
const CID_C = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3';

/** Fixture type: mirror-backed offer row (financing_offers carries the mapping). */
type OfferFixture = Partial<FinancingOffer> & { id: string; escrow_contract_id?: string | null };

function offer(overrides: OfferFixture): FinancingOffer {
  return {
    invoice_id: 'inv_1',
    lender: 'GLenderAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amount: 250_0000000n,
    currency: 'USDC',
    interest_rate: 5,
    duration: 30,
    amount_repaid: 0n,
    status: 'Financed',
    funded_at: 1_700_000_000,
    ...overrides,
  } as FinancingOffer;
}

beforeEach(() => {
  escrowMock.enabled = true;
  escrowMock.snapshots.clear();
});

describe('EscrowStatusesCard (Epic 3.3)', () => {
  it('renders nothing when the escrow rail is disabled', async () => {
    escrowMock.enabled = false;
    const offers = [offer({ id: 'o1', escrow_contract_id: CID_A })];
    render(<EscrowStatusesCard offers={offers} />);
    expect(screen.queryByTestId('escrow-statuses')).not.toBeInTheDocument();
  });

  it('renders nothing when no position carries an escrow mapping', async () => {
    const offers = [
      offer({ id: 'xlm', currency: 'XLM' }),
      offer({ id: 'usdc', currency: 'USDC' }),
    ];
    render(<EscrowStatusesCard offers={offers} />);
    expect(screen.queryByTestId('escrow-statuses')).not.toBeInTheDocument();
  });

  it('shows one row per escrowed position with amount and explorer link', async () => {
    escrowMock.snapshots.set(CID_A, { flags: { released: true }, milestone: null });
    const offers = [offer({ id: 'o1', escrow_contract_id: CID_A })];
    render(<EscrowStatusesCard offers={offers} />);

    expect(await screen.findByTestId('escrow-statuses')).toBeInTheDocument();
    expect(screen.getByTestId('escrow-row-o1')).toBeInTheDocument();
    // Contract id shown pinned LTR (font-mono row).
    expect(screen.getByText(CID_A)).toBeInTheDocument();
    // Explorer link points at the viewer with the contract id.
    const link = screen.getByRole('link', { name: 'View on Escrow Explorer' });
    expect(link).toHaveAttribute('href', `https://viewer.trustlesswork.com/escrow/${CID_A}`);
  });

  it('counts lifecycle steps in the summary strip', async () => {
    escrowMock.snapshots.set(CID_A, { flags: { released: true }, milestone: null });
    escrowMock.snapshots.set(CID_B, { flags: {}, milestone: { approved: false, status: 'completed' } });
    const offers = [
      offer({ id: 'o1', escrow_contract_id: CID_A }),
      offer({ id: 'o2', escrow_contract_id: CID_B }),
    ];
    render(<EscrowStatusesCard offers={offers} />);

    await screen.findByTestId('escrow-statuses');
    await waitFor(() => {
      expect(screen.getByTestId('escrow-count-released')).toHaveTextContent('Released: 1');
      expect(screen.getByTestId('escrow-count-awaitingApproval')).toHaveTextContent('Awaiting approval: 1');
    });
  });

  it('renders unavailable for a read-model miss and offers the refresh path', async () => {
    // CID_C has no row → maps to null.
    escrowMock.snapshots.set(CID_A, { flags: { released: true }, milestone: null });
    const offers = [
      offer({ id: 'o1', escrow_contract_id: CID_A }),
      offer({ id: 'o3', escrow_contract_id: CID_C }),
    ];
    render(<EscrowStatusesCard offers={offers} />);

    await screen.findByTestId('escrow-statuses');
    expect(await screen.findByText('Status unavailable')).toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    // The hint and the row-level badge — not a fake state.
    expect(screen.queryByTestId('escrow-row-o3')).toBeInTheDocument();
  });

  it('refresh button re-triggers reads after a repaired mapping', async () => {
    const user = userEvent.setup();
    const offers = [offer({ id: 'o1', escrow_contract_id: CID_A })];
    render(<EscrowStatusesCard offers={offers} />);

    // First pass: read-model miss → unavailable.
    await screen.findByTestId('escrow-statuses');
    expect(await screen.findByText('Status unavailable')).toBeInTheDocument();

    // The mapping is repaired / read model catches up.
    escrowMock.snapshots.set(CID_A, { flags: { released: true }, milestone: null });
    await user.click(screen.getByRole('button', { name: 'Refresh escrow statuses' }));

    // The row now shows the released badge instead of the miss.
    await waitFor(() => {
      expect(screen.getByTestId('escrow-count-released')).toHaveTextContent('Released: 1');
      expect(screen.queryByText('Status unavailable')).not.toBeInTheDocument();
    });
  });

  it('shows the actionable nudge when escrows need attention', async () => {
    escrowMock.snapshots.set(CID_B, { flags: { disputed: true }, milestone: null });
    const offers = [offer({ id: 'o2', escrow_contract_id: CID_B })];
    render(<EscrowStatusesCard offers={offers} />);

    await screen.findByTestId('escrow-statuses');
    expect(await screen.findByText(/needs attention/)).toBeInTheDocument();
  });
});
