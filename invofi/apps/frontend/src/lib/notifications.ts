// ── In-app notifications (issue #179) ────────────────────────────────────────
//
// Two layers live here:
//
//  1. **Pure mapping functions** — `notificationDraftFromEvent` turns a
//     protocol event into a display-ready notification draft, and
//     `draftTargetsWallet` decides whether a draft is addressed to a given
//     wallet. These are pure (no I/O) so they are unit-testable.
//
//  2. **Supabase persistence** — `fetchNotifications`, `unreadCount`,
//     `markAsRead`, `markAllRead`, and `insertNotification` wrap the
//     `notifications` table (migration 004) with RLS-forced queries (a row's
//     `user_id` always equals `auth.uid()`).
//
// Design notes:
//  - The table keeps `user_id` nullable so a future indexer can insert for
//    users who haven't authenticated yet; the client always scopes to
//    `auth.uid()` so RLS returns only the caller's rows.
//  - Amounts arrive as `bigint` (stroops). We display a compact human format
//    via `formatStroops` from lib/formatters (already used across the app),
//    but stay dependency-light: this module only needs the raw values, and
//    the UI renders them.

import type { ProtocolEvent } from '@invofi/sdk';
import { createClient } from '@/utils/supabase/client';
import type { AppNotification, NotificationType } from '@/types';

// ── Pure mapping: event → notification draft ────────────────────────────────

/**
 * A display-ready notification before persistence. `forWallet` is the wallet
 * address the notification concerns (the counterparty the event is *about*).
 * The seeder matches it against the currently connected wallet address; the
 * UI can also show it as a "from" hint.
 */
export interface NotificationDraft {
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  /** Wallet address the event concerns (counterparty). May be empty. */
  forWallet?: string;
}

/** Compact helper for invoice ids in notification copy. */
function shortId(id: string): string {
  const trimmed = id.replace(/^0+/, '');
  return trimmed.length > 8 ? `${trimmed.slice(0, 8)}…` : trimmed;
}

/**
 * Map a protocol event to a display-ready notification draft, or `null` for
 * events that should not become user notifications (e.g. pool/reputation
 * events that are not tied to an invoice the user owns).
 */
export function notificationDraftFromEvent(event: ProtocolEvent): NotificationDraft | null {
  switch (event.type) {
    case 'off_new': {
      // A new financing offer was created on the originator's invoice.
      return {
        type: 'offer_received',
        title: 'New financing offer',
        body: `Someone offered ${event.data.amount} units on invoice ${shortId(event.data.invoiceId)}.`,
        payload: {
          invoiceId: event.data.invoiceId,
          amount: event.data.amount.toString(),
          interestRate: event.data.interestRate,
        },
        forWallet: event.data.lender,
      };
    }

    case 'off_acc': {
      // The originator accepted an offer — the lender is told their offer won.
      return {
        type: 'offer_accepted',
        title: 'Offer accepted',
        body: `Your offer on invoice ${shortId(event.data.invoiceId)} was accepted (${event.data.amount} units).`,
        payload: {
          invoiceId: event.data.invoiceId,
          amount: event.data.amount.toString(),
        },
        forWallet: event.data.lender,
      };
    }

    case 'off_rej': {
      return {
        type: 'offer_rejected',
        title: 'Offer rejected',
        body: `Your offer on invoice ${shortId(event.data.invoiceId)} was declined.`,
        payload: { invoiceId: event.data.invoiceId },
      };
    }

    case 'off_wdr': {
      // A lender withdrew their offer — notify the originator side payload.
      return {
        type: 'offer_rejected',
        title: 'Offer withdrawn',
        body: `An offer on invoice ${shortId(event.subjectId)} was withdrawn.`,
        payload: { invoiceId: event.subjectId },
        forWallet: event.data.lender,
      };
    }

    case 'inv_rep': {
      return {
        type: 'invoice_repaid',
        title: event.data.fullyRepaid ? 'Invoice fully repaid' : 'Partial repayment',
        body: `Invoice ${shortId(event.subjectId)} received a repayment of ${event.data.amount} units.`,
        payload: {
          invoiceId: event.subjectId,
          offerId: event.data.offerId,
          amount: event.data.amount.toString(),
          fullyRepaid: event.data.fullyRepaid,
        },
      };
    }

    case 'inv_cxl': {
      return {
        type: 'invoice_cancelled',
        title: 'Invoice cancelled',
        body: `Invoice ${shortId(event.subjectId)} was cancelled.`,
        payload: { invoiceId: event.subjectId },
        forWallet: event.data.originator,
      };
    }

    case 'inv_ovd': {
      return {
        type: 'invoice_overdue',
        title: 'Invoice overdue',
        body: `Invoice ${shortId(event.subjectId)} is now overdue.`,
        payload: { invoiceId: event.subjectId },
      };
    }

    case 'inv_def': {
      return {
        type: 'invoice_defaulted',
        title: 'Invoice defaulted',
        body: `Invoice ${shortId(event.data.invoiceId)} was defaulted.`,
        payload: { invoiceId: event.data.invoiceId },
      };
    }

    default:
      // inv_reg / inv_amt / inv_sts / inv_dsp / inv_rsl / pos_mint / pool_* /
      // reputn are either not user-facing notification material or are
      // surfaced elsewhere (timeline, indicators).
      return null;
  }
}

/**
 * True when the draft's `forWallet` matches `wallet`, or when the draft has
 * no wallet address (e.g. repayment events that don't carry a counterparty
 * address — the seeder then falls back to invoice ownership checks).
 */
export function draftTargetsWallet(draft: NotificationDraft, wallet: string): boolean {
  if (typeof draft.forWallet !== 'string' || draft.forWallet === '') return true;
  return draft.forWallet === wallet;
}

/** The notification types the seeder should persist. */
export const SEEDABLE_TYPES = new Set<NotificationType>([
  'offer_received',
  'offer_accepted',
  'invoice_repaid',
  'invoice_cancelled',
  'invoice_overdue',
  'offer_rejected',
  'invoice_defaulted',
]);

// ── Supabase persistence ────────────────────────────────────────────────────

const NOTIFICATIONS_TABLE = 'notifications';

/**
 * Insert one notification for the current user. Safe no-op when the insert
 * fails (e.g. table not deployed yet in an older Supabase project) — the
 * notification center degrades to an empty state rather than crashing.
 */
export async function insertNotification(draft: NotificationDraft): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from(NOTIFICATIONS_TABLE).insert({
      type: draft.type,
      title: draft.title,
      body: draft.body,
      payload: draft.payload,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetch the current user's notifications, unread first, newest first.
 * Returns `null` on error so the hook can distinguish "no data" from
 * "table missing / not deployed".
 */
export async function fetchNotifications(limit = 50): Promise<AppNotification[] | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return null;
    return (data ?? []) as AppNotification[];
  } catch {
    return null;
  }
}

/** Number of unread notifications for the current user (0 on error). */
export async function unreadCount(): Promise<number> {
  try {
    const supabase = createClient();
    const { count, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .select('*', { count: 'exact', head: true })
      .is('read_at', null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Mark a single notification as read. */
export async function markAsRead(id: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase
      .from(NOTIFICATIONS_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null);
  } catch {
    // Best-effort; the UI remains usable on failure.
  }
}

/** Mark every unread notification of the current user as read. */
export async function markAllRead(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase
      .from(NOTIFICATIONS_TABLE)
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
  } catch {
    // Best-effort.
  }
}