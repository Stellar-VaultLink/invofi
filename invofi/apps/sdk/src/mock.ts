// ── MockClient — in-memory client for offline UI development (#177) ─────────
//
// `createMockClient` returns an object with the exact same method surface as
// `createInvofiClient` (`InvofiClient`) but backed by in-memory state instead
// of Soroban RPC/Horizon. It is intended for frontend development only — there
// is deliberately no crypto/signing simulation, no account funding, and no
// network access. Fixtures are deterministic: the same invoice/offer IDs,
// amounts and statuses on every instantiation.
//
// Validation is shared with the real client (imported from `./validation`), so
// a caller cannot tell the two apart from their error behaviour — only that
// the mock never performs any IO.
//
// ## Contract-interaction testing framework (#226)
//
// The mock doubles as a test-time replacement for the real Soroban backend:
//   - **Event tracking** — every successful state-changing call records the
//     protocol event it would have emitted on-chain (`client.events`), using
//     the same `ProtocolEvent` shapes that `listenToEvents` consumes, so
//     tests can assert on events without a testnet.
//   - **Typed failures** — domain failures (not found / unauthorized /
//     insufficient balance / already exists) throw `ContractError`s matching
//     the real client's error contract, and failure rules can be configured
//     up front (`failures` option) or queued per call (`failNext`) to
//     simulate arbitrary RPC/contract failures deterministically.
//   - **State control** — `reset()` restores the seeded state between test
//     cases, `setBalance`/`getBalance` set up balance scenarios explicitly,
//     and `seededInvoices()`/`seededOffers()` expose the fixture builders.
//   - **Fixture helpers** — `createTestInvoice` / `createTestOffer` live in
//     `./testing.ts` (re-exported from the package root) for composing
//     custom pre-seeded data.

import type { InvofiClient, InvofiClientMethods } from './client';
import type { Currency, FinancingOffer, Invoice } from './types';
import type { CacheEntry, CacheHandle, CacheScope, StaleWhileRevalidateResult } from './cache';
import { ContractError, ContractErrorType } from './errors';
import type { ProtocolEvent } from './events';
import { xdr } from '@stellar/stellar-sdk';
import { createContractsNamespace } from './contracts';
import {
  validateStellarAddress,
  validatePositiveI128,
  validateInterestRate,
  validateDuration,
  validateFutureTimestamp,
  validateSymbolId,
  validateCurrency,
} from './validation';

// ── Deterministic identities ────────────────────────────────────────────────
// Mock-only public keys. They pass the SDK's Stellar address format validation
// (`G…` 56 base-32 chars) but correspond to no real accounts.

/** The connected "demo wallet" — used as the default signer/owner. */
export const MOCK_WALLET_ADDRESS = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';

/** A couple of other businesses/lenders so marketplace data isn't self-referential. */
export const MOCK_BUSINESS_A = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
export const MOCK_BUSINESS_B = 'GBDDLOWR6YUEEYUKFKS6ISTCLBQKDPUXAOVJMNJYAACT6UYQGEKYEVZR';
export const MOCK_BUSINESS_C = `G${'C'.repeat(55)}`;
export const MOCK_LENDER_B = `G${'L'.repeat(55)}`;

/** Position-token contract id the mock reports (a valid `C…` contract address). */
export const MOCK_POSITION_TOKEN_ID = 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7';

/**
 * Contract ids the mock reports in the `contractId` field of emitted protocol
 * events. Mock-only labels (valid `C…` addresses that back no deployed
 * contract) so a recorded event carries exactly the same shape as one
 * delivered by `listenToEvents`.
 */
export const MOCK_REGISTRY_ID = 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35BMOCKLZLLI4VXMCF7';
export const MOCK_FINANCING_ID = 'CBGRA3457ZFXYZNEQLO4YGUQ3OBEWOE6US6ZREHKMOCKDLZYBO73IFVW';
export const MOCK_REPAYMENT_ID = 'CCDATW5GMVDOPK55Q4MLXV5SGA3VLXPD67ABLBNMMOCK6BLL2IZBUVEP';

/** 1 XLM / USDC base unit in stroops — mirrors the protocol's 7-decimal convention. */
const BASE = 10_000_000n;
const xlm = (n: number | bigint): bigint => BigInt(n) * BASE;

