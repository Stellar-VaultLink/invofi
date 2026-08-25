/**
 * Unit tests for lib/notifications.ts
 *
 * Run with:  npx vitest run  (from apps/frontend)
 *
 * Covers:
 *  - notificationDraftFromEvent: every event type → correct draft or null
 *  - draftTargetsWallet: matching logic
 *  - All SEEDABLE_TYPES are covered
 */

import { describe, it, expect } from 'vitest';
import {
  notificationDraftFromEvent,
  draftTargetsWallet,
  SEEDABLE_TYPES,
} from '@/lib/notifications';
import type { ProtocolEvent } from '@invofi/sdk';

// ── Fixtures ────────────────────────────────────────────────────────────────

const TX_HASH = 'a1b2c3d4e5f6';
const CONTRACT_ID = 'CCONTRACT123';
const LEDGER = 42_000;

function makeEvent(type: ProtocolEvent['type'], data: unknown, subjectId = ''): ProtocolEvent {
  return {
    type,
    subjectId: subjectId || 'inv_test_001',
    contractId: CONTRACT_ID,
    ledger: LEDGER,
    txHash: TX_HASH,
    data,
  } as ProtocolEvent;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('notificationDraftFromEvent', () => {
  it('off_new → offer_received', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('off_new', {
        invoiceId: 'inv_abc123def',
        lender: 'GALENDER000000000000000000000000000000000000000000000000',
        amount: 5_000_000n,
        interestRate: 1200,
      }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('offer_received');
    expect(draft!.title).toContain('financing');
    expect(draft!.payload.invoiceId).toBe('inv_abc123def');
    expect(draft!.forWallet).toBe('GALENDER000000000000000000000000000000000000000000000000');
  });

  it('off_acc → offer_accepted', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('off_acc', {
        invoiceId: 'inv_xyz',
        lender: 'GALENDER000000000000000000000000000000000000000000000000',
        amount: 10_000_000n,
      }, 'offer_001'),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('offer_accepted');
    expect(draft!.title).toContain('accepted');
    expect(draft!.forWallet).toBe('GALENDER000000000000000000000000000000000000000000000000');
  });

  it('off_rej → offer_rejected', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('off_rej', { invoiceId: 'inv_rej_001' }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('offer_rejected');
    expect(draft!.title).toContain('rejected');
  });

  it('off_wdr → offer_rejected (withdrawn)', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('off_wdr', { lender: 'GALENDER000000000000000000000000000000000000000000000000' }, 'inv_wdr_001'),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('offer_rejected');
    expect(draft!.title).toContain('withdrawn');
    expect(draft!.forWallet).toBe('GALENDER000000000000000000000000000000000000000000000000');
  });

  it('inv_rep (full) → invoice_repaid', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('inv_rep', {
        offerId: 'offer_rep_001',
        amount: 5_000_000n,
        fullyRepaid: true,
      }, 'inv_rep_001'),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('invoice_repaid');
    expect(draft!.title).toContain('fully repaid');
    expect(draft!.payload.fullyRepaid).toBe(true);
  });

  it('inv_rep (partial) → invoice_repaid', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('inv_rep', {
        offerId: 'offer_rep_002',
        amount: 1_000_000n,
        fullyRepaid: false,
      }, 'inv_rep_002'),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('invoice_repaid');
    expect(draft!.title).toContain('Partial');
  });

  it('inv_cxl → invoice_cancelled', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('inv_cxl', { originator: 'GORIGINATOR000000000000000000000000000000000000000000000000' }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('invoice_cancelled');
    expect(draft!.forWallet).toBe('GORIGINATOR000000000000000000000000000000000000000000000000');
  });

  it('inv_ovd → invoice_overdue', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('inv_ovd', { dueDate: 1_800_000_000n }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('invoice_overdue');
    expect(draft!.title).toContain('overdue');
  });

  it('inv_def → invoice_defaulted', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('inv_def', { invoiceId: 'inv_def_001' }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.type).toBe('invoice_defaulted');
    expect(draft!.title).toContain('defaulted');
  });

  it('returns null for non-notification event types', () => {
    const nonNotifiable: ProtocolEvent['type'][] = [
      'inv_reg', 'inv_amt', 'inv_sts', 'inv_dsp', 'inv_rsl',
      'pos_mint', 'pool_stk', 'pool_un', 'pool_pay', 'reputn',
    ];
    for (const type of nonNotifiable) {
      expect(notificationDraftFromEvent(makeEvent(type, {}))).toBeNull();
    }
  });
});

describe('draftTargetsWallet', () => {
  const wallet = 'GWALLET001000000000000000000000000000000000000000000000000000';

  it('matches when forWallet equals wallet', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('off_acc', {
        invoiceId: 'inv_001',
        lender: wallet,
        amount: 5_000_000n,
      }),
    );
    expect(draft).not.toBeNull();
    expect(draftTargetsWallet(draft!, wallet)).toBe(true);
  });

  it('does not match a different wallet', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('off_acc', {
        invoiceId: 'inv_001',
        lender: 'GOTHER000000000000000000000000000000000000000000000000000',
        amount: 5_000_000n,
      }),
    );
    expect(draft).not.toBeNull();
    expect(draftTargetsWallet(draft!, wallet)).toBe(false);
  });

  it('returns true when forWallet is empty (events without address)', () => {
    const draft = notificationDraftFromEvent(
      makeEvent('inv_rep', { offerId: 'off_001', amount: 1n, fullyRepaid: false }),
    );
    expect(draft).not.toBeNull();
    expect(draft!.forWallet).toBeUndefined();
    // draftTargetsWallet returns true for drafts without a forWallet
    expect(draftTargetsWallet(draft!, wallet)).toBe(true);
  });
});

describe('SEEDABLE_TYPES coverage', () => {
  it('includes all notification-producing event types', () => {
    expect(SEEDABLE_TYPES.has('offer_received')).toBe(true);
    expect(SEEDABLE_TYPES.has('offer_accepted')).toBe(true);
    expect(SEEDABLE_TYPES.has('invoice_repaid')).toBe(true);
    expect(SEEDABLE_TYPES.has('invoice_cancelled')).toBe(true);
    expect(SEEDABLE_TYPES.has('invoice_overdue')).toBe(true);
    expect(SEEDABLE_TYPES.has('offer_rejected')).toBe(true);
    expect(SEEDABLE_TYPES.has('invoice_defaulted')).toBe(true);
  });
});