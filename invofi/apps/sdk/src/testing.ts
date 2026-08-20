// ── Testing framework — mock Soroban environment (#226) ─────────────────────
//
// Provides helpers for writing contract-interaction tests against the InvoFi
// SDK without any live network. Three layers of tooling:
//
//   1. `createTestInvoice` / `createTestOffer` — typed factory helpers that
//      produce fully-populated Invoice / FinancingOffer objects with sensible
//      defaults, accepting partial overrides.
//
//   2. `MockServerBuilder` — fluent builder for configuring failure scenarios
//      on an in-memory mock client (insufficient balance, auth errors, network
//      errors, etc.) before calling `.build()`.
//
//   3. `EventTracker` — wraps any `InvofiClient` and intercepts every
//      state-changing call to record which protocol events would have been
//      emitted.  `.getEvents()`, `.getEventCount(type)`, and `.reset()` let
//      tests assert on event history without touching real Soroban RPC.

import type { InvofiClient } from './client';
import { createMockClient } from './mock';
import type { Currency, FinancingOffer, Invoice, InvoiceStatus, OfferStatus } from './types';

// ── Well-known test addresses ────────────────────────────────────────────────
// Use valid Stellar G-addresses that pass SDK validation but correspond to no
// real accounts on any network.

const TEST_ORIGINATOR = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
const TEST_LENDER = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

// ── 1. Test factory helpers ──────────────────────────────────────────────────

/**
 * Create an `Invoice` object with sensible defaults.
 *
 * All fields can be overridden via `overrides`.  The returned object satisfies
 * the `Invoice` interface exactly — useful for seeding mocks or asserting
 * shapes in unit tests.
 *
 * @example
 * ```ts
 * const inv = createTestInvoice({ id: 'inv_test_001', status: 'Financed' });
 * ```
 */
export function createTestInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const now = Math.floor(Date.now() / 1000);
  const defaults: Invoice = {
    id: 'inv_test_default',
    originator: TEST_ORIGINATOR,
    amount: 10_000_000n, // 1 unit (1 XLM / 1 USDC in stroops)
    currency: 'XLM' as Currency,
    due_date: now + 30 * 86_400, // 30 days from now
    status: 'Pending' as InvoiceStatus,
    created_at: new Date().toISOString(),
  };
  return { ...defaults, ...overrides };
}

/**
 * Create a `FinancingOffer` object with sensible defaults.
 *
 * All fields can be overridden via `overrides`.  The returned object satisfies
 * the `FinancingOffer` interface exactly.
 *
 * @example
 * ```ts
 * const offer = createTestOffer({ id: 'off_test_001', interest_rate: 750 });
 * ```
 */
export function createTestOffer(overrides: Partial<FinancingOffer> = {}): FinancingOffer {
  const defaults: FinancingOffer = {
    id: 'off_test_default',
    invoice_id: 'inv_test_default',
    lender: TEST_LENDER,
    amount: 10_000_000n, // 1 unit in stroops
    currency: 'XLM' as Currency,
    interest_rate: 500, // 5.00%
    duration: 30 * 86_400, // 30 days in seconds
    amount_repaid: 0n,
    status: 'Pending' as OfferStatus,
    funded_at: 0,
  };
  return { ...defaults, ...overrides };
}

// ── 2. MockServerBuilder ─────────────────────────────────────────────────────

/** Failure mode flags configured on the builder before `.build()`. */
interface MockServerFailureConfig {
  insufficientBalance: boolean;
  authError: boolean;
  networkError: boolean;
  rejectedOffer: boolean;
}

/**
 * Fluent builder for a pre-configured in-memory mock client.
 *
 * Each `.withXxx()` method activates a specific failure scenario; `.build()`
 * returns the fully configured `InvofiClient`.
 *
 * @example
 * ```ts
 * const client = createMockServerBuilder()
 *   .withAuthError()
 *   .build();
 *
 * await expect(client.registerInvoice(...)).rejects.toThrow('Auth error: unauthorized');
 * ```
 */
export class MockServerBuilder {
  private readonly failures: MockServerFailureConfig = {
    insufficientBalance: false,
    authError: false,
    networkError: false,
    rejectedOffer: false,
  };

