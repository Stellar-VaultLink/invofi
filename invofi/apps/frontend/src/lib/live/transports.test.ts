import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPollingTransport, createWebSocketTransport, decodeEnvelope } from './transports';

// ── SDK mocking ──────────────────────────────────────────────────────────────
// The polling transport delegates to the SDK's listenToEvents; stub it so we
// can assert wiring without a real RPC.

const { listenToEventsMock } = vi.hoisted(() => ({
  listenToEventsMock: vi.fn(),
}));

vi.mock('@invofi/sdk', () => ({
  listenToEvents: listenToEventsMock,
}));

// ── Fake WebSocket for the relay transport tests ────────────────────────────

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.();
  }

  emitClose() {
    this.onclose?.();
  }

  emitMessage(data: string) {
    this.onmessage?.({ data });
  }
}

describe('decodeEnvelope', () => {
  it('decodes position_updated with a received-time stamp', () => {
    expect(
      decodeEnvelope(
        JSON.stringify({ type: 'position_updated', positionId: 'off_1', fields: { status: 'Financed' } }),
      ),
    ).toEqual({
      kind: 'position_updated',
      positionId: 'off_1',
      fields: { status: 'Financed' },
      updatedAt: expect.any(Number),
    });
  });

  it('decodes yield_calculated with string bigint amounts', () => {
    expect(
      decodeEnvelope(
        JSON.stringify({ type: 'yield_calculated', positionId: 'off_1', apy: 12.5, earnedToDate: '250000' }),
      ),
    ).toEqual({
      kind: 'yield_calculated',
      positionId: 'off_1',
      apy: 12.5,
      earnedToDate: 250_000n,
      updatedAt: expect.any(Number),
    });
  });

  it('decodes repayment_received and forwards the cumulative remaining', () => {
    expect(
      decodeEnvelope(
        JSON.stringify({
          type: 'repayment_received',
          positionId: 'off_1',
          amountRepaid: '1000000',
          remaining: '5000000',
          progress: 0.2,
          fullyRepaid: false,
        }),
      ),
    ).toEqual({
      kind: 'repayment_received',
      positionId: 'off_1',
      amountRepaid: 1_000_000n,
      remaining: 5_000_000n,
      fullyRepaid: false,
      updatedAt: expect.any(Number),
    });
  });

  it('accepts repayment envelopes that omit progress', () => {
    const decoded = decodeEnvelope(
      JSON.stringify({
        type: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: '1000000',
        fullyRepaid: false,
      }),
    );
    expect(decoded).not.toBeNull();
    expect(decoded && decoded.kind).toBe('repayment_received');
  });

  it('rejects repayment envelopes with malformed or unsafe amounts', () => {
    expect(
      decodeEnvelope(
        JSON.stringify({ type: 'repayment_received', positionId: 'off_1', amountRepaid: {}, fullyRepaid: false }),
      ),
    ).toBeNull();
    // Above Number.MAX_SAFE_INTEGER → stroopsFromWire throws → caught → null.
    expect(
      decodeEnvelope(
        JSON.stringify({ type: 'repayment_received', positionId: 'off_1', amountRepaid: 9007199254740993, fullyRepaid: false }),
      ),
    ).toBeNull();
  });

  it('returns null for malformed or unknown envelopes', () => {
    expect(decodeEnvelope('not json')).toBeNull();
    expect(decodeEnvelope('{}')).toBeNull();
    expect(decodeEnvelope(JSON.stringify({ type: 'nope', positionId: 'off_1' }))).toBeNull();
  });
});

