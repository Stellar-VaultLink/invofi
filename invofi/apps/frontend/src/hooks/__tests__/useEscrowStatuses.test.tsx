import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useEscrowStatuses } from '@/hooks/useEscrowStatuses';
import type { FinancingOffer } from '@invofi/sdk';

/**
 * Verification for Epic 3.3 (portfolio-wide escrow status surface):
 * the hook reads a TW read-model snapshot per USDC offer that carries a
 * persisted escrow_contract_id, maps read failures to `null` (never a wrong
 * state), skips everything when the escrow rail is disabled, and supports
 * an explicit refresh that re-reads every escrow.
 */

// The escrow lib talks to `/api/escrow/*` — mock it at the boundary so the
// hook's branching (enable gate, failure mapping, refresh) is what's tested.
const escrowMock = vi.hoisted(() => ({
  enabled: true,
  snapshots: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/escrow', () => ({
  isEscrowEnabled: vi.fn(() => escrowMock.enabled),
  // Identity passthrough: the hook must store exactly what the parser
  // returned for the matching contract — no transformation of its own.
  parseEscrowStatus: vi.fn((snap: Record<string, unknown>) => snap),
  getEscrowSnapshot: vi.fn(async (contractId: string) => {
    const snap = escrowMock.snapshots.get(contractId);
    if (!snap) throw new Error(`no read-model row for ${contractId}`);
    return snap;
  }),
}));

const CID_A = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1';
const CID_B = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2';

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

describe('useEscrowStatuses (Epic 3.3)', () => {
  it('loads a snapshot for every USDC offer that has an escrow id', async () => {
    escrowMock.snapshots.set(CID_A, { flags: { released: true }, milestone: null });
    escrowMock.snapshots.set(CID_B, { flags: { disputed: true }, milestone: null });

    const offers = [
      offer({ id: 'o1', escrow_contract_id: CID_A }),
      offer({ id: 'o2', escrow_contract_id: CID_B }),
    ];

    const { result } = renderHook(() => useEscrowStatuses(offers));

    await waitFor(() => {
      expect(result.current.byOffer['o1']).toBeDefined();
      expect(result.current.byOffer['o2']).toBeDefined();
    });
    // Identity with the parser output — no re-shaping in between.
    expect(result.current.byOffer['o1']).toEqual({ flags: { released: true }, milestone: null });
    expect(result.current.byOffer['o2']).toEqual({ flags: { disputed: true }, milestone: null });
  });

  it('ignores offers without an escrow mapping (XLM positions, legacy rows)', async () => {
    const offers = [
      offer({ id: 'xlm', currency: 'XLM' }),
      offer({ id: 'usdc-no-escrow', currency: 'USDC' }),
    ];

    const { result } = renderHook(() => useEscrowStatuses(offers));

    await waitFor(() => {
      // Effect settled without fetching anything.
      expect(escrowMock.snapshots.size).toBe(0);
    });
    expect(Object.keys(result.current.byOffer)).toHaveLength(0);
  });

  it('maps a read-model miss or transient read failure to null', async () => {
    // No snapshot registered for CID_A → getEscrowSnapshot rejects.
    const offers = [offer({ id: 'o1', escrow_contract_id: CID_A })];

    const { result } = renderHook(() => useEscrowStatuses(offers));

    await waitFor(() => {
      expect(result.current.byOffer['o1']).toBeNull();
    });
  });

  it('does not fetch anything when the escrow rail is disabled', async () => {
    escrowMock.enabled = false;
    const getSpy = vi.mocked((await import('@/lib/escrow')).getEscrowSnapshot);
    // Clear history from earlier tests — this test asserts zero NEW calls.
    getSpy.mockClear();

    const offers = [offer({ id: 'o1', escrow_contract_id: CID_A })];

    const { result } = renderHook(() => useEscrowStatuses(offers));

    expect(getSpy).not.toHaveBeenCalled();
    expect(result.current.byOffer).toEqual({});
  });

  it('refresh clears all snapshots and re-reads them', async () => {
    escrowMock.snapshots.set(CID_A, { flags: { released: false }, milestone: null });
    const offers = [offer({ id: 'o1', escrow_contract_id: CID_A })];

    const { result } = renderHook(() => useEscrowStatuses(offers));

    await waitFor(() => {
      expect(result.current.byOffer['o1']).toEqual({ flags: { released: false }, milestone: null });
    });

    // The read model catches up; refresh must pick up the new state.
    escrowMock.snapshots.set(CID_A, { flags: { released: true }, milestone: null });
    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.byOffer['o1']).toEqual({ flags: { released: true }, milestone: null });
    });
  });
});
