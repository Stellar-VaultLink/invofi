// Supabase read/write helpers for the reminder system (issue #224).
//
// Split from lib/reminders/collector.ts, which is Node-only and used by the
// cron script. This module is the browser-safe half: it powers the
// per-invoice reminder panel (history + opt-out) and the admin config page.

import { supabase } from '@/lib/supabase';
import type { InvoiceReminder, InvoiceReminderPreference, ReminderConfig } from './types';

const REMINDERS_TABLE = 'invoice_reminders';
const PREFERENCES_TABLE = 'invoice_reminder_preferences';
const CONFIG_TABLE = 'reminder_configs';

// ── invoice_reminders (history) ───────────────────────────────────────────────

/** Fetch the reminder history for one invoice, newest first. */
export async function fetchReminderHistory(invoiceId: string): Promise<InvoiceReminder[]> {
  const { data, error } = await supabase
    .from(REMINDERS_TABLE)
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceReminder[];
}

/** Fetch the most recent reminders across all invoices (admin dashboard
 *  overview) — RLS restricts this to admins; other callers get an empty
 *  result rather than an error. */
export async function fetchRecentReminders(limit = 100): Promise<InvoiceReminder[]> {
  const { data, error } = await supabase
    .from(REMINDERS_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceReminder[];
}

// ── invoice_reminder_preferences (opt-out) ────────────────────────────────────

/** True when reminders are opted out for this invoice. Defaults to `false`
 *  (reminders enabled) when no preference row exists yet. */
export async function fetchReminderOptOut(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .select('opted_out')
    .eq('invoice_id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Pick<InvoiceReminderPreference, 'opted_out'> | null)?.opted_out ?? false;
}

/** Set (or clear) the opt-out for one invoice. Upserts so the first toggle
 *  works without a pre-existing row. */
export async function setReminderOptOut(invoiceId: string, optedOut: boolean): Promise<void> {
  const { error } = await supabase
    .from(PREFERENCES_TABLE)
    .upsert(
      { invoice_id: invoiceId, opted_out: optedOut, updated_at: new Date().toISOString() },
      { onConflict: 'invoice_id' },
    );
  if (error) throw new Error(error.message);
}

// ── reminder_configs (admin) ──────────────────────────────────────────────────

/** Fetch the singleton reminder config row. */
export async function fetchReminderConfig(): Promise<ReminderConfig | null> {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReminderConfig | null) ?? null;
}

/** Update the singleton reminder config row (admin-only per RLS). */
export async function updateReminderConfig(
  patch: Partial<Pick<ReminderConfig, 'enabled' | 'stages' | 'webhook_url' | 'webhook_secret' | 'max_webhook_attempts'>>,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from(CONFIG_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}
