import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinancingOffer } from '@invofi/sdk';
import { LivePortfolioEngine } from './engine';
import type { LivePositionUpdate } from './types';

const {
  wsStartMock,
  wsStopMock,
  pollingStartMock,
  pollingStopMock,
  createWsMock,
  createPollingMock,
} = vi.hoisted(() => ({
  wsStartMock: vi.fn(),
  wsStopMock: vi.fn(),
  pollingStartMock: vi.fn(),
  pollingStopMock: vi.fn(),
  createWsMock: vi.fn(),
  createPollingMock: vi.fn(),
}));

vi.mock('./transports', () => ({
  createWebSocketTransport: (opts: unknown) => {
    createWsMock(opts);
    return { start: wsStartMock, stop: wsStopMock };
  },
  createPollingTransport: (opts: unknown) => {
    createPollingMock(opts);
    return { start: pollingStartMock, stop: pollingStopMock };
  },
}));

/** Funded "now" so accrual is partial and observable across ticks. */
const makeActiveOffer = (nowSecs: number): FinancingOffer => ({
  id: 'off_1',
  invoice_id: 'inv_1',
  lender: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  amount: 10_000_000n,
  currency: 'USDC',
  interest_rate: 500,
  duration: 40,
  amount_repaid: 0n,
  status: 'Financed',
  funded_at: nowSecs,
});

