/**
 * Unit tests — listenToEvents (SDK event stream)
 *
 * Strategy
 * --------
 * - Pure in-process, no network. `SorobanRpc.Server` is vi.mocked so every
 *   test controls the RPC responses directly.
 * - Raw event fixtures are built with `nativeToScVal` so the same encoding
 *   path used by real Soroban nodes is exercised through decoding.
 * - vitest fake timers let tests advance `setTimeout` without real wall-clock
 *   delays.  We use `vi.advanceTimersByTimeAsync(n)` rather than
 *   `runAllTimersAsync` to avoid the infinite-loop abort that the self-
 *   re-scheduling poll loop would trigger.
 *
 * Polling protocol
 * ----------------
 * listenToEvents schedules polls via setTimeout(runPoll, delay):
 *   - Poll 0 fires at t=0  (scheduleNext(0) on start, no startLedger given)
 *     → resolves currentLedger from getLatestLedger(); no getEvents call yet
 *   - Poll 1 fires at t=pollIntervalMs
 *     → calls getLatestLedger() + getEvents(); delivers events
 *   When startLedger is provided, Poll 0 is skipped (currentLedger already set)
 *   and Poll 1 fires at t=0 (first scheduleNext(0)) and Poll 2 at t=pollIntervalMs.
 *
 * Coverage
 * --------
 * 1.  Argument validation — missing rpcUrl, missing contractIds
 * 2.  Typed payload decoding for every one of the 20 protocol event names
 * 3.  `eventTypes` filter — only matching events are delivered
 * 4.  Unknown / malformed events are silently skipped
 * 5.  `stop()` cancels polling and suppresses further callbacks
 * 6.  Error handling — onError called on RPC failure; polling retries with
 *     exponential back-off; `attempt` and `nextRetryMs` are correct
 * 7.  `onEvent` throwing never crashes the poll loop
 * 8.  `startLedger` is forwarded to the RPC filter
 * 9.  Events are deduplicated across ledger windows (cursor advance)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { nativeToScVal, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { listenToEvents, replayEvents } from '../src/events';
import type { ProtocolEvent, ListenToEventsOptions, ReplayEventsOptions } from '../src/events';

// ── Mock SorobanRpc.Server ────────────────────────────────────────────────────
// vi.mock hoists to the top so the import in events.ts picks up the mock.

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(),
    },
  };
});

// ── Constants ────────────────────────────────────────────────────────────────

const CONTRACT_ID = 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const TX_HASH = 'abc123def456';
/** Default poll interval used in every test (ms). */
const POLL_MS = 5_000;

// ── Fixture builder ───────────────────────────────────────────────────────────

/**
 * Build a minimal fake `EventResponse` mirroring the Soroban RPC shape.
 * Topics are ScVal symbols; value is an array ScVal of data fields.
 */
function makeRawEvent(
  eventName: string,
  subjectId: string,
  dataFields: unknown[],
  ledger = 100,
  contractId: string = CONTRACT_ID,
): SorobanRpc.Api.EventResponse {
  return {
    id: `${ledger}-0`,
    type: 'contract' as const,
    ledger,
    ledgerClosedAt: new Date().toISOString(),
    contractId,
    txHash: TX_HASH,
    topic: [
      nativeToScVal(eventName, { type: 'symbol' }),
      nativeToScVal(subjectId,  { type: 'symbol' }),
    ],
    value: nativeToScVal(dataFields),
    pagingToken: `${ledger}-0`,
    inSuccessfulContractCall: true,
  } as unknown as SorobanRpc.Api.EventResponse;
}

// ── Mock server wiring ────────────────────────────────────────────────────────

type LatestLedgerResult = { sequence: number };
type GetEventsResult    = { events: SorobanRpc.Api.EventResponse[]; latestLedger: number };

let mockGetLatestLedger: MockedFunction<() => Promise<LatestLedgerResult>>;
let mockGetEvents: MockedFunction<(params: unknown) => Promise<GetEventsResult>>;

function setupMockServer(
  defaultLatestLedger = 100,
  defaultEvents: SorobanRpc.Api.EventResponse[] = [],
) {
  mockGetLatestLedger = vi
    .fn()
    .mockResolvedValue({ sequence: defaultLatestLedger });
  mockGetEvents = vi
    .fn()
    .mockResolvedValue({ events: defaultEvents, latestLedger: defaultLatestLedger });

  (SorobanRpc.Server as unknown as MockedFunction<() => unknown>).mockImplementation(() => ({
    getLatestLedger: mockGetLatestLedger,
    getEvents: mockGetEvents,
  }));
}

