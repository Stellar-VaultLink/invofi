import { describe, expect, it } from 'vitest';
import type { FinancingOffer } from '@invofi/sdk';
import {
  INITIAL_LIVE_PORTFOLIO_STATE,
  deriveLivePosition,
  livePortfolioReducer,
} from './reducer';
import { __setXlmUsdPriceForTests } from './prices';

const DAY = 86_400;
const offer: FinancingOffer = {
  id: 'off_1',
  invoice_id: 'inv_1',
  lender: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  amount: 10_000_000n, // 1 XLM
  currency: 'USDC',
  interest_rate: 500,
  duration: 30 * DAY,
  amount_repaid: 0n,
  status: 'Financed',
  funded_at: 1_000_000,
};

describe('deriveLivePosition', () => {
  it('computes apy, earned-to-date, remaining, progress, and USD value', () => {
    __setXlmUsdPriceForTests(null); // XLM fallback = 1
    const live = deriveLivePosition(offer, 1_000_000 + 15 * DAY);

    expect(live.apy).toBeCloseTo(60.83, 1);
    expect(live.earnedToDate).toBe(250_000n); // half of the 5% yield
    expect(live.totalDue).toBe(10_500_000n);
    expect(live.remaining).toBe(10_500_000n);
    expect(live.repaymentProgress).toBe(0);
    expect(live.liveValueUsd).toBeCloseTo(1.05, 5);
  });
});

describe('livePortfolioReducer', () => {
  it('starts loading with an empty portfolio', () => {
    expect(livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, { type: 'reset' })).toEqual(
      INITIAL_LIVE_PORTFOLIO_STATE,
    );
  });

  it('derives live rows from a full positions resync', () => {
    const state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    expect(state.loading).toBe(false);
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0].remaining).toBe(10_500_000n);
    expect(state.lastUpdatedAt).not.toBeNull();
  });

  it('applies a streamed repayment to the matching position', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: 2_000_000n,
        fullyRepaid: false,
        updatedAt: 1_000,
      },
    });

    expect(state.positions[0].amount_repaid).toBe(2_000_000n);
    expect(state.positions[0].remaining).toBe(8_500_000n);
    expect(state.positions[0].repaymentProgress).toBeCloseTo(2_000_000 / 10_500_000, 5);
  });

  it('marks a position Repaid when the final repayment arrives', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: 10_500_000n,
        fullyRepaid: true,
      },
    });

    expect(state.positions[0].status).toBe('Repaid');
    expect(state.positions[0].repaymentProgress).toBe(1);
  });

  it('uses a cumulative remaining to keep replayed repayments idempotent', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    const replay = {
      kind: 'repayment_received' as const,
      positionId: 'off_1',
      amountRepaid: 2_000_000n,
      remaining: 8_500_000n,
      fullyRepaid: false,
    };

    state = livePortfolioReducer(state, { type: 'update', update: replay });
    expect(state.positions[0].amount_repaid).toBe(2_000_000n);
    expect(state.positions[0].remaining).toBe(8_500_000n);

    // The same delivery replays after a reconnect — must not double-count.
    state = livePortfolioReducer(state, { type: 'update', update: replay });
    expect(state.positions[0].amount_repaid).toBe(2_000_000n);
    expect(state.positions[0].remaining).toBe(8_500_000n);
  });

  it('ignores stale cumulative repayments that arrived out of order', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    // A fresh delivery first...
    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: 2_000_000n,
        remaining: 8_500_000n,
        fullyRepaid: false,
      },
    });

    // ...then an older delivery replays with a higher (staler) remaining.
    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: 2_000_000n,
        remaining: 9_500_000n,
        fullyRepaid: false,
      },
    });

    expect(state.positions[0].amount_repaid).toBe(2_000_000n);
    expect(state.positions[0].remaining).toBe(8_500_000n);
  });

  it('falls back to incremental amounts when no cumulative value is sent', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'repayment_received',
        positionId: 'off_1',
        amountRepaid: 2_000_000n,
        fullyRepaid: false,
      },
    });

    expect(state.positions[0].amount_repaid).toBe(2_000_000n);
  });

  it('applies a yield_calculated stream update', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'yield_calculated',
        positionId: 'off_1',
        apy: 61,
        earnedToDate: 300_000n,
      },
    });

    expect(state.positions[0].apy).toBe(61);
    expect(state.positions[0].earnedToDate).toBe(300_000n);
  });

  it('merges partial offer fields from a position_updated event', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'position_updated',
        positionId: 'off_1',
        fields: { status: 'Repaid', amount_repaid: '10500000' },
      },
    });

    expect(state.positions[0].status).toBe('Repaid');
    expect(state.positions[0].amount_repaid).toBe(10_500_000n);
  });

  it('never crashes the reducer on malformed wire amounts', () => {
    let state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    state = livePortfolioReducer(state, {
      type: 'update',
      update: {
        kind: 'position_updated',
        positionId: 'off_1',
        fields: { amount_repaid: 'not-a-number' },
      },
    });

    expect(state.positions[0].amount_repaid).toBe(0n);
  });

  it('ignores updates for positions it does not know about', () => {
    const state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'positions',
      offers: [offer],
    });

    const next = livePortfolioReducer(state, {
      type: 'update',
      update: { kind: 'repayment_received', positionId: 'off_unknown', amountRepaid: 1n, fullyRepaid: false },
    });

    expect(next).toBe(state);
  });

  it('records the connection status and transport', () => {
    const state = livePortfolioReducer(INITIAL_LIVE_PORTFOLIO_STATE, {
      type: 'connection',
      connection: 'polling',
      transport: 'polling',
      detail: 'relay unreachable',
    });

    expect(state.connection).toBe('polling');
    expect(state.transport).toBe('polling');
    expect(state.connectionDetail).toBe('relay unreachable');
  });
});