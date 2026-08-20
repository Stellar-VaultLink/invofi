/**
 * Unit tests — contract interaction testing framework (#226)
 *
 * Covers:
 *   - createTestInvoice / createTestOffer factory helpers
 *   - MockServerBuilder configurable failure scenarios
 *   - EventTracker event capture, counting, and reset
 *   - Combining MockServerBuilder with EventTracker
 */

import { describe, it, expect } from 'vitest';
import {
  createMockClient,
  MOCK_WALLET_ADDRESS,
  MOCK_BUSINESS_A,
} from '../src/mock';
import {
  createTestInvoice,
  createTestOffer,
  MockServerBuilder,
  createMockServerBuilder,
  EventTracker,
  createEventTracker,
} from '../src/testing';
import type { Invoice, FinancingOffer } from '../src/types';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const FUTURE_TS = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

// A Pending invoice already in the mock's seed set (originator = MOCK_BUSINESS_A).
const EXISTING_INVOICE_ID = 'inv_mock_p001';
// A seeded offer from MOCK_WALLET_ADDRESS on a Financed invoice.
const EXISTING_OFFER_ID = 'off_mock_001';
const EXISTING_FINANCED_INVOICE_ID = 'inv_mock_f001';

// ── createTestInvoice ────────────────────────────────────────────────────────