// ── Option helpers ────────────────────────────────────────────────────────────

function baseOptions(
  overrides: Partial<ListenToEventsOptions> = {},
): ListenToEventsOptions {
  return {
    rpcUrl: RPC_URL,
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractIds: [CONTRACT_ID],
    onEvent: vi.fn(),
    pollIntervalMs: POLL_MS,
    ...overrides,
  };
}

// ── Timer helpers ─────────────────────────────────────────────────────────────

/**
 * Advance fake timers enough to trigger exactly ONE poll cycle when no
 * `startLedger` is given:
 *   - advance 0 ms  → fires scheduleNext(0)  → seed poll (getLatestLedger only)
 *   - advance POLL_MS → fires the real poll → getLatestLedger + getEvents
 * We flush microtasks at each step to let promises resolve.
 */
async function runOnePollCycle(): Promise<void> {
  // Step 1: fire the initial scheduleNext(0) — seeds currentLedger
  await vi.advanceTimersByTimeAsync(0);
  // Step 2: fire the first real poll
  await vi.advanceTimersByTimeAsync(POLL_MS);
}

/**
 * Same but for tests that supply `startLedger` — no seed step needed,
 * the first scheduleNext(0) already runs a full poll.
 */
async function runOnePollCycleWithStartLedger(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  setupMockServer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── 1. Argument validation ────────────────────────────────────────────────────

describe('listenToEvents — argument validation', () => {
  it('throws synchronously when rpcUrl is empty', () => {
    expect(() => listenToEvents(baseOptions({ rpcUrl: '' }))).toThrow('rpcUrl is required');
  });

  it('throws synchronously when contractIds is empty', () => {
    expect(() => listenToEvents(baseOptions({ contractIds: [] }))).toThrow(
      'at least one contractId is required',
    );
  });

  it('returns a stop function for valid options', () => {
    const stop = listenToEvents(baseOptions());
    expect(typeof stop).toBe('function');
    stop();
  });
});

// ── 2. Typed payload decoding ─────────────────────────────────────────────────

/**
 * Wire up mock server for a single poll returning `events`, collect typed
 * deliveries, and return them.
 */
async function collectEvents(
  events: SorobanRpc.Api.EventResponse[],
  opts: Partial<ListenToEventsOptions> = {},
): Promise<ProtocolEvent[]> {
  // Poll 0 (seed) calls getLatestLedger once.
  // Poll 1 calls getLatestLedger again then getEvents.
  mockGetLatestLedger
    .mockResolvedValueOnce({ sequence: 99 })   // seed → currentLedger = 99
    .mockResolvedValue({ sequence: 100 });     // subsequent polls
  mockGetEvents.mockResolvedValueOnce({ events, latestLedger: 100 });

  const received: ProtocolEvent[] = [];
  const stop = listenToEvents(
    baseOptions({ onEvent: (e) => received.push(e), ...opts }),
  );

  await runOnePollCycle();
  stop();
  return received;
}

describe('listenToEvents — typed payload decoding', () => {
  it('decodes inv_reg', async () => {
    const raw = makeRawEvent('inv_reg', 'inv_001', [
      'GORIGINATOR123456789012345678901234567890123456789012345',
      BigInt('5000000'),
      BigInt('1800000000'),
    ]);
    const [e] = await collectEvents([raw]);
    expect(e.type).toBe('inv_reg');
    expect(e.subjectId).toBe('inv_001');
    expect(e.contractId).toBe(CONTRACT_ID);
    expect(e.ledger).toBe(100);
    expect(e.txHash).toBe(TX_HASH);
    if (e.type === 'inv_reg') {
      expect(e.data.originator).toContain('GORIGINATOR');
      expect(e.data.amount).toBe(BigInt('5000000'));
      expect(e.data.dueDate).toBe(BigInt('1800000000'));
    }
  });

  it('decodes inv_amt', async () => {
    const [e] = await collectEvents([makeRawEvent('inv_amt', 'inv_002', [BigInt('9999999')])]);
    expect(e.type).toBe('inv_amt');
    if (e.type === 'inv_amt') expect(e.data.newAmount).toBe(BigInt('9999999'));
  });

  it('decodes inv_sts', async () => {
    const [e] = await collectEvents([makeRawEvent('inv_sts', 'inv_003', ['Financed'])]);
    expect(e.type).toBe('inv_sts');
    if (e.type === 'inv_sts') expect(e.data.newStatus).toBe('Financed');
  });

  it('decodes inv_cxl', async () => {
    const [e] = await collectEvents([
      makeRawEvent('inv_cxl', 'inv_004', ['GCANCELLER12345678901234567890123456789012345678901234567']),
    ]);
    expect(e.type).toBe('inv_cxl');
    if (e.type === 'inv_cxl') expect(e.data.originator).toContain('GCANCELLER');
  });

  it('decodes inv_ovd', async () => {
    const [e] = await collectEvents([makeRawEvent('inv_ovd', 'inv_005', [BigInt('1700000000')])]);
    expect(e.type).toBe('inv_ovd');
    if (e.type === 'inv_ovd') expect(e.data.dueDate).toBe(BigInt('1700000000'));
  });

  it('decodes inv_def', async () => {
    const [e] = await collectEvents([makeRawEvent('inv_def', 'inv_006', ['inv_006'])]);
    expect(e.type).toBe('inv_def');
    if (e.type === 'inv_def') expect(e.data.invoiceId).toBe('inv_006');
  });

  it('decodes inv_dsp', async () => {
    const [e] = await collectEvents([
      makeRawEvent('inv_dsp', 'inv_007', ['GDISPUTER1234567890123456789012345678901234567890123456789']),
    ]);
    expect(e.type).toBe('inv_dsp');
    if (e.type === 'inv_dsp') expect(e.data.originator).toContain('GDISPUTER');
  });

  it('decodes inv_rsl', async () => {
    const [e] = await collectEvents([makeRawEvent('inv_rsl', 'inv_008', ['Cancelled'])]);
    expect(e.type).toBe('inv_rsl');
    if (e.type === 'inv_rsl') expect(e.data.newStatus).toBe('Cancelled');
  });

  it('decodes off_new', async () => {
    const [e] = await collectEvents([
      makeRawEvent('off_new', 'off_001', [
        'inv_010',
        'GLENDER123456789012345678901234567890123456789012345678',
        BigInt('2000000'),
        500,
      ]),
    ]);
    expect(e.type).toBe('off_new');
    if (e.type === 'off_new') {
      expect(e.data.invoiceId).toBe('inv_010');
      expect(e.data.lender).toContain('GLENDER');
      expect(e.data.amount).toBe(BigInt('2000000'));
      expect(e.data.interestRate).toBe(500);
    }
  });

  it('decodes off_wdr', async () => {
    const [e] = await collectEvents([
      makeRawEvent('off_wdr', 'off_002', ['GLENDER123456789012345678901234567890123456789012345678']),
    ]);
    expect(e.type).toBe('off_wdr');
    if (e.type === 'off_wdr') expect(e.data.lender).toContain('GLENDER');
  });

  it('decodes off_acc', async () => {
    const [e] = await collectEvents([
      makeRawEvent('off_acc', 'off_003', [
        'inv_011',
        'GLENDER123456789012345678901234567890123456789012345678',
        BigInt('3000000'),
      ]),
    ]);
    expect(e.type).toBe('off_acc');
    if (e.type === 'off_acc') {
      expect(e.data.invoiceId).toBe('inv_011');
      expect(e.data.amount).toBe(BigInt('3000000'));
    }
  });

  it('decodes off_rej', async () => {
    const [e] = await collectEvents([makeRawEvent('off_rej', 'off_004', ['inv_012'])]);
    expect(e.type).toBe('off_rej');
    if (e.type === 'off_rej') expect(e.data.invoiceId).toBe('inv_012');
  });

  it('decodes off_def', async () => {
    const [e] = await collectEvents([
      makeRawEvent('off_def', 'off_005', [
        'inv_013',
        'GLENDER123456789012345678901234567890123456789012345678',
      ]),
    ]);
    expect(e.type).toBe('off_def');
    if (e.type === 'off_def') {
      expect(e.data.invoiceId).toBe('inv_013');
      expect(e.data.lender).toContain('GLENDER');
    }
  });

  it('decodes pos_mint', async () => {
    const [e] = await collectEvents([
      makeRawEvent('pos_mint', 'off_006', [
        'GLENDER123456789012345678901234567890123456789012345678',
        BigInt('1000000'),
      ]),
    ]);
    expect(e.type).toBe('pos_mint');
    if (e.type === 'pos_mint') {
      expect(e.data.lender).toContain('GLENDER');
      expect(e.data.amount).toBe(BigInt('1000000'));
    }
  });

  it('decodes inv_rep', async () => {
    const [e] = await collectEvents([
      makeRawEvent('inv_rep', 'inv_014', ['off_007', BigInt('500000'), true]),
    ]);
    expect(e.type).toBe('inv_rep');
    if (e.type === 'inv_rep') {
      expect(e.data.offerId).toBe('off_007');
      expect(e.data.amount).toBe(BigInt('500000'));
      expect(e.data.fullyRepaid).toBe(true);
    }
  });

  it('decodes pool_stk', async () => {
    const [e] = await collectEvents([
      makeRawEvent('pool_stk', 'pool_001', [
        'GSTAKER123456789012345678901234567890123456789012345678',
        BigInt('10000000'),
      ]),
    ]);
    expect(e.type).toBe('pool_stk');
    if (e.type === 'pool_stk') {
      expect(e.data.staker).toContain('GSTAKER');
      expect(e.data.amount).toBe(BigInt('10000000'));
    }
  });

  it('decodes pool_un', async () => {
    const [e] = await collectEvents([
      makeRawEvent('pool_un', 'pool_002', [
        'GSTAKER123456789012345678901234567890123456789012345678',
        BigInt('5000000'),
      ]),
    ]);
    expect(e.type).toBe('pool_un');
    if (e.type === 'pool_un') {
      expect(e.data.staker).toContain('GSTAKER');
      expect(e.data.amount).toBe(BigInt('5000000'));
    }
  });

  it('decodes pool_pay', async () => {
    const [e] = await collectEvents([
      makeRawEvent('pool_pay', 'pool_003', [
        'GRECIPIENT12345678901234567890123456789012345678901234',
        BigInt('2000000'),
      ]),
    ]);
    expect(e.type).toBe('pool_pay');
    if (e.type === 'pool_pay') {
      expect(e.data.recipient).toContain('GRECIPIENT');
      expect(e.data.amount).toBe(BigInt('2000000'));
    }
  });

  it('decodes reputn', async () => {
    const [e] = await collectEvents([
      makeRawEvent('reputn', 'rep_001', [
        'GADDRESS1234567890123456789012345678901234567890123456',
        85,
      ]),
    ]);
    expect(e.type).toBe('reputn');
    if (e.type === 'reputn') {
      expect(e.data.address).toContain('GADDRESS');
      expect(e.data.score).toBe(85);
    }
  });
});

// ── 3. eventTypes filter ──────────────────────────────────────────────────────

describe('listenToEvents — eventTypes filter', () => {
  it('delivers only events matching the eventTypes filter', async () => {
    const rawEvents = [
      makeRawEvent('inv_reg', 'inv_100', [
        'GORIGINATOR123456789012345678901234567890123456789012345',
        BigInt(1),
        BigInt(9_999_999_999),
      ]),
      makeRawEvent('off_new', 'off_100', [
        'inv_100',
        'GLENDER123456789012345678901234567890123456789012345678',
        BigInt(1),
        100,
      ]),
      makeRawEvent('inv_rep', 'inv_100', ['off_100', BigInt(1), false]),
    ];

    const received = await collectEvents(rawEvents, { eventTypes: ['inv_reg', 'inv_rep'] });
    expect(received.map((e) => e.type)).toEqual(['inv_reg', 'inv_rep']);
  });

  it('delivers all event types when eventTypes is omitted', async () => {
    const rawEvents = [
      makeRawEvent('inv_reg', 'inv_200', [
        'GORIGINATOR123456789012345678901234567890123456789012345',
        BigInt(1),
        BigInt(9_999_999_999),
      ]),
      makeRawEvent('off_acc', 'off_200', [
        'inv_200',
        'GLENDER123456789012345678901234567890123456789012345678',
        BigInt(1),
      ]),
    ];
    const received = await collectEvents(rawEvents);
    expect(received).toHaveLength(2);
    const types = received.map((e) => e.type);
    expect(types).toContain('inv_reg');
    expect(types).toContain('off_acc');
  });
});

// ── 4. Unknown / malformed events ─────────────────────────────────────────────

describe('listenToEvents — unknown and malformed events', () => {
  it('silently skips events with an unknown event name', async () => {
    const events = await collectEvents([makeRawEvent('totally_unknown', 'sub_001', ['data'])]);
    expect(events).toHaveLength(0);
  });

  it('silently skips events whose topic array is empty', async () => {
    const badEvent = {
      ...makeRawEvent('inv_reg', 'inv_bad', ['GFOO', BigInt(1), BigInt(9)]),
      topic: [],
    } as unknown as SorobanRpc.Api.EventResponse;
    const events = await collectEvents([badEvent]);
    expect(events).toHaveLength(0);
  });

  it('still delivers valid events even when a mixed batch contains a bad event', async () => {
    const badEvent = {
      ...makeRawEvent('inv_reg', 'inv_bad', []),
      topic: [],
    } as unknown as SorobanRpc.Api.EventResponse;
    const goodEvent = makeRawEvent('off_rej', 'off_good', ['inv_999']);

    const events = await collectEvents([badEvent, goodEvent]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('off_rej');
  });
});

// ── 5. stop() ─────────────────────────────────────────────────────────────────

describe('listenToEvents — stop()', () => {
  it('cancels polling so no further callbacks fire after stop()', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 99 });
    mockGetEvents.mockResolvedValue({ events: [], latestLedger: 99 });

    const onEvent = vi.fn();
    const stop = listenToEvents(baseOptions({ onEvent }));

    // Advance through the seed poll only.
    await vi.advanceTimersByTimeAsync(0);
    stop();

    // Advance well past what would be the next poll; no getEvents call expected.
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);

    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  it('calling stop() twice does not throw', () => {
    const stop = listenToEvents(baseOptions());
    expect(() => { stop(); stop(); }).not.toThrow();
  });
});