  private readonly overdueInvoiceIds: string[] = [];

  /**
   * Makes token-related calls (transferPositionToken, getTokenBalance,
   * getTokenDecimals, addPositionTrustline) fail with `'Insufficient balance'`.
   */
  withInsufficientBalance(): this {
    this.failures.insufficientBalance = true;
    return this;
  }

  /**
   * Makes all state-changing calls (register, createOffer, acceptOffer,
   * rejectOffer, repayInvoice, markOverdue, reclaimInvoice, cancelInvoice,
   * transferPositionToken, addPositionTrustline) fail with
   * `'Auth error: unauthorized'`.
   */
  withAuthError(): this {
    this.failures.authError = true;
    return this;
  }

  /**
   * Makes every async SDK method fail with `'Network error'`, simulating a
   * completely unavailable RPC / Horizon connection.
   */
  withNetworkError(): this {
    this.failures.networkError = true;
    return this;
  }

  /**
   * Makes `acceptOffer` always reject with `'Offer rejected'` regardless of
   * inputs.
   */
  withRejectedOffer(): this {
    this.failures.rejectedOffer = true;
    return this;
  }

  /**
   * Seeds an invoice with the given `invoiceId` in the `'Overdue'` status so
   * callers can exercise overdue-handling code paths.
   *
   * If the ID already exists in the fixture set (e.g. `'inv_mock_o001'`) the
   * builder records it for post-construction status override; if it does not
   * exist the builder registers a fresh one.
   */
  withOverdueInvoice(invoiceId: string): this {
    this.overdueInvoiceIds.push(invoiceId);
    return this;
  }

  /**
   * Build and return the configured `InvofiClient`.
   *
   * The returned client is a standard `InvofiClient` where all requested
   * failure scenarios have been wired in.  Pass it to `EventTracker.wrap()`
   * to also capture event history.
   */
  build(): InvofiClient {
    // Start from a clean in-memory mock so all fixtures and validators work.
    const base = createMockClient();
    const { insufficientBalance, authError, networkError, rejectedOffer } = this.failures;

    // ── Seed overdue invoices ───────────────────────────────────────────────
    // We use markOverdue on the base client directly (bypasses all failure
    // shims that we haven't installed yet) to put the requested invoices into
    // Overdue state.  For IDs that don't exist in the seed we register them
    // first with a past due_date.
    const seedOverdue = async (): Promise<void> => {
      for (const id of this.overdueInvoiceIds) {
        try {
          // Try getting it first — it might already be in the fixture set.
          await base.getInvoice(id);
        } catch {
          // Not found → register a fresh one.  Due date slightly in the past
          // so the keeper is allowed to mark it overdue.
          const pastDue = Math.floor(Date.now() / 1000) - 86_400;
          await base.registerInvoice(
            { id, amount: 10_000_000n, currency: 'XLM', dueDate: pastDue + 1 },
            TEST_ORIGINATOR,
          ).catch(() => undefined); // ignore if already registered
        }
        await base.markOverdue(id, TEST_ORIGINATOR).catch(() => undefined);
      }
    };

    // We can't await here (synchronous build), so we kick the overdue seeding
    // off immediately and the returned proxy delegates all reads through the
    // base client which will have the state by the time the test awaits any
    // method.  In practice, tests that call withOverdueInvoice() and then
    // immediately .build() should either use a short await or the built-in
    // fixture IDs ('inv_mock_o001') which are already Overdue.
    void seedOverdue();

    // ── Build the wrapped client ────────────────────────────────────────────

    if (!insufficientBalance && !authError && !networkError && !rejectedOffer) {
      // No failure modes → return the base client directly.
      return base;
    }

    // Wrap the base client with a proxy that injects the requested failures.
    const wrapped: InvofiClient = {
      // Cache pass-through (no failure shim — cache is purely local).
      cache: base.cache,

      // ── Read methods ──────────────────────────────────────────────────────
      getInvoice: networkError
        ? () => Promise.reject(new Error('Network error'))
        : (id, src) => base.getInvoice(id, src),

      getOffer: networkError
        ? () => Promise.reject(new Error('Network error'))
        : (id, src) => base.getOffer(id, src),

      getPositionTokenId: networkError
        ? () => Promise.reject(new Error('Network error'))
        : (src) => base.getPositionTokenId(src),

      getTokenBalance: networkError
        ? () => Promise.reject(new Error('Network error'))
        : insufficientBalance
        ? () => Promise.reject(new Error('Insufficient balance'))
        : (tokenId, address) => base.getTokenBalance(tokenId, address),

      getTokenDecimals: networkError
        ? () => Promise.reject(new Error('Network error'))
        : insufficientBalance
        ? () => Promise.reject(new Error('Insufficient balance'))
        : (tokenId) => base.getTokenDecimals(tokenId),

      hasPositionTrustline: networkError
        ? () => Promise.reject(new Error('Network error'))
        : (address) => base.hasPositionTrustline(address),

      // ── State-changing methods ─────────────────────────────────────────────
      registerInvoice: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : (params, originator) => base.registerInvoice(params, originator),

      cancelInvoice: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : (invoiceId, originator) => base.cancelInvoice(invoiceId, originator),

      createOffer: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : (params, lender) => base.createOffer(params, lender),

      acceptOffer: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : rejectedOffer
        ? () => Promise.reject(new Error('Offer rejected'))
        : (offerId, originator) => base.acceptOffer(offerId, originator),

      rejectOffer: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : (offerId, originator) => base.rejectOffer(offerId, originator),

      repayInvoice: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : insufficientBalance
        ? () => Promise.reject(new Error('Insufficient balance'))
        : (invoiceId, offerId, repayer, amount) => base.repayInvoice(invoiceId, offerId, repayer, amount),

      markOverdue: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : (invoiceId, caller) => base.markOverdue(invoiceId, caller),

      reclaimInvoice: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : (invoiceId, offerId, lender) => base.reclaimInvoice(invoiceId, offerId, lender),

      transferPositionToken: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : insufficientBalance
        ? () => Promise.reject(new Error('Insufficient balance'))
        : (tokenId, from, to, amount) => base.transferPositionToken(tokenId, from, to, amount),

      addPositionTrustline: networkError
        ? () => Promise.reject(new Error('Network error'))
        : authError
        ? () => Promise.reject(new Error('Auth error: unauthorized'))
        : insufficientBalance
        ? () => Promise.reject(new Error('Insufficient balance'))
        : (address) => base.addPositionTrustline(address),
    };

    return wrapped;
  }
}

