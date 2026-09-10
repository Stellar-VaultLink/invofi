process.env.NODE_ENV = 'test';

// Unit tests for the invoice reminder pure-logic functions (issue #224).
// Mirrors the health-collector.test.ts pattern: import the lib modules
// directly (no network / Supabase / env-var side effects) rather than the
// invoice-reminders.ts entrypoint, which requires real env vars at import
// time via `env()`.
//
// Run with:
//   npm test --prefix invofi/scripts
// or directly:
//   cd invofi/scripts && tsx --test invoice-reminders.test.ts

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  daysSinceDue,
  stageForInvoice,
  computeDueReminders,
} from '../apps/frontend/src/lib/reminders/schedule.js';
import {
  renderReminderEmail,
  buildWebhookPayload,
  signWebhookPayload,
  sendWebhookWithRetry,
} from '../apps/frontend/src/lib/reminders/collector.js';
import { REMINDER_STAGES } from '../apps/frontend/src/lib/reminders/types.js';
import type { ReminderableInvoice } from '../apps/frontend/src/lib/reminders/types.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');

function makeInvoice(overrides: Partial<ReminderableInvoice> = {}): ReminderableInvoice {
  return {
    id: 'inv-1',
    originator: 'GABC...',
    originator_id: 'user-1',
    amount: '1000.00',
    currency: 'USDC',
    due_date: '2026-09-04T00:00:00.000Z',
    status: 'Financed',
    ...overrides,
  };
}

// ── schedule ──────────────────────────────────────────────────────────────────

describe('daysSinceDue / stageForInvoice', () => {
  test('due-in-7 maps correctly', () => {
    assert.equal(daysSinceDue('2026-09-04T00:00:00.000Z', NOW), -7);
    assert.equal(stageForInvoice('2026-09-04T00:00:00.000Z', NOW), 'due_in_7');
  });

  test('overdue-7 maps correctly', () => {
    assert.equal(daysSinceDue('2026-08-21T00:00:00.000Z', NOW), 7);
    assert.equal(stageForInvoice('2026-08-21T00:00:00.000Z', NOW), 'overdue_7');
  });

  test('unmatched offsets return null', () => {
    assert.equal(stageForInvoice('2026-09-01T00:00:00.000Z', NOW), null);
  });
});

describe('computeDueReminders', () => {
  const config = { enabled: true, stages: REMINDER_STAGES };

  test('matches a Financed invoice due today', () => {
    const inv = makeInvoice({ due_date: '2026-08-28T00:00:00.000Z' });
    const decisions = computeDueReminders([inv], config, new Set(), NOW);
    assert.deepEqual(decisions, [{ invoice: inv, stage: 'due_today' }]);
  });

  test('excludes opted-out invoices', () => {
    const inv = makeInvoice({ due_date: '2026-08-28T00:00:00.000Z' });
    assert.deepEqual(computeDueReminders([inv], config, new Set([inv.id]), NOW), []);
  });

  test('excludes non-reminderable statuses (Repaid, Cancelled, …)', () => {
    const inv = makeInvoice({ due_date: '2026-08-28T00:00:00.000Z', status: 'Repaid' });
    assert.deepEqual(computeDueReminders([inv], config, new Set(), NOW), []);
  });

  test('a disabled config sends nothing', () => {
    const inv = makeInvoice({ due_date: '2026-08-28T00:00:00.000Z' });
    assert.deepEqual(
      computeDueReminders([inv], { enabled: false, stages: REMINDER_STAGES }, new Set(), NOW),
      [],
    );
  });
});

// ── email + webhook content ───────────────────────────────────────────────────

describe('renderReminderEmail', () => {
  test('includes invoice id, amount, and due date', () => {
    const inv = makeInvoice();
    const content = renderReminderEmail(inv, 'due_in_1');
    assert.match(content.subject, /inv-1/);
    assert.match(content.text, /1000\.00 USDC/);
    assert.match(content.text, /2026-09-04/);
  });
});

describe('buildWebhookPayload / signWebhookPayload', () => {
  test('payload carries the event type and stage', () => {
    const inv = makeInvoice();
    const payload = buildWebhookPayload(inv, 'overdue_1', NOW);
    assert.equal(payload.event, 'invoice.reminder');
    assert.equal(payload.stage, 'overdue_1');
    assert.equal(payload.invoice.id, 'inv-1');
  });

  test('signature is deterministic for the same body + secret', () => {
    const body = JSON.stringify({ x: 1 });
    assert.equal(signWebhookPayload(body, 's3cr3t'), signWebhookPayload(body, 's3cr3t'));
  });
});

describe('sendWebhookWithRetry', () => {
  test('retries on failure and succeeds within maxAttempts', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return { ok: calls >= 2 } as Response;
    }) as unknown as typeof fetch;

    const result = await sendWebhookWithRetry(
      'https://example.com/hook',
      buildWebhookPayload(makeInvoice(), 'due_today', NOW),
      { maxAttempts: 3, fetchImpl, delayImpl: async () => {} },
    );

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });

  test('reports failure after exhausting attempts', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const result = await sendWebhookWithRetry(
      'https://example.com/hook',
      buildWebhookPayload(makeInvoice(), 'due_today', NOW),
      { maxAttempts: 2, fetchImpl, delayImpl: async () => {} },
    );
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 2);
  });
});