// ── 6. Error handling / retry with back-off ───────────────────────────────────

describe('listenToEvents — error handling and retry back-off', () => {
  it('calls onError with the error and attempt/nextRetryMs context on RPC failure', async () => {
    // Seed succeeds; second getLatestLedger call (in real poll) throws.
    mockGetLatestLedger
      .mockResolvedValueOnce({ sequence: 99 })          // seed
      .mockRejectedValueOnce(new Error('RPC down'));    // first real poll

    const errorCtx: Array<{ attempt: number; nextRetryMs: number }> = [];
    const onError = vi.fn((_err: Error, ctx: { attempt: number; nextRetryMs: number }) => {
      errorCtx.push(ctx);
    });

    const stop = listenToEvents(baseOptions({ onError }));
    await runOnePollCycle();
    stop();

    expect(onError).toHaveBeenCalledOnce();
    expect(errorCtx[0].attempt).toBe(1);
    // back-off formula: pollIntervalMs * 2^(attempt-1) = 5000 * 1 = 5000
    expect(errorCtx[0].nextRetryMs).toBe(5_000);
  });

  it('doubles back-off on consecutive failures', async () => {
    mockGetLatestLedger
      .mockResolvedValueOnce({ sequence: 99 })                       // seed
      .mockRejectedValue(new Error('persistent RPC failure'));        // all subsequent

    const errorCtx: Array<{ attempt: number; nextRetryMs: number }> = [];
    const onError = vi.fn((_err: Error, ctx: { attempt: number; nextRetryMs: number }) => {
      errorCtx.push(ctx);
    });

    const stop = listenToEvents(baseOptions({ onError, pollIntervalMs: 1_000 }));

    // Seed:
    await vi.advanceTimersByTimeAsync(0);
    // Poll 1 fails → back-off 1000 ms
    await vi.advanceTimersByTimeAsync(1_000);
    // Poll 2 fails → back-off 2000 ms
    await vi.advanceTimersByTimeAsync(2_000);
    // Poll 3 fails → back-off 4000 ms
    await vi.advanceTimersByTimeAsync(4_000);

    stop();

    expect(errorCtx.length).toBeGreaterThanOrEqual(3);
    expect(errorCtx[0]).toMatchObject({ attempt: 1, nextRetryMs: 1_000 });
    expect(errorCtx[1]).toMatchObject({ attempt: 2, nextRetryMs: 2_000 });
    expect(errorCtx[2]).toMatchObject({ attempt: 3, nextRetryMs: 4_000 });
  });

  it('resets consecutive failure count after a successful poll', async () => {
    mockGetLatestLedger
      .mockResolvedValueOnce({ sequence: 99 })              // seed
      .mockRejectedValueOnce(new Error('transient'))        // poll 1 fails
      .mockResolvedValue({ sequence: 100 });                // poll 2+ succeed
    mockGetEvents.mockResolvedValue({ events: [], latestLedger: 100 });

    const errorCtx: Array<{ attempt: number }> = [];
    const onError = vi.fn((_err: Error, ctx: { attempt: number; nextRetryMs: number }) => {
      errorCtx.push({ attempt: ctx.attempt });
    });

    const stop = listenToEvents(baseOptions({ onError, pollIntervalMs: 1_000 }));

    await vi.advanceTimersByTimeAsync(0);      // seed
    await vi.advanceTimersByTimeAsync(1_000);  // poll 1 fails
    await vi.advanceTimersByTimeAsync(1_000);  // poll 2 succeeds → resets counter
    await vi.advanceTimersByTimeAsync(1_000);  // poll 3 succeeds (no new error)

    stop();

    // Only the single transient failure.
    expect(errorCtx.length).toBe(1);
    expect(errorCtx[0].attempt).toBe(1);
  });

  it('does not crash the poll loop when onError itself throws', async () => {
    mockGetLatestLedger
      .mockResolvedValueOnce({ sequence: 99 })
      .mockRejectedValueOnce(new Error('rpc fail'));

    const stop = listenToEvents(
      baseOptions({
        onError: () => { throw new Error('onError kaboom'); },
      }),
    );

    // Should not throw.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    stop();
  });
});