describe('createWebSocketTransport', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects, reports connected, and forwards relay updates', () => {
    const updates: unknown[] = [];
    const statuses: string[] = [];
    const transport = createWebSocketTransport({
      url: 'wss://relay.invofi.dev',
      onUpdate: update => updates.push(update),
      onConnectionChange: status => statuses.push(status),
      onResync: () => {},
      onGiveUp: () => {},
    });

    transport.start();
    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].emitMessage(
      JSON.stringify({ type: 'repayment_received', positionId: 'off_1', amountRepaid: 5, progress: 0, fullyRepaid: false }),
    );

    expect(statuses).toEqual(['connecting', 'connected']);
    expect(updates).toHaveLength(1);
  });

  it('reconnects with exponential backoff after a drop (≤ 5s first retry)', () => {
    const statuses: string[] = [];
    const transport = createWebSocketTransport({
      url: 'wss://relay.invofi.dev',
      onUpdate: () => {},
      onConnectionChange: status => statuses.push(status),
      onResync: () => {},
      onGiveUp: () => {},
      reconnectBaseMs: 1_000,
      maxReconnectAttempts: 3,
    });

    transport.start();
    FakeWebSocket.instances[0].emitOpen(); // connected once
    FakeWebSocket.instances[0].emitClose(); // drop

    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting']);

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1); // not yet reconnected
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2); // first retry within 1s

    FakeWebSocket.instances[1].emitOpen();
    FakeWebSocket.instances[1].emitClose();
    vi.advanceTimersByTime(2_000); // backoff doubled → 2s
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('gives up to the polling fallback after repeated failed initial attempts', () => {
    const giveUp: string[] = [];
    const transport = createWebSocketTransport({
      url: 'wss://relay.invofi.dev',
      onUpdate: () => {},
      onConnectionChange: () => {},
      onResync: () => {},
      onGiveUp: reason => giveUp.push(reason),
      reconnectBaseMs: 1_000,
      maxReconnectAttempts: 3,
    });

    transport.start(); // attempt 1 (instance 0)
    FakeWebSocket.instances[0].emitClose();
    vi.advanceTimersByTime(2_000); // → attempt 2 (instance 1)
    FakeWebSocket.instances[1].emitClose();
    vi.advanceTimersByTime(4_000); // → attempt 3 (instance 2)
    FakeWebSocket.instances[2].emitClose();

    expect(giveUp).toHaveLength(1);
    expect(FakeWebSocket.instances).toHaveLength(3); // no further attempts
  });

  it('hands off to polling after repeated failures once connected', () => {
    const giveUp: string[] = [];
    const statuses: string[] = [];
    const transport = createWebSocketTransport({
      url: 'wss://relay.invofi.dev',
      onUpdate: () => {},
      onConnectionChange: status => statuses.push(status),
      onResync: () => {},
      onGiveUp: reason => giveUp.push(reason),
      reconnectBaseMs: 1_000,
      maxReconnectAttempts: 3,
      maxRelayFailures: 2,
    });

    transport.start();
    FakeWebSocket.instances[0].emitOpen(); // connected
    FakeWebSocket.instances[0].emitClose(); // failure 1 → reconnect at 1s
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.instances[1].emitOpen();
    FakeWebSocket.instances[1].emitClose(); // failure 2 ≥ maxRelayFailures → give up
    expect(giveUp).toEqual(['connection closed']);
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(2); // no more reconnects
  });

  it('treats a stalled handshake as a failed connect', () => {
    const statuses: string[] = [];
    const transport = createWebSocketTransport({
      url: 'wss://relay.invofi.dev',
      onUpdate: () => {},
      onConnectionChange: status => statuses.push(status),
      onResync: () => {},
      onGiveUp: () => {},
      connectTimeoutMs: 1_000,
    });

    transport.start();
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1_000); // no onopen ever fires
    expect(FakeWebSocket.instances[0].closed).toBe(true);
    expect(statuses).toContain('connecting');
    // A retry is scheduled after the timed-out attempt.
    vi.advanceTimersByTime(2_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('stop() cancels pending reconnects and detaches handlers', () => {
    const updates: unknown[] = [];
    const transport = createWebSocketTransport({
      url: 'wss://relay.invofi.dev',
      onUpdate: update => updates.push(update),
      onConnectionChange: () => {},
      onResync: () => {},
      onGiveUp: () => {},
      reconnectBaseMs: 1_000,
      maxReconnectAttempts: 3,
    });

    transport.start();
    const first = FakeWebSocket.instances[0];
    first.emitOpen();
    first.emitClose(); // schedules a reconnect
    transport.stop();

    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    first.emitMessage(
      JSON.stringify({ type: 'position_updated', positionId: 'off_1', fields: {} }),
    );
    expect(updates).toHaveLength(0);
  });
});