describe('LivePortfolioEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsStartMock.mockClear();
    wsStopMock.mockClear();
    pollingStartMock.mockClear();
    pollingStopMock.mockClear();
    createWsMock.mockClear();
    createPollingMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('degrades to the polling transport when no WebSocket relay is configured', async () => {
    const statuses: Array<[string, string]> = [];
    const engine = new LivePortfolioEngine({
      wsUrl: null,
      contractIds: ['registry'],
      rpcUrl: 'https://rpc',
      networkPassphrase: 'testnet',
      fetchPositions: async () => [makeActiveOffer(Date.now() / 1000)],
      onPositions: () => {},
      onUpdate: () => {},
      onConnectionChange: (connection, transport) => statuses.push([connection, transport]),
    });

    await engine.start();

    expect(wsStartMock).not.toHaveBeenCalled();
    expect(pollingStartMock).toHaveBeenCalledTimes(1);
    expect(statuses).toContainEqual(['polling', 'polling']);
    // Contract + network wiring reaches the polling transport.
    const pollingOptions = createPollingMock.mock.calls[0][0] as Record<string, unknown>;
    expect(pollingOptions.contractIds).toEqual(['registry']);
    expect(pollingOptions.rpcUrl).toBe('https://rpc');
    expect(pollingOptions.networkPassphrase).toBe('testnet');
    engine.stop();
  });

  it('prefers the WebSocket relay when configured', async () => {
    const engine = new LivePortfolioEngine({
      wsUrl: 'wss://relay.invofi.dev',
      contractIds: ['registry'],
      rpcUrl: 'https://rpc',
      networkPassphrase: 'testnet',
      fetchPositions: async () => [],
      onPositions: () => {},
      onUpdate: () => {},
      onConnectionChange: () => {},
    });

    await engine.start();

    expect(wsStartMock).toHaveBeenCalledTimes(1);
    expect(pollingStartMock).not.toHaveBeenCalled();
    // URL and callbacks reach the WebSocket transport.
    const wsOptions = createWsMock.mock.calls[0][0] as Record<string, unknown>;
    expect(wsOptions.url).toBe('wss://relay.invofi.dev');
    expect(typeof wsOptions.onUpdate).toBe('function');
    expect(typeof wsOptions.onGiveUp).toBe('function');
    engine.stop();
  });

  it('degrades to polling when the configured relay gives up', async () => {
    const statuses: Array<[string, string]> = [];
    const engine = new LivePortfolioEngine({
      wsUrl: 'wss://relay.invofi.dev',
      contractIds: ['registry'],
      rpcUrl: 'https://rpc',
      networkPassphrase: 'testnet',
      fetchPositions: async () => [],
      onPositions: () => {},
      onUpdate: () => {},
      onConnectionChange: (connection, transport) => statuses.push([connection, transport]),
    });

    await engine.start();
    const wsOptions = createWsMock.mock.calls[0][0] as { onGiveUp: (reason: string) => void };
    wsOptions.onGiveUp('relay unreachable');

    expect(wsStopMock).toHaveBeenCalledTimes(1);
    expect(pollingStartMock).toHaveBeenCalledTimes(1);
    expect(statuses).toContainEqual(['polling', 'polling']);
    engine.stop();
  });

  it('accrues yield in real time, throttled to one update per position per second', async () => {
    const updates: Array<{ kind: string; positionId: string; earnedToDate?: bigint }> = [];
    const offer = makeActiveOffer(Date.now() / 1000);
    const engine = new LivePortfolioEngine({
      wsUrl: null,
      contractIds: [],
      rpcUrl: 'https://rpc',
      networkPassphrase: 'testnet',
      fetchPositions: async () => [offer],
      onPositions: () => {},
      onUpdate: update => updates.push(update),
      onConnectionChange: () => {},
      throttleMs: 1_000,
      yieldTickMs: 250,
    });

    await engine.start();
    expect(updates).toHaveLength(0);

    // First accrual lands at 250ms (leading edge); the coalescing window
    // closes at +1000ms delivering the latest accrued value.
    await vi.advanceTimersByTimeAsync(1_300);
    expect(updates).toHaveLength(2);
    expect(updates[0].kind).toBe('yield_calculated');
    expect(updates[0].positionId).toBe('off_1');
    // Accrual advances with the clock, not just the tick count.
    expect(updates[1].earnedToDate!).toBeGreaterThan(updates[0].earnedToDate!);

    // One more second → exactly one more delivery (never more than 1/sec).
    await vi.advanceTimersByTimeAsync(1_300);
    expect(updates).toHaveLength(3);
    expect(updates[2].earnedToDate!).toBeGreaterThan(updates[1].earnedToDate!);

    engine.stop();
  });

  it('delivers repayment and yield updates independently for the same position', async () => {
    const updates: LivePositionUpdate[] = [];
    const engine = new LivePortfolioEngine({
      wsUrl: 'wss://relay.invofi.dev',
      contractIds: ['registry'],
      rpcUrl: 'https://rpc',
      networkPassphrase: 'testnet',
      fetchPositions: async () => [makeActiveOffer(Date.now() / 1000)],
      onPositions: () => {},
      onUpdate: update => updates.push(update),
      onConnectionChange: () => {},
      throttleMs: 1_000,
      yieldTickMs: 250,
    });

    await engine.start();

    const wsOptions = createWsMock.mock.calls[0][0] as {
      onUpdate: (update: LivePositionUpdate) => void;
    };
    // A repayment arrives while the yield timer is running.
    wsOptions.onUpdate({
      kind: 'repayment_received',
      positionId: 'off_1',
      amountRepaid: 1_000_000n,
      fullyRepaid: false,
    });

    await vi.advanceTimersByTimeAsync(1_300);

    const kinds = updates.map(u => u.kind);
    expect(kinds).toContain('repayment_received');
    expect(kinds).toContain('yield_calculated');
    engine.stop();
  });

  it('stop() halts yield ticks and resyncs', async () => {
    const updates: unknown[] = [];
    let fetches = 0;
    const engine = new LivePortfolioEngine({
      wsUrl: null,
      contractIds: [],
      rpcUrl: 'https://rpc',
      networkPassphrase: 'testnet',
      fetchPositions: async () => {
        fetches++;
        return [makeActiveOffer(Date.now() / 1000)];
      },
      onPositions: () => {},
      onUpdate: update => updates.push(update),
      onConnectionChange: () => {},
      resyncIntervalMs: 500,
      yieldTickMs: 250,
    });

    await engine.start();
    engine.stop();
    const fetchesAtStop = fetches;

    await vi.advanceTimersByTimeAsync(5_000);

    expect(updates).toHaveLength(0);
    expect(fetches).toBe(fetchesAtStop);
    expect(pollingStopMock).toHaveBeenCalledTimes(1);
  });
});