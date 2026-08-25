import { describe, expect, it } from 'vitest';
import { nativeToScVal, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import type { ProtocolEventName } from '@invofi/sdk';
import {
  EVENT_LABELS,
  invoiceIdScVal,
  parseRetentionStart,
  toTimelineEntries,
} from './invoiceEvents';

// TS checks this array against the ProtocolEventName union: an unknown or
// renamed literal here is a compile error, keeping the label map honest.
const ALL_EVENT_NAMES: ProtocolEventName[] = [
  'inv_reg',
  'inv_amt',
  'inv_sts',
  'inv_cxl',
  'inv_ovd',
  'inv_def',
  'inv_dsp',
  'inv_rsl',
  'off_new',
  'off_wdr',
  'off_acc',
  'off_rej',
  'off_def',
  'pos_mint',
  'inv_rep',
  'pool_stk',
  'pool_un',
  'pool_pay',
  'reputn',
];

interface RawEventOptions {
  name: string;
  /** topic[1] — the event's subject id. */
  subject?: string;
  /** Decoded-native payload (re-encoded via nativeToScVal). */
  value?: unknown;
  ledger?: number;
  txHash?: string;
  /** RPC per-event id; null simulates its absence. */
  id?: string | null;
  occurredAt?: string;
}

function rawEvent(opts: RawEventOptions): SorobanRpc.Api.EventResponse {
  const topic = [nativeToScVal(opts.name, { type: 'symbol' })];
  if (opts.subject !== undefined) {
    topic.push(nativeToScVal(opts.subject, { type: 'symbol' }));
  }
  return {
    id: opts.id === undefined ? `evt-${opts.name}-${opts.ledger ?? 1}` : opts.id,
    type: 'contract',
    ledger: opts.ledger ?? 100,
    ledgerClosedAt: opts.occurredAt ?? null,
    contractId: 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7',
    topic,
    value: opts.value !== undefined ? nativeToScVal(opts.value) : nativeToScVal(''),
    inSuccessfulContractCall: true,
    txHash: opts.txHash ?? 'ab'.repeat(64),
  } as unknown as SorobanRpc.Api.EventResponse;
}

describe('EVENT_LABELS', () => {
  it('covers every protocol event name exactly once', () => {
    expect(Object.keys(EVENT_LABELS).sort()).toEqual([...ALL_EVENT_NAMES].sort());
  });

  it('maps every label to a non-empty string', () => {
    for (const name of ALL_EVENT_NAMES) {
      expect(EVENT_LABELS[name], name).toBeTruthy();
    }
  });
});

describe('parseRetentionStart', () => {
  it('extracts the oldest retained ledger from the RPC range error', () => {
    expect(
      parseRetentionStart(
        'startLedger must be within the ledger range: 502341 - 601234',
      ),
    ).toBe(502341);
  });

  it('returns undefined for unrelated errors', () => {
    expect(parseRetentionStart('connection refused')).toBeUndefined();
    expect(parseRetentionStart('')).toBeUndefined();
  });
});

describe('toTimelineEntries', () => {
  it('keeps events whose subject id matches and maps label + fields', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({
          name: 'inv_reg',
          subject: 'inv_1',
          ledger: 500,
          occurredAt: '2026-08-01T00:00:00Z',
          txHash: 'cd'.repeat(32),
        }),
      ],
      'inv_1',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'inv_reg',
      label: 'Invoice registered',
      ledger: 500,
      occurredAt: '2026-08-01T00:00:00Z',
      txHash: 'cd'.repeat(32),
    });
  });

  it('matches map payloads carrying invoice_id when the subject is the offer id', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({
          name: 'off_new',
          subject: 'off_9',
          value: { invoice_id: 'inv_1', lender: 'GA'.repeat(16), amount: 1000 },
        }),
      ],
      'inv_1',
    );
    expect(entries.map(e => e.type)).toEqual(['off_new']);
  });

  it('matches array payloads whose first element is the invoice id', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({
          name: 'off_acc',
          subject: 'off_9',
          value: ['inv_1', 'GA'.repeat(16), 1000],
        }),
      ],
      'inv_1',
    );
    expect(entries.map(e => e.type)).toEqual(['off_acc']);
  });

  it('never treats inv_rep array payloads as invoice-scoped (first element is an offer id)', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({
          name: 'inv_rep',
          subject: 'off_9',
          value: ['inv_1', 500, true],
        }),
      ],
      'inv_1',
    );
    expect(entries).toHaveLength(0);
  });

  it('drops events belonging to other invoices and unknown event names', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({ name: 'inv_rep', subject: 'inv_other' }),
        rawEvent({ name: 'mystery_evt', subject: 'inv_1' }),
        rawEvent({ name: 'pool_stk', subject: 'GA'.repeat(16) }),
      ],
      'inv_1',
    );
    expect(entries).toHaveLength(0);
  });

  it('sorts newest-first regardless of input order', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({ name: 'inv_reg', subject: 'inv_1', ledger: 100 }),
        rawEvent({ name: 'inv_rep', subject: 'inv_1', ledger: 300 }),
        rawEvent({ name: 'off_acc', subject: 'inv_1', ledger: 200 }),
      ],
      'inv_1',
    );
    expect(entries.map(e => e.ledger)).toEqual([300, 200, 100]);
    expect(entries.map(e => e.type)).toEqual(['inv_rep', 'off_acc', 'inv_reg']);
  });

  it('deduplicates identical RPC event ids but keeps distinct same-tx events', () => {
    const entries = toTimelineEntries(
      [
        rawEvent({ name: 'inv_rep', subject: 'inv_1', ledger: 300, id: 'evt-a' }),
        rawEvent({ name: 'inv_rep', subject: 'inv_1', ledger: 300, id: 'evt-a' }),
        rawEvent({ name: 'inv_rep', subject: 'inv_1', ledger: 300, id: 'evt-b' }),
        // No id available → composite fallback keys keep both rows.
        rawEvent({ name: 'off_new', subject: 'inv_1', ledger: 150, id: null, txHash: 'tx1' }),
        rawEvent({ name: 'off_rej', subject: 'inv_1', ledger: 150, id: null, txHash: 'tx1' }),
      ],
      'inv_1',
    );
    expect(entries).toHaveLength(4);
  });

  it('tolerates malformed topics and values without throwing', () => {
    const broken = {
      id: 'evt-x',
      type: 'contract',
      ledger: 400,
      contractId: 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7',
      topic: [],
      value: {} as never,
      txHash: 'ef'.repeat(32),
    } as unknown as SorobanRpc.Api.EventResponse;

    expect(() => toTimelineEntries([broken, rawEvent({ name: 'inv_ovd', subject: 'inv_1', value: 42 })], 'inv_1')).not.toThrow();
    expect(toTimelineEntries([broken, rawEvent({ name: 'inv_ovd', subject: 'inv_1', value: 42 })], 'inv_1').map(e => e.type)).toEqual(['inv_ovd']);
  });

  it('defaults occurredAt to null when the RPC omits it', () => {
    const entries = toTimelineEntries([rawEvent({ name: 'inv_cxl', subject: 'inv_1' })], 'inv_1');
    expect(entries[0]?.occurredAt).toBeNull();
  });
});

describe('invoiceIdScVal', () => {
  it('round-trips an invoice id through the symbol ScVal used in topics', async () => {
    const { scValToNative } = await import('@stellar/stellar-sdk');
    expect(scValToNative(invoiceIdScVal('inv_smoke_demo'))).toBe('inv_smoke_demo');
  });
});
