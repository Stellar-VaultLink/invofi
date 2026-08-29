#!/usr/bin/env tsx
/**
 * InvoFi Invoice Reminder Collector (Closes #224)
 * ================================================
 * Scheduled script (GitHub Actions, daily) that:
 *
 *   1. Loads the admin `reminder_configs` singleton row — a disabled config
 *      skips the run entirely.
 *   2. Queries `invoices` mirror rows with status Financed/Overdue.
 *   3. For each invoice, computes whether today matches one of the five
 *      schedule stages (7/1 days before due, on due date, 1/7 days after).
 *   4. Skips invoices with an `invoice_reminder_preferences` opt-out, and
 *      stages already logged in `invoice_reminders` (duplicate-send guard).
 *   5. Sends an email via the Resend API to the originator's account email,
 *      and — if a webhook URL is configured — a signed webhook payload with
 *      retry + exponential backoff.
 *   6. Logs the outcome of every attempted (invoice, stage, channel) to
 *      `invoice_reminders`.
 *
 * Environment variables:
 *   SUPABASE_URL               required
 *   SUPABASE_SERVICE_ROLE_KEY  required (bypasses RLS for reads/writes)
 *   RESEND_API_KEY             required unless DRY_RUN=true
 *   REMINDER_FROM_EMAIL        default: reminders@invofi.app
 *   DRY_RUN                    if "true", compute + log but do not send/write
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeDueReminders } from '../apps/frontend/src/lib/reminders/schedule.js';
import {
  sendReminderEmail,
  buildWebhookPayload,
  sendWebhookWithRetry,
} from '../apps/frontend/src/lib/reminders/collector.js';
import type {
  ReminderableInvoice,
  ReminderConfig,
  ReminderStage,
  ReminderChannel,
} from '../apps/frontend/src/lib/reminders/types.js';
import { DEFAULT_REMINDER_CONFIG } from '../apps/frontend/src/lib/reminders/types.js';

// ── Config ────────────────────────────────────────────────────────────────────

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`env var ${name} is required`);
  return v;
}

const SUPABASE_URL = env('SUPABASE_URL');
const SUPABASE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const DRY_RUN = process.env.DRY_RUN === 'true';
const FROM_EMAIL = process.env.REMINDER_FROM_EMAIL ?? 'reminders@invofi.app';
// Only required when actually sending (not in dry-run).
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';

function log(msg: string): void {
  console.log(`[invoice-reminders ${new Date().toISOString()}] ${msg}`);
}

// ── Step 1: Load config ───────────────────────────────────────────────────────

export async function loadConfig(supabase: SupabaseClient): Promise<ReminderConfig> {
  const { data, error } = await supabase.from('reminder_configs').select('*').eq('id', 1).maybeSingle();
  if (error || !data) {
    log(`WARN: could not load reminder_configs (${error?.message ?? 'no row'}); using defaults`);
    return { ...DEFAULT_REMINDER_CONFIG, updated_at: new Date().toISOString(), updated_by: null };
  }
  return data as ReminderConfig;
}

// ── Step 2: Load eligible invoices ────────────────────────────────────────────

export async function loadReminderableInvoices(
  supabase: SupabaseClient,
): Promise<ReminderableInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, originator, originator_id, amount, currency, due_date, status')
    .in('status', ['Financed', 'Overdue']);
  if (error) throw new Error(`loadReminderableInvoices failed: ${error.message}`);
  return (data ?? []) as ReminderableInvoice[];
}

// ── Step 3: Load opt-outs + existing reminders ────────────────────────────────

export async function loadOptedOutInvoiceIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('invoice_reminder_preferences')
    .select('invoice_id')
    .eq('opted_out', true);
  if (error) {
    log(`WARN: could not load invoice_reminder_preferences: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((r: { invoice_id: string }) => r.invoice_id));
}

interface ExistingReminderRow {
  invoice_id: string;
  stage: ReminderStage;
  channel: ReminderChannel;
}

export async function loadExistingReminders(
  supabase: SupabaseClient,
  invoiceIds: string[],
): Promise<ExistingReminderRow[]> {
  if (invoiceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('invoice_reminders')
    .select('invoice_id, stage, channel')
    .in('invoice_id', invoiceIds);
  if (error) {
    log(`WARN: could not load invoice_reminders: ${error.message}`);
    return [];
  }
  return (data ?? []) as ExistingReminderRow[];
}

// ── Step 4: Resolve the originator's email ────────────────────────────────────

export async function resolveOriginatorEmail(
  supabase: SupabaseClient,
  originatorId: string | null,
): Promise<string | null> {
  if (!originatorId) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', originatorId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { email: string }).email;
}

// ── Step 5: Log the outcome ────────────────────────────────────────────────────

export async function logReminder(
  supabase: SupabaseClient,
  row: {
    invoice_id: string;
    stage: ReminderStage;
    channel: ReminderChannel;
    status: 'sent' | 'failed' | 'skipped';
    recipient: string | null;
    attempts: number;
    error: string | null;
  },
): Promise<void> {
  if (DRY_RUN) {
    log(`[dry-run] Would log: ${JSON.stringify(row)}`);
    return;
  }
  // Upsert on the dedupe index so a re-run of an interrupted job never
  // double-inserts for the same (invoice, stage, channel).
  const { error } = await supabase
    .from('invoice_reminders')
    .upsert(row, { onConflict: 'invoice_id,stage,channel' });
  if (error) log(`WARN: failed to log reminder for ${row.invoice_id}/${row.stage}/${row.channel}: ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<void> {
  log('Invoice reminder collector starting…');
  if (DRY_RUN) log('[dry-run mode — no emails, webhooks, or writes will occur]');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const now = new Date();

  const config = await loadConfig(supabase);
  if (!config.enabled) {
    log('reminder_configs.enabled is false — skipping run.');
    return;
  }

  const invoices = await loadReminderableInvoices(supabase);
  log(`Loaded ${invoices.length} Financed/Overdue invoice(s).`);

  const optedOut = await loadOptedOutInvoiceIds(supabase);
  const decisions = computeDueReminders(invoices, config, optedOut, now);
  log(`${decisions.length} invoice(s) match a reminder stage today.`);

  if (decisions.length === 0) {
    log('Nothing to send. Done.');
    return;
  }

  const existing = await loadExistingReminders(supabase, decisions.map(d => d.invoice.id));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const { invoice, stage } of decisions) {
    const alreadyLoggedEmail = existing.some(
      r => r.invoice_id === invoice.id && r.stage === stage && r.channel === 'email',
    );
    const alreadyLoggedWebhook = existing.some(
      r => r.invoice_id === invoice.id && r.stage === stage && r.channel === 'webhook',
    );

    // ── Email channel ──────────────────────────────────────────────────────
    if (!alreadyLoggedEmail) {
      const email = await resolveOriginatorEmail(supabase, invoice.originator_id);
      if (!email) {
        skipped++;
        await logReminder(supabase, {
          invoice_id: invoice.id,
          stage,
          channel: 'email',
          status: 'skipped',
          recipient: null,
          attempts: 0,
          error: 'no account email on file for originator',
        });
      } else if (DRY_RUN) {
        log(`[dry-run] Would email ${email} — invoice ${invoice.id} / ${stage}`);
      } else {
        const result = await sendReminderEmail(
          { apiKey: RESEND_API_KEY, from: FROM_EMAIL },
          email,
          invoice,
          stage,
        );
        if (result.ok) sent++;
        else failed++;
        await logReminder(supabase, {
          invoice_id: invoice.id,
          stage,
          channel: 'email',
          status: result.ok ? 'sent' : 'failed',
          recipient: email,
          attempts: 1,
          error: result.ok ? null : (result.error ?? 'unknown error'),
        });
      }
    }

    // ── Webhook channel ────────────────────────────────────────────────────
    if (!alreadyLoggedWebhook && config.webhook_url) {
      const payload = buildWebhookPayload(invoice, stage, now);
      if (DRY_RUN) {
        log(`[dry-run] Would POST webhook to ${config.webhook_url} — invoice ${invoice.id} / ${stage}`);
      } else {
        const result = await sendWebhookWithRetry(config.webhook_url, payload, {
          secret: config.webhook_secret,
          maxAttempts: config.max_webhook_attempts,
        });
        if (result.ok) sent++;
        else failed++;
        await logReminder(supabase, {
          invoice_id: invoice.id,
          stage,
          channel: 'webhook',
          status: result.ok ? 'sent' : 'failed',
          recipient: config.webhook_url,
          attempts: result.attempts,
          error: result.ok ? null : (result.error ?? 'unknown error'),
        });
      }
    }
  }

  log(`Invoice reminder collector finished. sent=${sent} failed=${failed} skipped=${skipped}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('invoice-reminders.ts')) {
  run().catch(err => {
    console.error('[invoice-reminders] Fatal error:', err);
    process.exit(1);
  });
}
