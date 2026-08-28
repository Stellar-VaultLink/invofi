import { describe, it, expect } from 'vitest';
import {
  daysSinceDue,
  stageForInvoice,
  computeDueReminders,
  reminderKey,
  alreadySent,
} from './schedule';
import { DEFAULT_REMINDER_CONFIG, REMINDER_STAGES } from './types';
import type { ReminderableInvoice } from './types';

const NOW = new Date('2026-08-28T12:00:00.000Z');

function invoice(overrides: Partial<ReminderableInvoice> = {}): ReminderableInvoice {
  return {
    id: 'inv-1',
    originator: 'GABC...',
    originator_id: 'user-1',
    amount: '1000.00',
    currency: 'USDC',
    due_date: '2026-09-04T00:00:00.000Z', // 7 days after NOW
    status: 'Financed',
    ...overrides,
  };
}

describe('daysSinceDue', () => {
  it('is 0 on the due date regardless of time-of-day', () => {
    expect(daysSinceDue('2026-08-28T23:59:00.000Z', NOW)).toBe(0);
    expect(daysSinceDue('2026-08-28T00:00:01.000Z', NOW)).toBe(0);
  });

  it('is negative before the due date and positive after', () => {
    expect(daysSinceDue('2026-09-04T00:00:00.000Z', NOW)).toBe(-7);
    expect(daysSinceDue('2026-08-21T00:00:00.000Z', NOW)).toBe(7);
  });
});

describe('stageForInvoice', () => {
  it.each([
    ['2026-09-04T00:00:00.000Z', 'due_in_7'],
    ['2026-08-29T00:00:00.000Z', 'due_in_1'],
    ['2026-08-28T00:00:00.000Z', 'due_today'],
    ['2026-08-27T00:00:00.000Z', 'overdue_1'],
    ['2026-08-21T00:00:00.000Z', 'overdue_7'],
  ] as const)('matches %s -> %s', (dueDate, expected) => {
    expect(stageForInvoice(dueDate, NOW)).toBe(expected);
  });

  it('returns null for days that fall between configured offsets', () => {
    expect(stageForInvoice('2026-09-01T00:00:00.000Z', NOW)).toBeNull(); // 4 days out
    expect(stageForInvoice('2026-06-01T00:00:00.000Z', NOW)).toBeNull(); // long overdue
  });
});

describe('computeDueReminders', () => {
  const config = { enabled: true, stages: REMINDER_STAGES };

  it('includes a Financed invoice that matches a configured stage', () => {
    const inv = invoice({ due_date: '2026-08-28T00:00:00.000Z' });
    const decisions = computeDueReminders([inv], config, new Set(), NOW);
    expect(decisions).toEqual([{ invoice: inv, stage: 'due_today' }]);
  });

  it('skips invoices in non-reminderable statuses', () => {
    const inv = invoice({ due_date: '2026-08-28T00:00:00.000Z', status: 'Repaid' });
    expect(computeDueReminders([inv], config, new Set(), NOW)).toEqual([]);
  });

  it('skips invoices that opted out', () => {
    const inv = invoice({ due_date: '2026-08-28T00:00:00.000Z' });
    expect(computeDueReminders([inv], config, new Set([inv.id]), NOW)).toEqual([]);
  });

  it('returns nothing when the config is disabled', () => {
    const inv = invoice({ due_date: '2026-08-28T00:00:00.000Z' });
    expect(computeDueReminders([inv], { enabled: false, stages: REMINDER_STAGES }, new Set(), NOW))
      .toEqual([]);
  });

  it('respects a restricted stage list', () => {
    const inv = invoice({ due_date: '2026-08-28T00:00:00.000Z' }); // due_today
    const restricted = { enabled: true, stages: ['due_in_7' as const] };
    expect(computeDueReminders([inv], restricted, new Set(), NOW)).toEqual([]);
  });

  it('defaults match the DEFAULT_REMINDER_CONFIG stage list', () => {
    const inv = invoice({ due_date: '2026-08-21T00:00:00.000Z' }); // overdue_7
    const decisions = computeDueReminders([inv], DEFAULT_REMINDER_CONFIG, new Set(), NOW);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].stage).toBe('overdue_7');
  });
});

describe('reminderKey / alreadySent', () => {
  it('builds a stable composite key', () => {
    expect(reminderKey('inv-1', 'due_today')).toBe('inv-1:due_today');
  });

  it('detects an existing row for the exact invoice/stage/channel', () => {
    const existing = [{ invoice_id: 'inv-1', stage: 'due_today' as const, channel: 'email' as const }];
    expect(alreadySent(existing, 'inv-1', 'due_today', 'email')).toBe(true);
    expect(alreadySent(existing, 'inv-1', 'due_today', 'webhook')).toBe(false);
    expect(alreadySent(existing, 'inv-2', 'due_today', 'email')).toBe(false);
  });
});