// ── 7. onEvent exception isolation ───────────────────────────────────────────

describe('listenToEvents — onEvent exception isolation', () => {
  it('continues delivering subsequent events when onEvent throws on the first event', async () => {
    const rawEvents = [
      makeRawEvent('inv_cxl', 'inv_throw', [
        'GORIGINATOR123456789012345678901234567890123456789012345',
      ]),
      makeRawEvent('off_rej', 'off_survive', ['inv_survive']),
    ];

    mockGetLatestLedger
      .mockResolvedValueOnce({ sequence: 99 })
      .mockResolvedValue({ sequence: 100 });
    mockGetEvents.mockResolvedValueOnce({ events: rawEvents, latestLedger: 100 });

    const received: string[] = [];
    let callCount = 0;
    const stop = listenToEvents(
      baseOptions({
        onEvent: (e) => {
          callCount++;
          if (callCount === 1) throw new Error('user handler exploded');
          received.push(e.type);
        },
      }),
    );

    await runOnePollCycle();
    stop();

    // The second event is still delivered despite the first throwing.
    expect(received).toEqual(['off_rej']);
  });
});

// ── 8. startLedger option ─────────────────────────────────────────────────────

describe('listenToEvents — startLedger option', () => {
  it('uses startLedger as the initial cursor and runs the first poll immediately', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 200 });
    mockGetEvents.mockResolvedValueOnce({ events: [], latestLedger: 200 });

    const stop = listenToEvents(baseOptions({ startLedger: 150 }));

    // With startLedger set there is no seed step; first poll fires at scheduleNext(0).
    await runOnePollCycleWithStartLedger();
    stop();

    expect(mockGetEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 150 }),
    );
  });
});