// Timestamps are computed relative to a single process-start anchor so the
// fixture *set* is stable within a session while Overdue/Defaulted invoices
// stay genuinely past-due and Pending ones stay in the future.
const NOW = Math.floor(Date.now() / 1000);
const days = (n: number): number => NOW + n * 86_400;

/** Seed balances (stroops) for the demo wallet so position-token reads are non-zero. */
export const MOCK_POSITION_BALANCE = xlm(55_000);

export interface MockClientOptions {
  /**
   * Accepted for parity with the real client's config; the mock ignores it
   * (trustlines are simulated, not resolved against Horizon).
   */
  positionTokenAsset?: string;
  /** Optional override for the position-token contract id returned by `getPositionTokenId`. */
  positionTokenId?: string;
  /** Optional override for the token decimals returned by `getTokenDecimals`. */
  tokenDecimals?: number;
  /** Optional override for the demo wallet's starting token balance (stroops). */
  positionBalance?: bigint;
  /**
   * Failure rules installed at construction time (testing framework, #226).
   * Each matching call throws the configured error instead of executing.
   * Use `client.failNext(...)` for one-shot injection, or `addFailure` for a
   * sticky rule added after construction.
   */
  failures?: MockFailureRule[];
}

/** Any callable method on the client — valid failure-rule target. */
export type MockMethodName = Exclude<keyof InvofiClient, 'cache' | 'contracts'>;

/**
 * A deterministic, injectable failure rule (testing framework, #226).
 *
 * When a client method matches `on`, it throws `error` — or a default
 * `ContractError(UNKNOWN)` built from `message` — instead of executing. A rule
 * with a finite `times` is removed once it has fired that many times.
 *
 * @example
 * ```ts
 * const client = createMockClient({
 *   failures: [{ on: 'acceptOffer', error: new ContractError(5, ContractErrorType.INSUFFICIENT_BALANCE, 'Lender has no funds') }],
 * });
 * ```
 */
export interface MockFailureRule {
  /** Method to fail; `'*'` (the default) matches every method. */
  on?: MockMethodName | '*';
  /** Error to throw. Defaults to a `ContractError(UNKNOWN)` built from `message`. */
  error?: Error;
  /** Message used to build the default error when `error` is omitted. */
  message?: string;
  /** Times to fire before the rule is removed. Defaults to Infinity. */
  times?: number;
}

/**
 * Test-oriented surface returned alongside the `InvofiClient` methods by
 * `createMockClient` (testing framework, #226).
 */
export interface MockTestingSurface {
  /**
   * Protocol events emitted by successful state-changing calls so far, in
   * arrival order, with deterministic fake ledger/txHash fields. Same
   * `ProtocolEvent` shapes `listenToEvents` delivers on-chain.
   */
  readonly events: ReadonlyArray<ProtocolEvent>;
  /** Clear the recorded event log (in-memory state is untouched). */
  clearEvents(): void;
  /**
   * Restore the seeded in-memory state (fresh fixtures, demo balance,
   * trustlines), clear the event log, and restore the `failures` supplied via
   * `MockClientOptions` (one-shot rules queued with `failNext` are dropped).
   */
  reset(): Promise<void>;
  /** Queue a one-shot injected failure for the next matching call. */
  failNext(on: MockMethodName | '*', error?: Error, message?: string): void;
  /** Add a sticky failure rule (kept until consumed or `reset()`). */
  addFailure(rule: MockFailureRule): void;
  /** Read a mock address's position-token balance (stroops). */
  getBalance(address: string): bigint;
  /** Override a mock address's position-token balance (e.g. to set up an overdraft). */
  setBalance(address: string, amount: bigint): void;
  /** A fresh copy of the seeded invoice fixtures. */
  seededInvoices(): Invoice[];
  /** A fresh copy of the seeded offer fixtures. */
  seededOffers(): FinancingOffer[];
}

// ── Deterministic fixtures ───────────────────────────────────────────────────