/**
 * Convenience factory — creates a new `MockServerBuilder`.
 *
 * @example
 * ```ts
 * const client = createMockServerBuilder().withNetworkError().build();
 * ```
 */
export function createMockServerBuilder(): MockServerBuilder {
  return new MockServerBuilder();
}

// ── 3. EventTracker ──────────────────────────────────────────────────────────

/** The protocol event names that the tracker captures. */
export type TrackedEventType =
  | 'inv_reg'   // registerInvoice
  | 'inv_cxl'   // cancelInvoice
  | 'off_new'   // createOffer
  | 'off_acc'   // acceptOffer
  | 'off_rej'   // rejectOffer
  | 'inv_rep'   // repayInvoice
  | 'inv_ovd'   // markOverdue
  | 'off_def';  // reclaimInvoice (offer defaulted)

/** A single tracked event record. */
export interface TrackedEvent {
  type: TrackedEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

/**
 * Intercepts all state-changing `InvofiClient` calls and records the
 * protocol event that would have been emitted by the corresponding contract
 * function.
 *
 * The tracker holds a reference to a wrapped client; all method calls are
 * forwarded to the underlying implementation, and on success the tracker
 * appends the corresponding event record.
 *
 * @example
 * ```ts
 * const tracker = createEventTracker(createMockClient());
 * await tracker.client.registerInvoice(params, address);
 * expect(tracker.getEventCount('inv_reg')).toBe(1);
 * ```
 */
export class EventTracker {
  private events: TrackedEvent[] = [];

  /**
   * The wrapped `InvofiClient`.  Use this to make SDK calls — events are
   * captured automatically on every successful call.
   */
  readonly client: InvofiClient;

  constructor(baseClient: InvofiClient) {
    this.client = this._wrap(baseClient);
  }

