// ── Event map unit tests (issue #255) ─────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { mapEventToNotification, isNotifiableEvent, buildNotificationId } from '@/lib/notifications/eventMap';
import { DEFAULT_PREFERENCES } from '@/lib/notifications/store';
import type { ProtocolEvent, OfferCreatedData, InvoiceRepaidData } from '@invofi/sdk';
import type { NotificationPreferences } from '@/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Use concrete discriminated union members that TypeScript can narrow correctly.

function makeOffNewEvent(subjectId = 'inv-001', txHash = 'abc123'): ProtocolEvent {
  return {
    type: 'off_new',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1000,
    txHash,
    data: {
      invoiceId: subjectId,
      lender: 'GABC123',
      amount: BigInt(1000),
      interestRate: 500,
    } satisfies OfferCreatedData,
  };
}

function makeOffAccEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'off_acc',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1001,
    txHash: 'hash-acc',
    data: { invoiceId: subjectId, lender: 'GABC123', amount: BigInt(1000) },
  };
}

function makeOffRejEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'off_rej',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1002,
    txHash: 'hash-rej',
    data: { invoiceId: subjectId },
  };
}

function makeInvOvdEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_ovd',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1003,
    txHash: 'hash-ovd',
    data: { dueDate: BigInt(1_700_000_000) },
  };
}

function makeInvDefEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_def',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1004,
    txHash: 'hash-def',
    data: { invoiceId: subjectId },
  };
}

function makeInvRepEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_rep',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1005,
    txHash: 'hash-rep',
    data: {
      offerId: 'offer-001',
      amount: BigInt(1000),
      fullyRepaid: true,
    } satisfies InvoiceRepaidData,
  };
}

function makeInvDspEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_dsp',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1006,
    txHash: 'hash-dsp',
    data: { originator: 'GABC123' },
  };
}

function makeInvRslEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_rsl',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1007,
    txHash: 'hash-rsl',
    data: { newStatus: 'Repaid' },
  };
}

function makeInvCxlEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_cxl',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 1008,
    txHash: 'hash-cxl',
    data: { originator: 'GABC123' },
  };
}

function makeInvRegEvent(subjectId = 'inv-001'): ProtocolEvent {
  return {
    type: 'inv_reg',
    subjectId,
    contractId: 'CONTRACT_A',
    ledger: 999,
    txHash: 'hash-reg',
    data: { originator: 'GABC123', amount: BigInt(1000), dueDate: BigInt(1_700_000_000) },
  };
}

const allPrefsOn: NotificationPreferences = { ...DEFAULT_PREFERENCES };

const allPrefsOff: NotificationPreferences = {
  offer_new: false,
  offer_accepted: false,
  offer_rejected: false,
  invoice_overdue: false,
  repayment: false,
  dispute: false,
  browserNotifications: false,
};

// ── mapEventToNotification ────────────────────────────────────────────────────

describe('mapEventToNotification', () => {
  it('returns null for unmapped event types (inv_reg has no notification)', () => {
    const result = mapEventToNotification(makeInvRegEvent(), allPrefsOn);
    expect(result).toBeNull();
  });

  it('returns null when the preference for an event is disabled', () => {
    const result = mapEventToNotification(makeOffNewEvent(), allPrefsOff);
    expect(result).toBeNull();
  });

  it('maps off_new to an offer category notification', () => {
    const event = makeOffNewEvent('inv-abc', 'tx-xyz');
    const notif = mapEventToNotification(event, allPrefsOn);
    expect(notif).not.toBeNull();
    expect(notif!.category).toBe('offer');
    expect(notif!.title).toBe('New offer received');
    expect(notif!.body).toContain('inv-abc');
    expect(notif!.subjectId).toBe('inv-abc');
    expect(notif!.eventType).toBe('off_new');
    expect(notif!.read).toBe(false);
  });

  it('maps off_acc to an offer category notification', () => {
    const notif = mapEventToNotification(makeOffAccEvent(), allPrefsOn);
    expect(notif!.category).toBe('offer');
    expect(notif!.title).toBe('Offer accepted');
  });

  it('maps off_rej to an offer category notification', () => {
    const notif = mapEventToNotification(makeOffRejEvent(), allPrefsOn);
    expect(notif!.category).toBe('offer');
    expect(notif!.title).toBe('Offer rejected');
  });

  it('maps inv_ovd to an alert category notification', () => {
    const notif = mapEventToNotification(makeInvOvdEvent(), allPrefsOn);
    expect(notif!.category).toBe('alert');
    expect(notif!.title).toBe('Invoice overdue');
  });

  it('maps inv_def to an alert category notification', () => {
    const notif = mapEventToNotification(makeInvDefEvent(), allPrefsOn);
    expect(notif!.category).toBe('alert');
  });

  it('maps inv_rep to a repayment category notification', () => {
    const notif = mapEventToNotification(makeInvRepEvent(), allPrefsOn);
    expect(notif!.category).toBe('repayment');
    expect(notif!.title).toBe('Repayment confirmed');
  });

  it('maps inv_dsp to an alert category notification', () => {
    const notif = mapEventToNotification(makeInvDspEvent(), allPrefsOn);
    expect(notif!.category).toBe('alert');
    expect(notif!.title).toBe('Dispute raised');
  });

  it('maps inv_rsl to an info category notification', () => {
    const notif = mapEventToNotification(makeInvRslEvent(), allPrefsOn);
    expect(notif!.category).toBe('info');
    expect(notif!.title).toBe('Dispute resolved');
  });

  it('maps inv_cxl to an alert category notification', () => {
    const notif = mapEventToNotification(makeInvCxlEvent(), allPrefsOn);
    expect(notif!.category).toBe('alert');
  });

  it('respects individual preference keys', () => {
    const prefs: NotificationPreferences = { ...allPrefsOn, repayment: false };
    const notif = mapEventToNotification(makeInvRepEvent(), prefs);
    expect(notif).toBeNull();
  });

  it('includes subjectId in the notification', () => {
    const notif = mapEventToNotification(makeOffNewEvent('invoice-xyz'), allPrefsOn);
    expect(notif!.subjectId).toBe('invoice-xyz');
  });
});

// ── isNotifiableEvent ─────────────────────────────────────────────────────────

describe('isNotifiableEvent', () => {
  it('returns true for mapped event types', () => {
    expect(isNotifiableEvent('off_new')).toBe(true);
    expect(isNotifiableEvent('inv_rep')).toBe(true);
    expect(isNotifiableEvent('inv_ovd')).toBe(true);
  });

  it('returns false for unmapped event types', () => {
    expect(isNotifiableEvent('inv_reg')).toBe(false);
    expect(isNotifiableEvent('unknown_event')).toBe(false);
    expect(isNotifiableEvent('')).toBe(false);
  });
});

// ── buildNotificationId ────────────────────────────────────────────────────────

describe('buildNotificationId', () => {
  it('produces a stable id from txHash + type + subjectId', () => {
    const event = makeOffNewEvent('inv-1', 'hash1');
    expect(buildNotificationId(event)).toBe('hash1:off_new:inv-1');
  });

  it('produces different ids for different events', () => {
    const a = makeOffNewEvent('i1', 'h1');
    const b = makeInvRepEvent('i2');
    expect(buildNotificationId(a)).not.toBe(buildNotificationId(b));
  });
});