describe('createPollingTransport', () => {
  beforeEach(() => {
    listenToEventsMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to protocol events and reports polling status', () => {
    const statuses: string[] = [];
    const transport = createPollingTransport({
      contractIds: ['registry', 'financing', 'repayment'],
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'testnet',
      onUpdate: () => {},
      onConnectionChange: status => statuses.push(status),
      onResync: () => {},
    });

    transport.start();

    expect(statuses).toEqual(['polling']);
    expect(listenToEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTypes: expect.arrayContaining(['inv_rep', 'off_acc']),
        contractIds: ['registry', 'financing', 'repayment'],
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'testnet',
        pollIntervalMs: 5_000,
      }),
    );
  });

  it('maps inv_rep events to repayment updates without an extra resync', () => {
    type TestEvent = {
      type: string;
      subjectId: string;
      data: { amount: bigint; fullyRepaid: boolean };
    };
    const updates: unknown[] = [];
    let resyncs = 0;
    const captured: { onEvent: ((event: TestEvent) => void) | null } = { onEvent: null };
    listenToEventsMock.mockImplementation((opts: { onEvent: (event: TestEvent) => void }) => {
      captured.onEvent = opts.onEvent;
      return () => {};
    });

    const transport = createPollingTransport({
      contractIds: ['repayment'],
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'testnet',
      onUpdate: update => updates.push(update),
      onConnectionChange: () => {},
      onResync: () => resyncs++,
    });

    transport.start();
    captured.onEvent?.({
      type: 'inv_rep',
      subjectId: 'off_1',
      data: { amount: 1_000_000n, fullyRepaid: false },
    });

    expect(updates).toEqual([
      {
        kind: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: 1_000_000n,
        fullyRepaid: false,
        updatedAt: expect.any(Number),
      },
    ]);
    expect(resyncs).toBe(0);
  });

  it('coalesces a batch of non-repayment events into a single resync', () => {
    vi.useFakeTimers();
    type TestEvent = { type: string; subjectId: string };
    const captured: { onEvent: ((event: TestEvent) => void) | null } = { onEvent: null };
    listenToEventsMock.mockImplementation((opts: { onEvent: (event: TestEvent) => void }) => {
      captured.onEvent = opts.onEvent;
      return () => {};
    });
    let resyncs = 0;

    const transport = createPollingTransport({
      contractIds: ['registry'],
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'testnet',
      onUpdate: () => {},
      onConnectionChange: () => {},
      onResync: () => resyncs++,
    });

    transport.start();
    captured.onEvent?.({ type: 'off_acc', subjectId: 'off_1' });
    captured.onEvent?.({ type: 'off_acc', subjectId: 'off_2' });
    expect(resyncs).toBe(0);

    vi.advanceTimersByTime(0); // debounce fires once for the whole batch
    expect(resyncs).toBe(1);
  });

  it('forwards poll errors to the connection detail', () => {
    const statuses: string[] = [];
    const captured: { onError: ((error: Error) => void) | null } = { onError: null };
    listenToEventsMock.mockImplementation((opts: { onError: (error: Error) => void }) => {
      captured.onError = opts.onError;
      return () => {};
    });

    const transport = createPollingTransport({
      contractIds: ['repayment'],
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'testnet',
      onUpdate: () => {},
      onConnectionChange: (status, detail) => statuses.push(status, detail ?? ''),
      onResync: () => {},
    });

    transport.start();
    captured.onError?.(new Error('rpc unreachable'));

    expect(statuses).toContain('polling');
    expect(statuses).toContain('poll error: rpc unreachable');
  });

  it('does not call listenToEvents when no contracts are configured', () => {
    const transport = createPollingTransport({
      contractIds: [],
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'testnet',
      onUpdate: () => {},
      onConnectionChange: () => {},
      onResync: () => {},
    });

    transport.start();
    expect(listenToEventsMock).not.toHaveBeenCalled();
  });
});