// ── 9. Cursor advance — no double-delivery ────────────────────────────────────

describe('listenToEvents — cursor advance', () => {
  it('advances the cursor so events from already-processed ledgers are not re-delivered', async () => {
    const event1 = makeRawEvent(
      'off_wdr', 'off_wdr_1',
      ['GLENDER123456789012345678901234567890123456789012345678'],
      100,
    );
    const event2 = makeRawEvent(
      'off_wdr', 'off_wdr_2',
      ['GLENDER123456789012345678901234567890123456789012345678'],
      101,
    );

    // seed → 99; poll 1 → latestLedger=100; poll 2 → latestLedger=101
    mockGetLatestLedger
      .mockResolvedValueOnce({ sequence: 99 })
      .mockResolvedValueOnce({ sequence: 100 })
      .mockResolvedValueOnce({ sequence: 101 });

    mockGetEvents
      .mockResolvedValueOnce({ events: [event1], latestLedger: 100 })
      .mockResolvedValueOnce({ events: [event2], latestLedger: 101 });

    const received: ProtocolEvent[] = [];
    const stop = listenToEvents(
      baseOptions({ onEvent: (e) => received.push(e), pollIntervalMs: 1_000 }),
    );

    await vi.advanceTimersByTimeAsync(0);      // seed
    await vi.advanceTimersByTimeAsync(1_000);  // poll 1 → event1
    await vi.advanceTimersByTimeAsync(1_000);  // poll 2 → event2
    stop();

    expect(received).toHaveLength(2);
    expect(received[0].subjectId).toBe('off_wdr_1');
    expect(received[1].subjectId).toBe('off_wdr_2');

    // Second getEvents call must use cursor advanced past ledger 100.
    expect(mockGetEvents.mock.calls[1][0]).toMatchObject({ startLedger: 101 });
  });
});