describe('createTestInvoice', () => {
  it('returns a valid Invoice with sensible defaults', () => {
    const invoice = createTestInvoice();

    expect(typeof invoice.id).toBe('string');
    expect(invoice.id.length).toBeGreaterThan(0);
    expect(typeof invoice.originator).toBe('string');
    expect(invoice.originator.length).toBeGreaterThan(0);
    expect(typeof invoice.amount).toBe('bigint');
    expect(invoice.amount > 0n).toBe(true);
    expect(['XLM', 'USDC']).toContain(invoice.currency);
    expect(typeof invoice.due_date).toBe('number');
    expect(invoice.due_date > Math.floor(Date.now() / 1000)).toBe(true);
    expect(invoice.status).toBe('Pending');
  });

  it('satisfies the Invoice TypeScript interface', () => {
    const invoice: Invoice = createTestInvoice();
    expect(invoice).toBeDefined();
  });

  it('applies partial overrides while keeping other defaults', () => {
    const invoice = createTestInvoice({ id: 'inv_custom', status: 'Financed', currency: 'USDC' });

    expect(invoice.id).toBe('inv_custom');
    expect(invoice.status).toBe('Financed');
    expect(invoice.currency).toBe('USDC');
    // defaults preserved
    expect(typeof invoice.amount).toBe('bigint');
    expect(invoice.amount > 0n).toBe(true);
    expect(typeof invoice.originator).toBe('string');
  });

  it('allows overriding every field', () => {
    const now = Math.floor(Date.now() / 1000);
    const custom: Invoice = createTestInvoice({
      id: 'inv_full_override',
      originator: MOCK_BUSINESS_A,
      amount: 999n,
      currency: 'USDC',
      due_date: now + 7 * 86_400,
      status: 'Repaid',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    expect(custom.id).toBe('inv_full_override');
    expect(custom.originator).toBe(MOCK_BUSINESS_A);
    expect(custom.amount).toBe(999n);
    expect(custom.currency).toBe('USDC');
    expect(custom.status).toBe('Repaid');
    expect(custom.created_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ── createTestOffer ──────────────────────────────────────────────────────────

describe('createTestOffer', () => {
  it('returns a valid FinancingOffer with sensible defaults', () => {
    const offer = createTestOffer();

    expect(typeof offer.id).toBe('string');
    expect(offer.id.length).toBeGreaterThan(0);
    expect(typeof offer.invoice_id).toBe('string');
    expect(typeof offer.lender).toBe('string');
    expect(typeof offer.amount).toBe('bigint');
    expect(offer.amount > 0n).toBe(true);
    expect(['XLM', 'USDC']).toContain(offer.currency);
    expect(typeof offer.interest_rate).toBe('number');
    expect(offer.interest_rate).toBeGreaterThan(0);
    expect(typeof offer.duration).toBe('number');
    expect(offer.duration).toBeGreaterThan(0);
    expect(typeof offer.amount_repaid).toBe('bigint');
    expect(offer.amount_repaid).toBe(0n);
    expect(offer.status).toBe('Pending');
    expect(offer.funded_at).toBe(0);
  });

  it('satisfies the FinancingOffer TypeScript interface', () => {
    const offer: FinancingOffer = createTestOffer();
    expect(offer).toBeDefined();
  });

  it('applies partial overrides while keeping other defaults', () => {
    const offer = createTestOffer({ id: 'off_custom', interest_rate: 750, status: 'Financed' });

    expect(offer.id).toBe('off_custom');
    expect(offer.interest_rate).toBe(750);
    expect(offer.status).toBe('Financed');
    // defaults preserved
    expect(typeof offer.amount).toBe('bigint');
    expect(offer.amount > 0n).toBe(true);
  });

  it('allows overriding every field', () => {
    const custom: FinancingOffer = createTestOffer({
      id: 'off_full_override',
      invoice_id: 'inv_full_override',
      lender: MOCK_WALLET_ADDRESS,
      amount: 500_000_000n,
      currency: 'USDC',
      interest_rate: 1000,
      duration: 60 * 86_400,
      amount_repaid: 250_000_000n,
      status: 'Repaid',
      funded_at: 1_700_000_000,
    });

    expect(custom.id).toBe('off_full_override');
    expect(custom.invoice_id).toBe('inv_full_override');
    expect(custom.lender).toBe(MOCK_WALLET_ADDRESS);
    expect(custom.amount).toBe(500_000_000n);
    expect(custom.currency).toBe('USDC');
    expect(custom.interest_rate).toBe(1000);
    expect(custom.duration).toBe(60 * 86_400);
    expect(custom.amount_repaid).toBe(250_000_000n);
    expect(custom.status).toBe('Repaid');
    expect(custom.funded_at).toBe(1_700_000_000);
  });
});

// ── MockServerBuilder — failure scenarios ────────────────────────────────────

describe('MockServerBuilder — no failures (baseline)', () => {
  it('build() with no failure config returns a working mock client', async () => {
    const client = createMockServerBuilder().build();

    const invoice = await client.getInvoice(EXISTING_INVOICE_ID);
    expect(invoice.id).toBe(EXISTING_INVOICE_ID);
  });
});

describe('MockServerBuilder — withInsufficientBalance()', () => {
  it('getTokenBalance rejects with Insufficient balance', async () => {
    const client = createMockServerBuilder().withInsufficientBalance().build();
    await expect(
      client.getTokenBalance('CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7', MOCK_WALLET_ADDRESS),
    ).rejects.toThrow('Insufficient balance');
  });

  it('getTokenDecimals rejects with Insufficient balance', async () => {
    const client = createMockServerBuilder().withInsufficientBalance().build();
    await expect(
      client.getTokenDecimals('CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7'),
    ).rejects.toThrow('Insufficient balance');
  });

  it('transferPositionToken rejects with Insufficient balance', async () => {
    const client = createMockServerBuilder().withInsufficientBalance().build();
    await expect(
      client.transferPositionToken(
        'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7',
        MOCK_WALLET_ADDRESS,
        MOCK_BUSINESS_A,
        1_000n,
      ),
    ).rejects.toThrow('Insufficient balance');
  });

  it('repayInvoice rejects with Insufficient balance', async () => {
    const client = createMockServerBuilder().withInsufficientBalance().build();
    await expect(
      client.repayInvoice(EXISTING_FINANCED_INVOICE_ID, EXISTING_OFFER_ID, MOCK_BUSINESS_A, 1_000n),
    ).rejects.toThrow('Insufficient balance');
  });

  it('read-only methods still work under insufficientBalance', async () => {
    const client = createMockServerBuilder().withInsufficientBalance().build();
    // getInvoice / getOffer are not affected
    const invoice = await client.getInvoice(EXISTING_INVOICE_ID);
    expect(invoice.id).toBe(EXISTING_INVOICE_ID);
  });
});

describe('MockServerBuilder — withAuthError()', () => {
  it('registerInvoice rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(
      client.registerInvoice(
        { id: 'inv_auth_test', amount: 10_000_000n, currency: 'XLM', dueDate: FUTURE_TS },
        MOCK_BUSINESS_A,
      ),
    ).rejects.toThrow('Auth error: unauthorized');
  });

  it('cancelInvoice rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(client.cancelInvoice(EXISTING_INVOICE_ID, MOCK_BUSINESS_A)).rejects.toThrow(
      'Auth error: unauthorized',
    );
  });

  it('createOffer rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(
      client.createOffer(
        {
          offerId: 'off_auth_test',
          invoiceId: EXISTING_INVOICE_ID,
          amount: 10_000_000n,
          currency: 'XLM',
          interestRate: 500,
          duration: 86_400,
        },
        MOCK_WALLET_ADDRESS,
      ),
    ).rejects.toThrow('Auth error: unauthorized');
  });

  it('acceptOffer rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(client.acceptOffer('off_mock_003', MOCK_BUSINESS_A)).rejects.toThrow(
      'Auth error: unauthorized',
    );
  });

  it('rejectOffer rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(client.rejectOffer('off_mock_003', MOCK_BUSINESS_A)).rejects.toThrow(
      'Auth error: unauthorized',
    );
  });

  it('repayInvoice rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(
      client.repayInvoice(EXISTING_FINANCED_INVOICE_ID, EXISTING_OFFER_ID, MOCK_BUSINESS_A, 1_000n),
    ).rejects.toThrow('Auth error: unauthorized');
  });

  it('markOverdue rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(client.markOverdue('inv_mock_o001', MOCK_WALLET_ADDRESS)).rejects.toThrow(
      'Auth error: unauthorized',
    );
  });

  it('transferPositionToken rejects with Auth error: unauthorized', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    await expect(
      client.transferPositionToken(
        'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7',
        MOCK_WALLET_ADDRESS,
        MOCK_BUSINESS_A,
        1_000n,
      ),
    ).rejects.toThrow('Auth error: unauthorized');
  });

  it('read-only methods still work under authError', async () => {
    const client = createMockServerBuilder().withAuthError().build();
    const offer = await client.getOffer(EXISTING_OFFER_ID);
    expect(offer.id).toBe(EXISTING_OFFER_ID);
  });
});