function seedInvoices(): Invoice[] {
  const at = (id: string, originator: string, amount: bigint, currency: Currency, dueDate: number, status: Invoice['status'], createdDaysAgo: number): Invoice => ({
    id,
    originator,
    amount,
    currency,
    due_date: dueDate,
    status,
    created_at: new Date((NOW - createdDaysAgo * 86_400) * 1000).toISOString(),
  });

  return [
    // Pending — visible in the marketplace
    at('inv_mock_p001', MOCK_BUSINESS_A, xlm(10_000), 'XLM', days(30), 'Pending', 6),
    at('inv_mock_p002', MOCK_BUSINESS_B, xlm(25_000), 'XLM', days(45), 'Pending', 5),
    at('inv_mock_p003', MOCK_BUSINESS_A, xlm(5_000), 'USDC', days(20), 'Pending', 4),
    at('inv_mock_p004', MOCK_BUSINESS_B, xlm(75_000), 'XLM', days(60), 'Pending', 3),
    at('inv_mock_p005', MOCK_BUSINESS_C, xlm(120_000), 'USDC', days(90), 'Pending', 2),
    // Financed
    at('inv_mock_f001', MOCK_BUSINESS_A, xlm(40_000), 'XLM', days(15), 'Financed', 14),
    at('inv_mock_f002', MOCK_BUSINESS_B, xlm(18_000), 'USDC', days(10), 'Financed', 12),
    // Repaid
    at('inv_mock_r001', MOCK_BUSINESS_A, xlm(8_000), 'XLM', days(-5), 'Repaid', 45),
    at('inv_mock_r002', MOCK_BUSINESS_B, xlm(12_000), 'USDC', days(-20), 'Repaid', 40),
    // Overdue
    at('inv_mock_o001', MOCK_BUSINESS_A, xlm(15_000), 'XLM', days(-3), 'Overdue', 30),
    // Cancelled
    at('inv_mock_c001', MOCK_BUSINESS_B, xlm(6_000), 'XLM', days(14), 'Cancelled', 18),
    // Disputed
    at('inv_mock_d001', MOCK_BUSINESS_A, xlm(22_000), 'USDC', days(7), 'Disputed', 9),
    // Defaulted
    at('inv_mock_def001', MOCK_BUSINESS_B, xlm(9_000), 'XLM', days(-30), 'Defaulted', 60),
  ];
}