// ── 10. replayEvents ───────────────────────────────────────────────────────────

describe('replayEvents — argument validation', () => {
  it('throws when from is missing, negative, or not an integer', async () => {
    await expect(replayEvents({ from: undefined } as unknown as ReplayEventsOptions)).rejects.toThrow('valid starting ledger');
    await expect(replayEvents({ from: -1 })).rejects.toThrow('non-negative integer');
    await expect(replayEvents({ from: 10.5 })).rejects.toThrow('non-negative integer');
  });

  it('throws when to is less than from', async () => {
    await expect(replayEvents({ from: 2000, to: 1000 })).rejects.toThrow('greater than or equal to');
  });

  it('throws when rpcUrl is explicitly empty', async () => {
    await expect(replayEvents({ rpcUrl: '', from: 1000, to: 2000 })).rejects.toThrow('rpcUrl must not be empty');
  });
});

describe('replayEvents — basic range replay', () => {
  it('fetches events in range and delivers them in chronological order', async () => {
    const raw1 = makeRawEvent(
      'inv_reg', 'inv_1001',
      ['GBUSINESS1234567890123456789012345678901234567890123456', 50_000n, 1_700_000_000n],
      1050,
    );
    const raw2 = makeRawEvent(
      'off_acc', 'off_2002',
      ['inv_1001', 'GLENDER123456789012345678901234567890123456789012345678', 50_000n],
      1100,
    );

    mockGetEvents.mockResolvedValueOnce({
      events: [raw1, raw2],
      latestLedger: 1200,
    });

    const received: ProtocolEvent[] = [];
    const result = await replayEvents({
      rpcUrl: RPC_URL,
      contractIds: [CONTRACT_ID],
      from: 1000,
      to: 1200,
      onEvent: (e) => received.push(e),
    });

    expect(result).toHaveLength(2);
    expect(received).toHaveLength(2);
    expect(result[0].type).toBe('inv_reg');
    expect(result[0].ledger).toBe(1050);
    expect(result[1].type).toBe('off_acc');
    expect(result[1].ledger).toBe(1100);

    expect(mockGetEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 1000,
        filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }],
      }),
    );
  });

  it('supports positional calling style replayEvents(from, to, callback, options)', async () => {
    const raw = makeRawEvent('inv_cxl', 'inv_cxl_1', ['GBUSINESS123'], 1050);
    mockGetEvents.mockResolvedValueOnce({
      events: [raw],
      latestLedger: 1100,
    });

    const callbackEvents: ProtocolEvent[] = [];
    const events = await replayEvents(1000, 1100, (e) => callbackEvents.push(e), {
      rpcUrl: RPC_URL,
      contractIds: [CONTRACT_ID],
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('inv_cxl');
    expect(callbackEvents).toHaveLength(1);
  });

  it('defaults to current latest ledger when to is omitted', async () => {
    mockGetLatestLedger.mockResolvedValueOnce({ sequence: 500 });
    mockGetEvents.mockResolvedValueOnce({
      events: [],
      latestLedger: 500,
    });

    const events = await replayEvents({
      rpcUrl: RPC_URL,
      contractIds: [CONTRACT_ID],
      from: 400,
    });

    expect(mockGetLatestLedger).toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(mockGetEvents).toHaveBeenCalledWith(expect.objectContaining({ startLedger: 400 }));
  });
});