describe('MockServerBuilder — withNetworkError()', () => {
  it('getInvoice rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(client.getInvoice(EXISTING_INVOICE_ID)).rejects.toThrow('Network error');
  });

  it('getOffer rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(client.getOffer(EXISTING_OFFER_ID)).rejects.toThrow('Network error');
  });

  it('registerInvoice rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(
      client.registerInvoice(
        { id: 'inv_net_test', amount: 10_000_000n, currency: 'XLM', dueDate: FUTURE_TS },
        MOCK_BUSINESS_A,
      ),
    ).rejects.toThrow('Network error');
  });

  it('createOffer rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(
      client.createOffer(
        {
          offerId: 'off_net_test',
          invoiceId: EXISTING_INVOICE_ID,
          amount: 10_000_000n,
          currency: 'XLM',
          interestRate: 500,
          duration: 86_400,
        },
        MOCK_WALLET_ADDRESS,
      ),
    ).rejects.toThrow('Network error');
  });

  it('acceptOffer rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(client.acceptOffer('off_mock_003', MOCK_BUSINESS_A)).rejects.toThrow('Network error');
  });

  it('repayInvoice rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(
      client.repayInvoice(EXISTING_FINANCED_INVOICE_ID, EXISTING_OFFER_ID, MOCK_BUSINESS_A, 1_000n),
    ).rejects.toThrow('Network error');
  });

  it('getTokenBalance rejects with Network error', async () => {
    const client = createMockServerBuilder().withNetworkError().build();
    await expect(
      client.getTokenBalance('CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7', MOCK_WALLET_ADDRESS),
    ).rejects.toThrow('Network error');
  });
});

describe('MockServerBuilder — withRejectedOffer()', () => {
  it('acceptOffer rejects with Offer rejected', async () => {
    const client = createMockServerBuilder().withRejectedOffer().build();
    await expect(client.acceptOffer('off_mock_003', MOCK_BUSINESS_A)).rejects.toThrow('Offer rejected');
  });

  it('other methods still work under rejectedOffer', async () => {
    const client = createMockServerBuilder().withRejectedOffer().build();
    const invoice = await client.getInvoice(EXISTING_INVOICE_ID);
    expect(invoice.id).toBe(EXISTING_INVOICE_ID);
  });

  it('createOffer still works when only rejectedOffer is set', async () => {
    const client = createMockServerBuilder().withRejectedOffer().build();
    const offer = await client.createOffer(
      {
        offerId: 'off_rej_test_001',
        invoiceId: EXISTING_INVOICE_ID,
        amount: 10_000_000n,
        currency: 'XLM',
        interestRate: 500,
        duration: 86_400,
      },
      MOCK_WALLET_ADDRESS,
    );
    expect(offer.status).toBe('Pending');
    // But accepting it fails
    await expect(client.acceptOffer('off_rej_test_001', MOCK_BUSINESS_A)).rejects.toThrow('Offer rejected');
  });
});