function seedOffers(): FinancingOffer[] {
  const offer = (
    id: string,
    invoiceId: string,
    lender: string,
    amount: bigint,
    currency: Currency,
    interestRate: number,
    durationDays: number,
    status: FinancingOffer['status'],
    amountRepaid: bigint,
    fundedDaysAgo: number,
  ): FinancingOffer => ({
    id,
    invoice_id: invoiceId,
    lender,
    amount,
    currency,
    interest_rate: interestRate,
    duration: durationDays * 86_400,
    amount_repaid: amountRepaid,
    status,
    funded_at: fundedDaysAgo <= 0 ? 0 : NOW - fundedDaysAgo * 86_400,
  });

  return [
    // The demo wallet's own offers — these populate the portfolio.
    offer('off_mock_001', 'inv_mock_f001', MOCK_WALLET_ADDRESS, xlm(40_000), 'XLM', 500, 30, 'Financed', xlm(10_000), 10),
    offer('off_mock_002', 'inv_mock_r001', MOCK_WALLET_ADDRESS, xlm(8_000), 'XLM', 450, 45, 'Repaid', xlm(8_360), 40),
    offer('off_mock_003', 'inv_mock_p001', MOCK_WALLET_ADDRESS, xlm(10_000), 'XLM', 500, 30, 'Pending', 0n, 0),
    offer('off_mock_004', 'inv_mock_o001', MOCK_WALLET_ADDRESS, xlm(15_000), 'XLM', 600, 30, 'Accepted', 0n, 35),
    offer('off_mock_005', 'inv_mock_def001', MOCK_WALLET_ADDRESS, xlm(9_000), 'XLM', 550, 30, 'Defaulted', 0n, 60),
    // Offers from other lenders — visible on invoice detail + matching history.
    offer('off_mock_006', 'inv_mock_p002', MOCK_LENDER_B, xlm(25_000), 'XLM', 480, 30, 'Pending', 0n, 0),
    offer('off_mock_007', 'inv_mock_f002', MOCK_LENDER_B, xlm(18_000), 'USDC', 520, 30, 'Financed', xlm(6_000), 8),
    offer('off_mock_008', 'inv_mock_r002', MOCK_LENDER_B, xlm(12_000), 'USDC', 500, 30, 'Repaid', xlm(12_500), 35),
  ];
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMockClient(options: MockClientOptions = {}): MockClient {
  const positionTokenId = options.positionTokenId ?? MOCK_POSITION_TOKEN_ID;
  const tokenDecimals = options.tokenDecimals ?? 7;
  const positionBalance = options.positionBalance ?? MOCK_POSITION_BALANCE;

  // In-memory state. Each call to createMockClient gets a fresh copy of the
  // fixtures, so tests (and dev sessions) start from the same seed every time.
  const invoices = new Map<string, Invoice>(seedInvoices().map(i => [i.id, i]));
  const offers = new Map<string, FinancingOffer>(seedOffers().map(o => [o.id, o]));
  const balances = new Map<string, bigint>([[MOCK_WALLET_ADDRESS, positionBalance]]);
  const trustlines = new Set<string>([MOCK_WALLET_ADDRESS]);

  // ── Event log + failure injection (testing framework, #226) ───────────────
  // Every successfully-executed state-changing call records the protocol event
  // the real contract would have published; injected failures are consumed
  // before any work happens and reject like a failed contract call.

  const events: ProtocolEvent[] = [];
  let ledger = 1000;
  let txSeq = 0;

  /** Distributive Omit — preserves the per-variant `type`↔`data` correlation across a union. */
  type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

  /** Record a protocol event with deterministic (fake) ledger + txHash fields. */
  function emit(event: DistributiveOmit<ProtocolEvent, 'ledger' | 'txHash'>): void {
    ledger += 1;
    txSeq += 1;
    // The `as` cast is required because spreading a union-typed value widens it;
    // `DistributiveOmit` keeps the per-variant `type`↔`data` correlation at the
    // call sites, so the cast is safe here.
    events.push({
      ...event,
      ledger,
      txHash: txSeq.toString(16).padStart(64, '0'),
    } as ProtocolEvent);
  }

  // Deep-copied so rule bookkeeping (times, removal) never mutates the
  // caller's `options.failures` objects, and `reset()` can faithfully
  // restore the originally-configured rules.
  const failures: MockFailureRule[] = (options.failures ?? []).map(rule => ({ ...rule }));

  /**
   * Consume the first failure rule matching `method` (if any) and return its
   * error. Returns `undefined` when no rule matches — the call proceeds.
   */
  function takeFailure(method: MockMethodName): Error | undefined {
    const idx = failures.findIndex(rule => (rule.on ?? '*') === '*' || rule.on === method);
    if (idx === -1) return undefined;
    const rule = failures[idx];
    const error = rule.error ?? new ContractError(
      -1,
      ContractErrorType.UNKNOWN,
      rule.message ?? `Simulated failure while calling ${method}`,
    );
    if (typeof rule.times === 'number') {
      rule.times -= 1;
      if (rule.times <= 0) failures.splice(idx, 1);
    }
    return error;
  }

  const requireInvoice = (id: string): Invoice => {
    const invoice = invoices.get(id);
    if (!invoice) {
      throw new ContractError(2, ContractErrorType.NOT_FOUND, `Invoice not found: ${id}`);
    }
    return invoice;
  };

  const requireOffer = (id: string): FinancingOffer => {
    const offer = offers.get(id);
    if (!offer) {
      throw new ContractError(2, ContractErrorType.NOT_FOUND, `Offer not found: ${id}`);
    }
    return offer;
  };

  // ── No-op cache handle (satisfies CacheHandle interface for offline mock)
  const mockCache: CacheHandle = {
    scope: {} as CacheScope,
    async getCached<T>(_key: string): Promise<CacheEntry<T> | null> {
      return null;
    },
    async setCached<T>(_key: string, _data: T, _version?: number, _maxSizeBytes?: number): Promise<void> {},
    async invalidate(_keyOrPrefix: string): Promise<void> {},
    async clearCache(): Promise<void> {},
    async staleWhileRevalidate<T>(
      _key: string,
      _ttlMs: number,
      fetcher: () => Promise<T>,
    ): Promise<StaleWhileRevalidateResult<T>> {
      const data = await fetcher();
      return { data, isStale: false, refresh: Promise.resolve(data) };
    },
  };

  const base: InvofiClientMethods = {
    // ── Registry ────────────────────────────────────────────────────────────
    async registerInvoice(params, originatorAddress) {
      validateStellarAddress(originatorAddress, 'originatorAddress');
      validateSymbolId(params.id, 'params.id');
      validatePositiveI128(params.amount, 'params.amount');
      validateCurrency(params.currency, 'params.currency');
      validateFutureTimestamp(params.dueDate, 'params.dueDate');

      const injected = takeFailure('registerInvoice');
      if (injected) throw injected;
      if (invoices.has(params.id)) {
        throw new ContractError(7, ContractErrorType.ALREADY_EXISTS, `Invoice already exists: ${params.id}`);
      }
      const invoice: Invoice = {
        id: params.id,
        originator: originatorAddress,
        amount: params.amount,
        currency: params.currency,
        due_date: params.dueDate,
        status: 'Pending',
        created_at: new Date().toISOString(),
      };
      invoices.set(invoice.id, invoice);
      emit({
        type: 'inv_reg',
        subjectId: invoice.id,
        contractId: MOCK_REGISTRY_ID,
        data: { originator: invoice.originator, amount: invoice.amount, dueDate: BigInt(invoice.due_date) },
      });
      return invoice;
    },

    getInvoice(id, sourceAccount) {
      validateSymbolId(id, 'id');
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      // Resolve asynchronously so a missing invoice rejects (matching the real
      // client's RPC path) while argument validation still throws synchronously.
      return Promise.resolve().then(() => {
        const injected = takeFailure('getInvoice');
        if (injected) throw injected;
        return requireInvoice(id);
      });
    },

    async cancelInvoice(invoiceId, originatorAddress) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateStellarAddress(originatorAddress, 'originatorAddress');
      const injected = takeFailure('cancelInvoice');
      if (injected) throw injected;
      const invoice = requireInvoice(invoiceId);
      if (invoice.originator !== originatorAddress) {
        throw new ContractError(1, ContractErrorType.UNAUTHORIZED, 'Only the invoice originator can cancel an invoice');
      }
      invoice.status = 'Cancelled';
      emit({ type: 'inv_cxl', subjectId: invoice.id, contractId: MOCK_REGISTRY_ID, data: { originator: invoice.originator } });
      return invoice;
    },

    // ── Financing ───────────────────────────────────────────────────────────
    async createOffer(params, lenderAddress) {
      validateStellarAddress(lenderAddress, 'lenderAddress');
      validateSymbolId(params.offerId, 'params.offerId');
      validateSymbolId(params.invoiceId, 'params.invoiceId');
      validatePositiveI128(params.amount, 'params.amount');
      validateCurrency(params.currency, 'params.currency');
      validateInterestRate(params.interestRate, 'params.interestRate');
      validateDuration(params.duration, 'params.duration');

      const injected = takeFailure('createOffer');
      if (injected) throw injected;
      if (offers.has(params.offerId)) {
        throw new ContractError(7, ContractErrorType.ALREADY_EXISTS, `Offer already exists: ${params.offerId}`);
      }
      requireInvoice(params.invoiceId);
      const offer: FinancingOffer = {
        id: params.offerId,
        invoice_id: params.invoiceId,
        lender: lenderAddress,
        amount: params.amount,
        currency: params.currency,
        interest_rate: params.interestRate,
        duration: params.duration,
        amount_repaid: 0n,
        status: 'Pending',
        funded_at: 0,
      };
      offers.set(offer.id, offer);
      emit({
        type: 'off_new',
        subjectId: offer.id,
        contractId: MOCK_FINANCING_ID,
        data: { invoiceId: offer.invoice_id, lender: offer.lender, amount: offer.amount, interestRate: offer.interest_rate },
      });
      return offer;
    },

    getOffer(id, sourceAccount) {
      validateSymbolId(id, 'id');
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return Promise.resolve().then(() => {
        const injected = takeFailure('getOffer');
        if (injected) throw injected;
        return requireOffer(id);
      });
    },

    async acceptOffer(offerId, originatorAddress) {
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(originatorAddress, 'originatorAddress');
      const injected = takeFailure('acceptOffer');
      if (injected) throw injected;
      const offer = requireOffer(offerId);
      const invoice = requireInvoice(offer.invoice_id);
      if (invoice.originator !== originatorAddress) {
        throw new ContractError(1, ContractErrorType.UNAUTHORIZED, 'Only the invoice originator can accept an offer');
      }
      offer.status = 'Accepted';
      offer.funded_at = Math.floor(Date.now() / 1000);
      invoice.status = 'Financed';
      emit({
        type: 'off_acc',
        subjectId: offer.id,
        contractId: MOCK_FINANCING_ID,
        data: { invoiceId: offer.invoice_id, lender: offer.lender, amount: offer.amount },
      });
      return offer;
    },

    async rejectOffer(offerId, originatorAddress) {
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(originatorAddress, 'originatorAddress');
      const injected = takeFailure('rejectOffer');
      if (injected) throw injected;
      const offer = requireOffer(offerId);
      const invoice = requireInvoice(offer.invoice_id);
      if (invoice.originator !== originatorAddress) {
        throw new ContractError(1, ContractErrorType.UNAUTHORIZED, 'Only the invoice originator can reject an offer');
      }
      offer.status = 'Rejected';
      emit({ type: 'off_rej', subjectId: offer.id, contractId: MOCK_FINANCING_ID, data: { invoiceId: offer.invoice_id } });
      return offer;
    },

    // ── Repayment ───────────────────────────────────────────────────────────
    async repayInvoice(invoiceId, offerId, repayerAddress, amount) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(repayerAddress, 'repayerAddress');
      validatePositiveI128(amount, 'amount');

      const injected = takeFailure('repayInvoice');
      if (injected) throw injected;
      const invoice = requireInvoice(invoiceId);
      const offer = requireOffer(offerId);
      if (offer.invoice_id !== invoiceId) {
        throw new ContractError(6, ContractErrorType.INVALID_INPUT, `Offer ${offerId} does not finance invoice ${invoiceId}`);
      }

      offer.amount_repaid += amount;
      const totalDue = offer.amount + (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
      const fullyRepaid = offer.amount_repaid >= totalDue;
      offer.status = fullyRepaid ? 'Repaid' : 'Financed';
      invoice.status = fullyRepaid ? 'Repaid' : 'Financed';
      emit({
        type: 'inv_rep',
        subjectId: invoice.id,
        contractId: MOCK_REPAYMENT_ID,
        data: { offerId, amount, fullyRepaid },
      });
      return invoice;
    },

    async markOverdue(invoiceId, callerAddress) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateStellarAddress(callerAddress, 'callerAddress');
      const injected = takeFailure('markOverdue');
      if (injected) throw injected;
      const invoice = requireInvoice(invoiceId);
      invoice.status = 'Overdue';
      emit({ type: 'inv_ovd', subjectId: invoice.id, contractId: MOCK_REPAYMENT_ID, data: { dueDate: BigInt(invoice.due_date) } });
      return invoice;
    },

    async reclaimInvoice(invoiceId, offerId, lenderAddress) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(lenderAddress, 'lenderAddress');
      const injected = takeFailure('reclaimInvoice');
      if (injected) throw injected;
      const offer = requireOffer(offerId);
      if (offer.lender !== lenderAddress) {
        throw new ContractError(1, ContractErrorType.UNAUTHORIZED, 'Only the lender can reclaim an invoice');
      }
      offer.status = 'Defaulted';
      emit({ type: 'off_def', subjectId: offer.invoice_id, contractId: MOCK_REPAYMENT_ID, data: { invoiceId: offer.invoice_id, lender: offer.lender } });
      return offer;
    },

    // ── Position tokens ─────────────────────────────────────────────────────
    getPositionTokenId(sourceAccount) {
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return Promise.resolve().then(() => {
        const injected = takeFailure('getPositionTokenId');
        if (injected) throw injected;
        return positionTokenId;
      });
    },

    getTokenBalance(tokenId, address) {
      validateStellarAddress(tokenId, 'tokenId');
      validateStellarAddress(address, 'address');
      return Promise.resolve().then(() => {
        const injected = takeFailure('getTokenBalance');
        if (injected) throw injected;
        if (tokenId !== positionTokenId) return 0n;
        return balances.get(address) ?? 0n;
      });
    },

    getTokenDecimals(tokenId) {
      validateStellarAddress(tokenId, 'tokenId');
      return Promise.resolve().then(() => {
        const injected = takeFailure('getTokenDecimals');
        if (injected) throw injected;
        return tokenDecimals;
      });
    },

    async transferPositionToken(tokenId, fromAddress, toAddress, amount) {
      validateStellarAddress(tokenId, 'tokenId');
      validateStellarAddress(fromAddress, 'fromAddress');
      validateStellarAddress(toAddress, 'toAddress');
      validatePositiveI128(amount, 'amount');

      const injected = takeFailure('transferPositionToken');
      if (injected) throw injected;
      const fromBalance = balances.get(fromAddress) ?? 0n;
      if (amount > fromBalance) {
        throw new ContractError(5, ContractErrorType.INSUFFICIENT_BALANCE, 'Insufficient position-token balance');
      }
      balances.set(fromAddress, fromBalance - amount);
      balances.set(toAddress, (balances.get(toAddress) ?? 0n) + amount);
    },

    // ── Trustlines ──────────────────────────────────────────────────────────
    async hasPositionTrustline(address) {
      validateStellarAddress(address, 'address');
      const injected = takeFailure('hasPositionTrustline');
      if (injected) throw injected;
      return trustlines.has(address);
    },

    async addPositionTrustline(address) {
      validateStellarAddress(address, 'address');
      const injected = takeFailure('addPositionTrustline');
      if (injected) throw injected;
      trustlines.add(address);
    },

    // ── Batch ───────────────────────────────────────────────────────────────
    async batch(calls, sourceAddress) {
      validateStellarAddress(sourceAddress, 'sourceAddress');
      const injected = takeFailure('batch');
      if (injected) throw injected;
      // In mock mode, return a dummy empty ScVal for each call.
      // Real batch execution is network-dependent and cannot be simulated
      // without a Soroban RPC endpoint.
      return calls.map(() => xdr.ScVal.scvVoid());
    },

    // ── Offline cache (Task 218) ─────────────────────────────────────────────
    // Type parity with the real client, which always exposes a `cache` handle.
    // The mock is pure in-memory and never touches IndexedDB, so `cache` is a
    // no-op handle — it exists purely so `MockClient` is a drop-in for
    // `InvofiClient`. Reads fall through to the fetcher immediately (no stale
    // data is ever served), which mirrors the real client's cache contract
    // from a caller's perspective while keeping the mock fully offline.
    cache: mockCache,
  };

  const client: InvofiClient = {
    ...base,
    contracts: createContractsNamespace(base),
  };

  // ── Testing surface (#226) ─────────────────────────────────────────────────
  // Attached alongside the InvofiClient methods — see `MockTestingSurface`.
  const testingSurface = {
    events,
    clearEvents(): void {
      events.length = 0;
    },
    async reset(): Promise<void> {
      invoices.clear();
      for (const invoice of seedInvoices()) invoices.set(invoice.id, invoice);
      offers.clear();
      for (const offer of seedOffers()) offers.set(offer.id, offer);
      balances.clear();
      balances.set(MOCK_WALLET_ADDRESS, positionBalance);
      trustlines.clear();
      trustlines.add(MOCK_WALLET_ADDRESS);
      events.length = 0;
      ledger = 1000;
      txSeq = 0;
      failures.splice(0, failures.length, ...(options.failures ?? []).map(rule => ({ ...rule })));
    },
    failNext(on: MockMethodName | '*', error?: Error, message?: string): void {
      failures.unshift({ on, error, message, times: 1 });
    },
    addFailure(rule: MockFailureRule): void {
      failures.push(rule);
    },
    getBalance(address: string): bigint {
      validateStellarAddress(address, 'address');
      return balances.get(address) ?? 0n;
    },
    setBalance(address: string, amount: bigint): void {
      validateStellarAddress(address, 'address');
      balances.set(address, amount);
    },
    seededInvoices(): Invoice[] {
      return seedInvoices();
    },
    seededOffers(): FinancingOffer[] {
      return seedOffers();
    },
  };

  return Object.assign(client, testingSurface);
}

export type MockClient = InvofiClient & MockTestingSurface;