describe('replayEvents — pagination across large ranges (>1000 ledgers)', () => {
  it('automatically splits ranges larger than 1000 ledgers into sequential window batches', async () => {
    const rawWindow1 = makeRawEvent('inv_reg', 'inv_w1', ['G1', 1000n, 12345n], 1500);
    const rawWindow2 = makeRawEvent('off_new', 'off_w2', ['inv_w1', 'G2', 1000n, 500], 2500);
    const rawWindow3 = makeRawEvent('inv_rep', 'inv_w3', ['off_w2', 1000n, true], 3200);

    // Range 1000..3500 (2501 ledgers) -> 3 windows: [1000..1999], [2000..2999], [3000..3500]
    mockGetEvents
      .mockResolvedValueOnce({ events: [rawWindow1], latestLedger: 3500 })
      .mockResolvedValueOnce({ events: [rawWindow2], latestLedger: 3500 })
      .mockResolvedValueOnce({ events: [rawWindow3], latestLedger: 3500 });

    const result = await replayEvents({
      rpcUrl: RPC_URL,
      contractIds: [CONTRACT_ID],
      from: 1000,
      to: 3500,
    });

    expect(result).toHaveLength(3);
    expect(result[0].subjectId).toBe('inv_w1');
    expect(result[1].subjectId).toBe('off_w2');
    expect(result[2].subjectId).toBe('inv_w3');

    expect(mockGetEvents).toHaveBeenCalledTimes(3);
    expect(mockGetEvents.mock.calls[0][0]).toMatchObject({ startLedger: 1000 });
    expect(mockGetEvents.mock.calls[1][0]).toMatchObject({ startLedger: 2000 });
    expect(mockGetEvents.mock.calls[2][0]).toMatchObject({ startLedger: 3000 });
  });

  it('paginates multiple pages within a single window using cursor', async () => {
    const rawPage1_1 = makeRawEvent('inv_reg', 'inv_p1_1', ['G1', 1000n, 12345n], 1020);
    const rawPage1_2 = makeRawEvent('inv_reg', 'inv_p1_2', ['G2', 2000n, 12345n], 1050);
    const rawPage2_1 = makeRawEvent('off_acc', 'off_p2_1', ['inv_p1_1', 'GL', 1000n], 1080);

    // Window 1000..1100 with limitPerPage=2
    mockGetEvents
      .mockResolvedValueOnce({
        events: [rawPage1_1, rawPage1_2],
        latestLedger: 1100,
        cursor: 'cursor-page-2',
      } as unknown as GetEventsResult)
      .mockResolvedValueOnce({
        events: [rawPage2_1],
        latestLedger: 1100,
      });

    const result = await replayEvents({
      rpcUrl: RPC_URL,
      contractIds: [CONTRACT_ID],
      from: 1000,
      to: 1100,
      limitPerPage: 2,
    });

    expect(result).toHaveLength(3);
    expect(result.map((e) => e.subjectId)).toEqual(['inv_p1_1', 'inv_p1_2', 'off_p2_1']);
    expect(mockGetEvents).toHaveBeenCalledTimes(2);
  });
});