describe('MockServerBuilder — withOverdueInvoice()', () => {
  it('built-in fixture inv_mock_o001 is already Overdue without configuration', async () => {
    const client = createMockClient();
    const invoice = await client.getInvoice('inv_mock_o001');
    expect(invoice.status).toBe('Overdue');
  });

  it('withOverdueInvoice with an existing fixture ID keeps the invoice Overdue', async () => {
    const client = createMockServerBuilder().withOverdueInvoice('inv_mock_o001').build();
    // Allow the async seeding to complete
    await new Promise(r => setTimeout(r, 50));
    const invoice = await client.getInvoice('inv_mock_o001');
    expect(invoice.status).toBe('Overdue');
  });
});

describe('MockServerBuilder — fluent chaining', () => {
  it('returns the same builder instance for chaining', () => {
    const builder = createMockServerBuilder();
    expect(builder.withInsufficientBalance()).toBe(builder);
    expect(builder.withAuthError()).toBe(builder);
    expect(builder.withNetworkError()).toBe(builder);
    expect(builder.withRejectedOffer()).toBe(builder);
    expect(builder.withOverdueInvoice('inv_mock_o001')).toBe(builder);
  });

  it('networkError takes precedence over authError (all calls fail with Network error)', async () => {
    const client = createMockServerBuilder().withAuthError().withNetworkError().build();
    await expect(client.getInvoice(EXISTING_INVOICE_ID)).rejects.toThrow('Network error');
    await expect(client.registerInvoice(
      { id: 'x', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    )).rejects.toThrow('Network error');
  });
});

// ── EventTracker ─────────────────────────────────────────────────────────────

describe('EventTracker — construction', () => {
  it('createEventTracker wraps a client and exposes .client', () => {
    const base = createMockClient();
    const tracker = createEventTracker(base);
    expect(tracker.client).toBeDefined();
    expect(typeof tracker.client.registerInvoice).toBe('function');
  });

  it('EventTracker.wrap() is equivalent to new EventTracker()', () => {
    const base = createMockClient();
    const tracker = EventTracker.wrap(base);
    expect(tracker).toBeInstanceOf(EventTracker);
  });

  it('starts with an empty event list', () => {
    const tracker = createEventTracker(createMockClient());
    expect(tracker.getEvents()).toHaveLength(0);
  });
});

describe('EventTracker — registerInvoice emits inv_reg', () => {
  it('records an inv_reg event with correct payload', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.registerInvoice(
      { id: 'inv_track_001', amount: 5_000_000n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );

    expect(tracker.getEventCount('inv_reg')).toBe(1);
    const events = tracker.getEvents();
    expect(events[0].type).toBe('inv_reg');
    expect(events[0].payload.originator).toBe(MOCK_BUSINESS_A);
    expect(events[0].payload.amount).toBe(5_000_000n);
  });

  it('accumulates multiple inv_reg events', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.registerInvoice(
      { id: 'inv_track_a', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );
    await tracker.client.registerInvoice(
      { id: 'inv_track_b', amount: 2n, currency: 'USDC', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );

    expect(tracker.getEventCount('inv_reg')).toBe(2);
    expect(tracker.getEvents()).toHaveLength(2);
  });
});

describe('EventTracker — createOffer emits off_new', () => {
  it('records an off_new event', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.createOffer(
      {
        offerId: 'off_track_001',
        invoiceId: EXISTING_INVOICE_ID,
        amount: 10_000_000n,
        currency: 'XLM',
        interestRate: 500,
        duration: 86_400,
      },
      MOCK_WALLET_ADDRESS,
    );

    expect(tracker.getEventCount('off_new')).toBe(1);
    const event = tracker.getEvents()[0];
    expect(event.type).toBe('off_new');
    expect(event.payload.lender).toBe(MOCK_WALLET_ADDRESS);
    expect(event.payload.invoice_id).toBe(EXISTING_INVOICE_ID);
  });
});

describe('EventTracker — acceptOffer emits off_acc', () => {
  it('records an off_acc event', async () => {
    const tracker = createEventTracker(createMockClient());

    // off_mock_003 is a Pending offer on inv_mock_p001 (originator = MOCK_BUSINESS_A).
    await tracker.client.acceptOffer('off_mock_003', MOCK_BUSINESS_A);

    expect(tracker.getEventCount('off_acc')).toBe(1);
    const event = tracker.getEvents()[0];
    expect(event.type).toBe('off_acc');
    expect(event.payload.lender).toBe(MOCK_WALLET_ADDRESS);
  });
});

describe('EventTracker — repayInvoice emits inv_rep', () => {
  it('records an inv_rep event with correct payload', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.repayInvoice(
      EXISTING_FINANCED_INVOICE_ID,
      EXISTING_OFFER_ID,
      MOCK_BUSINESS_A,
      1_000n,
    );

    expect(tracker.getEventCount('inv_rep')).toBe(1);
    const event = tracker.getEvents()[0];
    expect(event.type).toBe('inv_rep');
    expect(event.payload.offer_id).toBe(EXISTING_OFFER_ID);
    expect(event.payload.amount).toBe(1_000n);
    expect(event.payload.fully_repaid).toBe(false);
  });

  it('records fully_repaid = true when invoice is fully repaid', async () => {
    const base = createMockClient();
    const offer = await base.getOffer(EXISTING_OFFER_ID);
    const totalDue = offer.amount + (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
    const outstanding = totalDue - offer.amount_repaid;

    const tracker = createEventTracker(base);
    await tracker.client.repayInvoice(
      EXISTING_FINANCED_INVOICE_ID,
      EXISTING_OFFER_ID,
      MOCK_BUSINESS_A,
      outstanding,
    );

    const event = tracker.getEvents()[0];
    expect(event.payload.fully_repaid).toBe(true);
  });
});

describe('EventTracker — read-only methods do not emit events', () => {
  it('getInvoice does not add events', async () => {
    const tracker = createEventTracker(createMockClient());
    await tracker.client.getInvoice(EXISTING_INVOICE_ID);
    expect(tracker.getEvents()).toHaveLength(0);
  });

  it('getOffer does not add events', async () => {
    const tracker = createEventTracker(createMockClient());
    await tracker.client.getOffer(EXISTING_OFFER_ID);
    expect(tracker.getEvents()).toHaveLength(0);
  });

  it('getTokenBalance does not add events', async () => {
    const tracker = createEventTracker(createMockClient());
    await tracker.client.getTokenBalance(
      'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7',
      MOCK_WALLET_ADDRESS,
    );
    expect(tracker.getEvents()).toHaveLength(0);
  });
});

describe('EventTracker — reset()', () => {
  it('clears all tracked events', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.registerInvoice(
      { id: 'inv_reset_001', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );
    expect(tracker.getEventCount('inv_reg')).toBe(1);

    tracker.reset();

    expect(tracker.getEvents()).toHaveLength(0);
    expect(tracker.getEventCount('inv_reg')).toBe(0);
  });

  it('resumes tracking after reset', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.registerInvoice(
      { id: 'inv_reset_002', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );
    tracker.reset();

    await tracker.client.registerInvoice(
      { id: 'inv_reset_003', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );

    expect(tracker.getEventCount('inv_reg')).toBe(1);
    const events = tracker.getEvents();
    expect(events[0].payload.originator).toBe(MOCK_BUSINESS_A);
  });
});

describe('EventTracker — getEventCount()', () => {
  it('returns 0 for an event type that has not been emitted', () => {
    const tracker = createEventTracker(createMockClient());
    expect(tracker.getEventCount('off_acc')).toBe(0);
  });

  it('returns the correct count for mixed event types', async () => {
    const tracker = createEventTracker(createMockClient());

    // Register two invoices
    await tracker.client.registerInvoice(
      { id: 'inv_count_a', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );
    await tracker.client.registerInvoice(
      { id: 'inv_count_b', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );
    // Create an offer
    await tracker.client.createOffer(
      {
        offerId: 'off_count_001',
        invoiceId: EXISTING_INVOICE_ID,
        amount: 10_000_000n,
        currency: 'XLM',
        interestRate: 500,
        duration: 86_400,
      },
      MOCK_WALLET_ADDRESS,
    );

    expect(tracker.getEventCount('inv_reg')).toBe(2);
    expect(tracker.getEventCount('off_new')).toBe(1);
    expect(tracker.getEventCount('off_acc')).toBe(0);
    expect(tracker.getEvents()).toHaveLength(3);
  });
});

describe('EventTracker — getEvents() returns a copy', () => {
  it('mutating the returned array does not affect internal state', async () => {
    const tracker = createEventTracker(createMockClient());

    await tracker.client.registerInvoice(
      { id: 'inv_copy_test', amount: 1n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );

    const snapshot = tracker.getEvents();
    snapshot.pop(); // mutate the copy

    // Internal state unchanged
    expect(tracker.getEventCount('inv_reg')).toBe(1);
  });
});

// ── Combining MockServerBuilder with EventTracker ────────────────────────────

describe('MockServerBuilder + EventTracker — combined usage', () => {
  it('EventTracker wrapping a builder client captures events on successful calls', async () => {
    // No failure modes → all calls succeed; events should be tracked.
    const baseClient = createMockServerBuilder().build();
    const tracker = EventTracker.wrap(baseClient);

    await tracker.client.registerInvoice(
      { id: 'inv_combo_001', amount: 10_000_000n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );

    expect(tracker.getEventCount('inv_reg')).toBe(1);
  });

  it('EventTracker wrapping an authError builder records no events (call throws)', async () => {
    const baseClient = createMockServerBuilder().withAuthError().build();
    const tracker = EventTracker.wrap(baseClient);

    await expect(
      tracker.client.registerInvoice(
        { id: 'inv_combo_fail', amount: 10_000_000n, currency: 'XLM', dueDate: FUTURE_TS },
        MOCK_BUSINESS_A,
      ),
    ).rejects.toThrow('Auth error: unauthorized');

    // Failed calls should not produce events.
    expect(tracker.getEventCount('inv_reg')).toBe(0);
    expect(tracker.getEvents()).toHaveLength(0);
  });

  it('EventTracker wrapping a networkError builder records no events', async () => {
    const baseClient = createMockServerBuilder().withNetworkError().build();
    const tracker = EventTracker.wrap(baseClient);

    await expect(tracker.client.getInvoice(EXISTING_INVOICE_ID)).rejects.toThrow('Network error');
    expect(tracker.getEvents()).toHaveLength(0);
  });

  it('EventTracker wrapping a rejectedOffer builder records no off_acc event', async () => {
    const baseClient = createMockServerBuilder().withRejectedOffer().build();
    const tracker = EventTracker.wrap(baseClient);

    await expect(tracker.client.acceptOffer('off_mock_003', MOCK_BUSINESS_A)).rejects.toThrow(
      'Offer rejected',
    );
    expect(tracker.getEventCount('off_acc')).toBe(0);
  });

  it('full lifecycle: register → createOffer → acceptOffer → repay tracked end-to-end', async () => {
    const tracker = createEventTracker(createMockClient());

    // Register a fresh invoice
    await tracker.client.registerInvoice(
      { id: 'inv_e2e_001', amount: 50_000_000n, currency: 'XLM', dueDate: FUTURE_TS },
      MOCK_BUSINESS_A,
    );

    // Create an offer
    await tracker.client.createOffer(
      {
        offerId: 'off_e2e_001',
        invoiceId: 'inv_e2e_001',
        amount: 50_000_000n,
        currency: 'XLM',
        interestRate: 500,
        duration: 30 * 86_400,
      },
      MOCK_WALLET_ADDRESS,
    );

    // Accept the offer (originator = MOCK_BUSINESS_A)
    await tracker.client.acceptOffer('off_e2e_001', MOCK_BUSINESS_A);

    // Partial repayment
    await tracker.client.repayInvoice('inv_e2e_001', 'off_e2e_001', MOCK_BUSINESS_A, 1_000_000n);

    // Assert total events
    expect(tracker.getEvents()).toHaveLength(4);
    expect(tracker.getEventCount('inv_reg')).toBe(1);
    expect(tracker.getEventCount('off_new')).toBe(1);
    expect(tracker.getEventCount('off_acc')).toBe(1);
    expect(tracker.getEventCount('inv_rep')).toBe(1);

    // Spot-check payloads
    const events = tracker.getEvents();
    expect(events[0].type).toBe('inv_reg');
    expect(events[1].type).toBe('off_new');
    expect(events[2].type).toBe('off_acc');
    expect(events[3].type).toBe('inv_rep');
    expect(events[3].payload.fully_repaid).toBe(false);
  });
});
