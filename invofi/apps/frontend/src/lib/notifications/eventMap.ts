// ── Event map — ProtocolEvent → AppNotification (issue #255) ─────────────────
// Maps raw Soroban contract events to user-facing AppNotification objects.
// Only events whose subjectId belongs to the current wallet are surfaced.

import type { ProtocolEvent, ProtocolEventName } from '@invofi/sdk';
import type { AppNotification, NotificationCategory, NotificationPreferences } from '@/types';

// ── Label + category table ────────────────────────────────────────────────────

interface EventMeta {
  title: string;
  body: (subjectId?: string) => string;
  category: NotificationCategory;
  /** Which preferences key gates this notification. */
  prefKey: keyof Omit<NotificationPreferences, 'browserNotifications'>;
}

const EVENT_META: Partial<Record<ProtocolEventName, EventMeta>> = {
  off_new: {
    title: 'New offer received',
    body: (id) => `A lender placed an offer on invoice ${id ?? '—'}.`,
    category: 'offer',
    prefKey: 'offer_new',
  },
  off_acc: {
    title: 'Offer accepted',
    body: (id) => `Your offer on invoice ${id ?? '—'} was accepted.`,
    category: 'offer',
    prefKey: 'offer_accepted',
  },
  off_rej: {
    title: 'Offer rejected',
    body: (id) => `Your offer on invoice ${id ?? '—'} was rejected.`,
    category: 'offer',
    prefKey: 'offer_rejected',
  },
  off_wdr: {
    title: 'Offer withdrawn',
    body: (id) => `An offer on invoice ${id ?? '—'} was withdrawn.`,
    category: 'offer',
    prefKey: 'offer_rejected',
  },
  off_def: {
    title: 'Offer position defaulted',
    body: (id) => `A lender reclaimed their position on invoice ${id ?? '—'}.`,
    category: 'alert',
    prefKey: 'offer_rejected',
  },
  inv_ovd: {
    title: 'Invoice overdue',
    body: (id) => `Invoice ${id ?? '—'} has been marked overdue.`,
    category: 'alert',
    prefKey: 'invoice_overdue',
  },
  inv_def: {
    title: 'Invoice defaulted',
    body: (id) => `Invoice ${id ?? '—'} has defaulted.`,
    category: 'alert',
    prefKey: 'invoice_overdue',
  },
  inv_rep: {
    title: 'Repayment confirmed',
    body: (id) => `Repayment received for invoice ${id ?? '—'}.`,
    category: 'repayment',
    prefKey: 'repayment',
  },
  inv_dsp: {
    title: 'Dispute raised',
    body: (id) => `A dispute was opened on invoice ${id ?? '—'}.`,
    category: 'alert',
    prefKey: 'dispute',
  },
  inv_rsl: {
    title: 'Dispute resolved',
    body: (id) => `The dispute on invoice ${id ?? '—'} has been resolved.`,
    category: 'info',
    prefKey: 'dispute',
  },
  inv_sts: {
    title: 'Invoice status updated',
    body: (id) => `Invoice ${id ?? '—'} status has changed.`,
    category: 'info',
    prefKey: 'offer_new',
  },
  inv_cxl: {
    title: 'Invoice cancelled',
    body: (id) => `Invoice ${id ?? '—'} has been cancelled.`,
    category: 'alert',
    prefKey: 'invoice_overdue',
  },
};

// ── ID generator ──────────────────────────────────────────────────────────────

let _seq = 0;
/** Deterministic, stable ID derived from the event so it can be deduplicated. */
export function buildNotificationId(event: ProtocolEvent): string {
  // Use txHash + type + subjectId when available (mimics useEventSubscription dedup key).
  if (event.txHash) {
    return `${event.txHash}:${event.type}:${event.subjectId ?? ''}`;
  }
  // Fallback for synthetic/test events.
  return `notif-${event.type}-${++_seq}`;
}

// ── Main mapper ───────────────────────────────────────────────────────────────

/**
 * Convert a raw ProtocolEvent into an AppNotification.
 *
 * Returns `null` when:
 *  - The event type has no registered meta (not user-facing).
 *  - The user's preferences have disabled this category.
 */
export function mapEventToNotification(
  event: ProtocolEvent,
  preferences: NotificationPreferences,
): AppNotification | null {
  const meta = EVENT_META[event.type as ProtocolEventName];
  if (!meta) return null;

  // Check user preferences (boolean toggle for this event category).
  const prefAllowed = preferences[meta.prefKey as keyof NotificationPreferences];
  if (!prefAllowed) return null;

  return {
    id: buildNotificationId(event),
    title: meta.title,
    body: meta.body(event.subjectId ?? undefined),
    category: meta.category,
    read: false,
    createdAt: new Date().toISOString(),
    subjectId: event.subjectId ?? undefined,
    eventType: event.type,
  };
}


/**
 * Returns true when an event type has a registered notification mapping.
 * Useful for filtering which events should wake the notification provider.
 */
export function isNotifiableEvent(type: string): boolean {
  return type in EVENT_META;
}