describe('replayEvents — filtering & type safety', () => {
  it('filters events by contractId and eventTypes', async () => {
    const otherContractId = 'CBOTHERCONTRACT123456789012345678901234567890123456789012';
    const matching1 = makeRawEvent('inv_reg', 'inv_match', ['G1', 100n, 200n], 1010);
    const matching2 = makeRawEvent('off_acc', 'off_match', ['inv_match', 'G2', 100n], 1020);
    const wrongType = makeRawEvent('pool_stk', 'pool_1', ['G3', 500n], 1030);
    const wrongContract = makeRawEvent('inv_reg', 'inv_wrong_contract', ['G4', 100n, 200n], 1040, otherContractId);

    mockGetEvents.mockResolvedValueOnce({
      events: [matching1, matching2, wrongType, wrongContract],
      latestLedger: 1100,
    });

    const result = await replayEvents({
      rpcUrl: RPC_URL,
      contractIds: [CONTRACT_ID],
      eventTypes: ['inv_reg', 'off_acc'],
      from: 1000,
      to: 1100,
    });

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.type)).toEqual(['inv_reg', 'off_acc']);
    expect(result.map((e) => e.subjectId)).toEqual(['inv_match', 'off_match']);
  });

  it('correctly handles chronological sorting across replayed events', async () => {
    const rawLater = makeRawEvent('inv_rep', 'rep_2', ['off_1', 1000n, true], 1500);
    const rawEarlier = makeRawEvent('inv_reg', 'reg_1', ['G1', 1000n, 12345n], 1200);

    mockGetEvents.mockResolvedValueOnce({
      events: [rawLater, rawEarlier], // RPC returned unsorted
      latestLedger: 1600,
    });

    const result = await replayEvents({
      rpcUrl: RPC_URL,
      from: 1000,
      to: 1600,
    });

    expect(result).toHaveLength(2);
    expect(result[0].ledger).toBe(1200);
    expect(result[1].ledger).toBe(1500);
  });
});

