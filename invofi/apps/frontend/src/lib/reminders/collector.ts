// Node-only helpers for the invoice reminder collector script
// (invofi/scripts/invoice-reminders.ts, run on a daily GitHub Actions
// schedule). NOT bundled into the frontend — mirrors the split used by
// lib/health/collector.ts for the health monitoring collector.
//
// Responsibilities:
//   1. Render the email subject/body for a given (invoice, stage).
//   2. Send that email via the Resend REST API.
//   3. Deliver a signed webhook payload with retry + exponential backoff.

import { createHmac } from 'node:crypto';
import type { ReminderableInvoice, ReminderStage } from './types';
import { STAGE_LABELS } from './types';

// ── Email content ────────────────────────────────────────────────────────────

export interface ReminderEmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Pure — renders the reminder email for a given invoice/stage. Testable
 *  without hitting the Resend API. */
export function renderReminderEmail(
  invoice: ReminderableInvoice,
  stage: ReminderStage,
): ReminderEmailContent {
  const label = STAGE_LABELS[stage];
  const amount = `${invoice.amount} ${invoice.currency}`;
  const dueDate = new Date(invoice.due_date).toISOString().slice(0, 10);
  const isOverdue = stage.startsWith('overdue');

  const subject = isOverdue
    ? `Invoice ${invoice.id} is ${label.toLowerCase()}`
    : `Invoice ${invoice.id} — ${label.toLowerCase()}`;

  const text =
    `Invoice ${invoice.id} for ${amount} ${isOverdue ? 'was' : 'is'} due ${dueDate}. ` +
    `Status: ${label}. ` +
    (isOverdue
      ? 'Please arrange repayment as soon as possible to avoid a default flag.'
      : 'Please make sure funds are available ahead of the due date.');

  const html =
    `<p>Invoice <strong>${invoice.id}</strong> for <strong>${amount}</strong> ` +
    `${isOverdue ? 'was' : 'is'} due on <strong>${dueDate}</strong>.</p>` +
    `<p>Status: <strong>${label}</strong></p>` +
    `<p>${
      isOverdue
        ? 'Please arrange repayment as soon as possible to avoid a default flag.'
        : 'Please make sure funds are available ahead of the due date.'
    }</p>`;

  return { subject, html, text };
}

export interface EmailSender {
  apiKey: string;
  from: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Send one reminder email via the Resend REST API (no SDK dependency —
 *  keeps the collector's install footprint small). */
export async function sendReminderEmail(
  sender: EmailSender,
  to: string,
  invoice: ReminderableInvoice,
  stage: ReminderStage,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const { subject, html, text } = renderReminderEmail(invoice, stage);
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sender.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: sender.from, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Webhook delivery ──────────────────────────────────────────────────────────

export interface WebhookPayload {
  event: 'invoice.reminder';
  stage: ReminderStage;
  invoice: {
    id: string;
    originator: string;
    amount: string;
    currency: string;
    due_date: string;
    status: string;
  };
  sent_at: string;
}

export function buildWebhookPayload(
  invoice: ReminderableInvoice,
  stage: ReminderStage,
  sentAt: Date = new Date(),
): WebhookPayload {
  return {
    event: 'invoice.reminder',
    stage,
    invoice: {
      id: invoice.id,
      originator: invoice.originator,
      amount: invoice.amount,
      currency: invoice.currency,
      due_date: invoice.due_date,
      status: invoice.status,
    },
    sent_at: sentAt.toISOString(),
  };
}

/** HMAC-SHA256 of the raw JSON body, hex-encoded — sent as
 *  `X-Invofi-Signature` so receivers can verify the webhook came from us. */
export function signWebhookPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export interface WebhookSendResult extends SendResult {
  attempts: number;
}

/** Delay helper — separated so tests can stub it and run instantly. */
function defaultDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * POST a signed webhook payload with retry + exponential backoff
 * (1s, 2s, 4s, …) up to `maxAttempts`. Any non-2xx response or network error
 * triggers a retry; the final attempt's error is returned on exhaustion.
 */
export async function sendWebhookWithRetry(
  url: string,
  payload: WebhookPayload,
  options: {
    secret?: string | null;
    maxAttempts?: number;
    fetchImpl?: typeof fetch;
    delayImpl?: (ms: number) => Promise<void>;
  } = {},
): Promise<WebhookSendResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const fetchImpl = options.fetchImpl ?? fetch;
  const delayImpl = options.delayImpl ?? defaultDelay;
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.secret) {
    headers['X-Invofi-Signature'] = signWebhookPayload(body, options.secret);
  }

  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(url, { method: 'POST', headers, body });
      if (res.ok) return { ok: true, attempts: attempt };
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      await delayImpl(2 ** (attempt - 1) * 1000);
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}