  /** Static factory — wraps any existing `InvofiClient` in an `EventTracker`. */
  static wrap(client: InvofiClient): EventTracker {
    return new EventTracker(client);
  }

  /** Returns a shallow copy of the tracked event array. */
  getEvents(): TrackedEvent[] {
    return [...this.events];
  }

  /** Returns the number of events of the given `type` that have been captured. */
  getEventCount(type: TrackedEventType): number {
    return this.events.filter(e => e.type === type).length;
  }

  /** Clears all tracked events. */
  reset(): void {
    this.events = [];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private record(type: TrackedEventType, payload: Record<string, unknown>): void {
    this.events.push({ type, payload });
  }

  private _wrap(base: InvofiClient): InvofiClient {
    // We capture `this` (the tracker) in closures below.
    const tracker = this;

    const wrapped: InvofiClient = {
      cache: base.cache,

      // ── Read-only pass-throughs (no events) ──────────────────────────────
      getInvoice:          (id, src)          => base.getInvoice(id, src),
      getOffer:            (id, src)          => base.getOffer(id, src),
      getPositionTokenId:  (src)              => base.getPositionTokenId(src),
      getTokenBalance:     (tokenId, address) => base.getTokenBalance(tokenId, address),
      getTokenDecimals:    (tokenId)          => base.getTokenDecimals(tokenId),
      hasPositionTrustline:(address)          => base.hasPositionTrustline(address),

      // ── State-changing wrappers (emit events on success) ─────────────────

      async registerInvoice(params, originatorAddress) {
        const invoice = await base.registerInvoice(params, originatorAddress);
        tracker.record('inv_reg', {
          originator: originatorAddress,
          amount: invoice.amount,
          due_date: invoice.due_date,
        });
        return invoice;
      },

      async cancelInvoice(invoiceId, originatorAddress) {
        const invoice = await base.cancelInvoice(invoiceId, originatorAddress);
        tracker.record('inv_cxl', { originator: originatorAddress });
        return invoice;
      },

      async createOffer(params, lenderAddress) {
        const offer = await base.createOffer(params, lenderAddress);
        tracker.record('off_new', {
          invoice_id: params.invoiceId,
          lender: lenderAddress,
          amount: offer.amount,
          interest_rate: offer.interest_rate,
        });
        return offer;
      },

      async acceptOffer(offerId, originatorAddress) {
        const offer = await base.acceptOffer(offerId, originatorAddress);
        tracker.record('off_acc', {
          invoice_id: offer.invoice_id,
          lender: offer.lender,
          amount: offer.amount,
        });
        return offer;
      },

      async rejectOffer(offerId, originatorAddress) {
        const offer = await base.rejectOffer(offerId, originatorAddress);
        tracker.record('off_rej', { invoice_id: offer.invoice_id });
        return offer;
      },

      async repayInvoice(invoiceId, offerId, repayerAddress, amount) {
        const invoice = await base.repayInvoice(invoiceId, offerId, repayerAddress, amount);
        tracker.record('inv_rep', {
          offer_id: offerId,
          amount,
          fully_repaid: invoice.status === 'Repaid',
        });
        return invoice;
      },

      async markOverdue(invoiceId, callerAddress) {
        const invoice = await base.markOverdue(invoiceId, callerAddress);
        tracker.record('inv_ovd', { due_date: invoice.due_date });
        return invoice;
      },

      async reclaimInvoice(invoiceId, offerId, lenderAddress) {
        const offer = await base.reclaimInvoice(invoiceId, offerId, lenderAddress);
        tracker.record('off_def', { invoice_id: invoiceId, lender: lenderAddress });
        return offer;
      },

      // No protocol event for these (position-token internals).
      async transferPositionToken(tokenId, fromAddress, toAddress, amount) {
        return base.transferPositionToken(tokenId, fromAddress, toAddress, amount);
      },

      async addPositionTrustline(address) {
        return base.addPositionTrustline(address);
      },
    };

    return wrapped;
  }
}

/**
 * Convenience factory — wraps a mock client in an `EventTracker`.
 *
 * @example
 * ```ts
 * const tracker = createEventTracker(createMockClient());
 * ```
 */
export function createEventTracker(client: InvofiClient): EventTracker {
  return new EventTracker(client);
}
