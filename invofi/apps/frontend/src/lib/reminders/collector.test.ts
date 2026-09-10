import { describe, it, expect, vi } from 'vitest';
import {
  renderReminderEmail,
  sendReminderEmail,
  buildWebhookPayload,
  signWebhookPayload,
  sendWebhookWithRetry,
} from './collector';
import type { ReminderableInvoice } from './types';

const invoice: ReminderableInvoice = {
  id: 'inv-42',
  originator: 'GABC...',
  originator_id: 'user-1',
  amount: '2500.00',
  currency: 'USDC',
  due_date: '2026-09-04T00:00:00.000Z',
  status: 'Financed',
};

describe('renderReminderEmail', () => {
  it('renders an upcoming-due reminder', () => {
    const content = renderReminderEmail(invoice, 'due_in_7');
    expect(content.subject).toContain('inv-42');
    expect(content.subject).toContain('due in 7 days');
    expect(content.text).toContain('2500.00 USDC');
    expect(content.text).toContain('2026-09-04');
    expect(content.html).toContain('<strong>inv-42</strong>');
  });

  it('renders an overdue reminder with default language', () => {
    const content = renderReminderEmail(invoice, 'overdue_7');
    expect(content.subject).toContain('7 days overdue');
    expect(content.text).toContain('avoid a default flag');
  });
});

describe('sendReminderEmail', () => {
  it('posts to the Resend API and returns ok on 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const result = await sendReminderEmail(
      { apiKey: 'key_123', from: 'reminders@invofi.app' },
      'user@example.com',
      invoice,
      'due_today',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns an error on a failed response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('bad request'),
    });
    const result = await sendReminderEmail(
      { apiKey: 'key_123', from: 'reminders@invofi.app' },
      'user@example.com',
      invoice,
      'due_today',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('422');
  });

  it('returns an error when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await sendReminderEmail(
      { apiKey: 'key_123', from: 'reminders@invofi.app' },
      'user@example.com',
      invoice,
      'due_today',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
  });
});

describe('webhook payload + signature', () => {
  it('builds a stable payload shape', () => {
    const payload = buildWebhookPayload(invoice, 'due_in_1', new Date('2026-09-03T00:00:00.000Z'));
    expect(payload).toEqual({
      event: 'invoice.reminder',
      stage: 'due_in_1',
      invoice: {
        id: 'inv-42',
        originator: 'GABC...',
        amount: '2500.00',
        currency: 'USDC',
        due_date: '2026-09-04T00:00:00.000Z',
        status: 'Financed',
      },
      sent_at: '2026-09-03T00:00:00.000Z',
    });
  });

  it('produces a deterministic HMAC signature for the same secret/body', () => {
    const body = JSON.stringify({ a: 1 });
    const sig1 = signWebhookPayload(body, 'secret');
    const sig2 = signWebhookPayload(body, 'secret');
    expect(sig1).toBe(sig2);
    expect(signWebhookPayload(body, 'other-secret')).not.toBe(sig1);
  });
});

describe('sendWebhookWithRetry', () => {
  const payload = buildWebhookPayload(invoice, 'due_today');

  it('succeeds on the first attempt without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const delayImpl = vi.fn().mockResolvedValue(undefined);
    const result = await sendWebhookWithRetry('https://example.com/hook', payload, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delayImpl,
    });
    expect(result).toEqual({ ok: true, attempts: 1 });
    expect(delayImpl).not.toHaveBeenCalled();
  });

  it('retries with backoff and eventually succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true });
    const delayImpl = vi.fn().mockResolvedValue(undefined);
    const result = await sendWebhookWithRetry('https://example.com/hook', payload, {
      maxAttempts: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delayImpl,
    });
    expect(result).toEqual({ ok: true, attempts: 3 });
    expect(delayImpl).toHaveBeenNthCalledWith(1, 1000);
    expect(delayImpl).toHaveBeenNthCalledWith(2, 2000);
  });

  it('gives up after maxAttempts and reports the last error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const delayImpl = vi.fn().mockResolvedValue(undefined);
    const result = await sendWebhookWithRetry('https://example.com/hook', payload, {
      maxAttempts: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delayImpl,
    });
    expect(result).toEqual({ ok: false, error: 'ECONNRESET', attempts: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('signs the payload when a secret is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await sendWebhookWithRetry('https://example.com/hook', payload, {
      secret: 'shh',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['X-Invofi-Signature']).toBe(
      signWebhookPayload(JSON.stringify(payload), 'shh'),
    );
  });
});
