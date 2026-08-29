// Pure scheduling logic for the automated invoice reminder system (#224).
//
// Kept dependency-free and side-effect-free so it is unit-testable without a
// Supabase connection or network access. Used by both the collector script
// (invofi/scripts/invoice-reminders.ts) and, indirectly, by the dashboard
// (for showing which stage an invoice is currently at).

import type {
  InvoiceReminder,
  ReminderableInvoice,
  ReminderConfig,
  ReminderStage,
} from './types';
import { STAGE_OFFSET_DAYS } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Truncate to a UTC calendar day (midnight), so time-of-day never affects
 *  which stage matches — a run at 01:00 UTC and one at 23:00 UTC on the same
 *  day compute the same stage for the same invoice. */
function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole calendar days from `due` to `now` (positive once overdue). */
export function daysSinceDue(dueDateIso: string, now: Date): number {
  const due = utcDayStart(new Date(dueDateIso));
  const today = utcDayStart(now);
  return Math.round((today - due) / MS_PER_DAY);
}

/**
 * The single reminder stage an invoice matches "today", or `null` if today
 * doesn't line up with any configured offset (e.g. between due-in-7 and
 * due-in-1, or the invoice is more than 7 days overdue).
 */
export function stageForInvoice(dueDateIso: string, now: Date): ReminderStage | null {
  const offset = daysSinceDue(dueDateIso, now);
  const match = (Object.entries(STAGE_OFFSET_DAYS) as [ReminderStage, number][]).find(
    ([, o]) => o === offset,
  );
  return match ? match[0] : null;
}

/** Invoice statuses eligible for reminders — only invoices with capital
 *  outstanding matter; a repaid, cancelled, or defaulted invoice has nothing
 *  left to remind anyone about. */
const REMINDABLE_STATUSES = new Set(['Financed', 'Overdue']);

export interface ReminderDecision {
  invoice: ReminderableInvoice;
  stage: ReminderStage;
}

/**
 * Compute the set of (invoice, stage) pairs that should be reminded on right
 * now, given the current config, per-invoice opt-outs, and reminders already
 * sent (the duplicate-send guard).
 *
 * `alreadySent` is keyed as `${invoice_id}:${stage}` and only needs to
 * contain rows for *any* channel — if either channel already has a row for
 * this stage, sending logic downstream still runs per-channel dedupe, but we
 * skip the invoice entirely here only when every enabled channel is covered.
 * To keep this pure function simple and conservative, callers pass the set of
 * (invoice_id, stage) pairs that have at least one successful or attempted
 * channel row already logged.
 */
export function computeDueReminders(
  invoices: ReminderableInvoice[],
  config: Pick<ReminderConfig, 'enabled' | 'stages'>,
  optedOutInvoiceIds: ReadonlySet<string>,
  now: Date,
): ReminderDecision[] {
  if (!config.enabled) return [];

  const decisions: ReminderDecision[] = [];
  for (const invoice of invoices) {
    if (!REMINDABLE_STATUSES.has(invoice.status)) continue;
    if (optedOutInvoiceIds.has(invoice.id)) continue;

    const stage = stageForInvoice(invoice.due_date, now);
    if (!stage) continue;
    if (!config.stages.includes(stage)) continue;

    decisions.push({ invoice, stage });
  }
  return decisions;
}

/** Build the `invoice_id:stage` key used to look up existing reminder rows. */
export function reminderKey(invoiceId: string, stage: ReminderStage): string {
  return `${invoiceId}:${stage}`;
}

/** True when a reminder row already exists for this invoice/stage/channel —
 *  the duplicate-send guard the collector checks before sending. */
export function alreadySent(
  existing: Pick<InvoiceReminder, 'invoice_id' | 'stage' | 'channel'>[],
  invoiceId: string,
  stage: ReminderStage,
  channel: InvoiceReminder['channel'],
): boolean {
  return existing.some(
    r => r.invoice_id === invoiceId && r.stage === stage && r.channel === channel,
  );
}
