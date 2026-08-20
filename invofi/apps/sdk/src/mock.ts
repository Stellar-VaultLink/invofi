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

import type { InvofiClient } from './client';
import type { Currency, FinancingOffer, Invoice } from './types';
import type { CacheHandle, CacheScope, CacheEntry, StaleWhileRevalidateResult } from './cache';
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

export function createMockClient(options: MockClientOptions = {}): InvofiClient {
  const positionTokenId = options.positionTokenId ?? MOCK_POSITION_TOKEN_ID;
  const tokenDecimals = options.tokenDecimals ?? 7;
  const positionBalance = options.positionBalance ?? MOCK_POSITION_BALANCE;

  // In-memory state. Each call to createMockClient gets a fresh copy of the
  // fixtures, so tests (and dev sessions) start from the same seed every time.
  const invoices = new Map<string, Invoice>(seedInvoices().map(i => [i.id, i]));
  const offers = new Map<string, FinancingOffer>(seedOffers().map(o => [o.id, o]));
  const balances = new Map<string, bigint>([[MOCK_WALLET_ADDRESS, positionBalance]]);
  const trustlines = new Set<string>([MOCK_WALLET_ADDRESS]);

  const requireInvoice = (id: string): Invoice => {
    const invoice = invoices.get(id);
    if (!invoice) throw new Error(`Invoice not found: ${id}`);
    return invoice;
  };

  const requireOffer = (id: string): FinancingOffer => {
    const offer = offers.get(id);
    if (!offer) throw new Error(`Offer not found: ${id}`);
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

  const client: InvofiClient = {
    // ── Cache (no-op for offline mock) ──────────────────────────────────────
    cache: mockCache,

    // ── Registry ────────────────────────────────────────────────────────────
    async registerInvoice(params, originatorAddress) {
      validateStellarAddress(originatorAddress, 'originatorAddress');
      validateSymbolId(params.id, 'params.id');
      validatePositiveI128(params.amount, 'params.amount');
      validateCurrency(params.currency, 'params.currency');
      validateFutureTimestamp(params.dueDate, 'params.dueDate');

      if (invoices.has(params.id)) {
        throw new Error(`Invoice already exists: ${params.id}`);
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
      return invoice;
    },

    getInvoice(id, sourceAccount) {
      validateSymbolId(id, 'id');
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      // Resolve asynchronously so a missing invoice rejects (matching the real
      // client's RPC path) while argument validation still throws synchronously.
      return Promise.resolve().then(() => requireInvoice(id));
    },

    async cancelInvoice(invoiceId, originatorAddress) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateStellarAddress(originatorAddress, 'originatorAddress');
      const invoice = requireInvoice(invoiceId);
      if (invoice.originator !== originatorAddress) {
        throw new Error('Only the invoice originator can cancel an invoice');
      }
      invoice.status = 'Cancelled';
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

      if (offers.has(params.offerId)) {
        throw new Error(`Offer already exists: ${params.offerId}`);
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
      return offer;
    },

    getOffer(id, sourceAccount) {
      validateSymbolId(id, 'id');
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return Promise.resolve().then(() => requireOffer(id));
    },

    async acceptOffer(offerId, originatorAddress) {
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(originatorAddress, 'originatorAddress');
      const offer = requireOffer(offerId);
      const invoice = requireInvoice(offer.invoice_id);
      if (invoice.originator !== originatorAddress) {
        throw new Error('Only the invoice originator can accept an offer');
      }
      offer.status = 'Accepted';
      offer.funded_at = Math.floor(Date.now() / 1000);
      invoice.status = 'Financed';
      return offer;
    },

    async rejectOffer(offerId, originatorAddress) {
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(originatorAddress, 'originatorAddress');
      const offer = requireOffer(offerId);
      offer.status = 'Rejected';
      return offer;
    },

    // ── Repayment ───────────────────────────────────────────────────────────
    async repayInvoice(invoiceId, offerId, repayerAddress, amount) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(repayerAddress, 'repayerAddress');
      validatePositiveI128(amount, 'amount');

      const invoice = requireInvoice(invoiceId);
      const offer = requireOffer(offerId);
      if (offer.invoice_id !== invoiceId) {
        throw new Error(`Offer ${offerId} does not finance invoice ${invoiceId}`);
      }

      offer.amount_repaid += amount;
      const totalDue = offer.amount + (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
      const fullyRepaid = offer.amount_repaid >= totalDue;
      offer.status = fullyRepaid ? 'Repaid' : 'Financed';
      invoice.status = fullyRepaid ? 'Repaid' : 'Financed';
      return invoice;
    },

    async markOverdue(invoiceId, callerAddress) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateStellarAddress(callerAddress, 'callerAddress');
      const invoice = requireInvoice(invoiceId);
      invoice.status = 'Overdue';
      return invoice;
    },

    async reclaimInvoice(invoiceId, offerId, lenderAddress) {
      validateSymbolId(invoiceId, 'invoiceId');
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(lenderAddress, 'lenderAddress');
      const offer = requireOffer(offerId);
      if (offer.lender !== lenderAddress) {
        throw new Error('Only the lender can reclaim an invoice');
      }
      offer.status = 'Defaulted';
      return offer;
    },

    // ── Position tokens ─────────────────────────────────────────────────────
    getPositionTokenId(sourceAccount) {
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return Promise.resolve(positionTokenId);
    },

    getTokenBalance(tokenId, address) {
      validateStellarAddress(tokenId, 'tokenId');
      validateStellarAddress(address, 'address');
      if (tokenId !== positionTokenId) return Promise.resolve(0n);
      return Promise.resolve(balances.get(address) ?? 0n);
    },

    getTokenDecimals(tokenId) {
      validateStellarAddress(tokenId, 'tokenId');
      return Promise.resolve(tokenDecimals);
    },

    async transferPositionToken(tokenId, fromAddress, toAddress, amount) {
      validateStellarAddress(tokenId, 'tokenId');
      validateStellarAddress(fromAddress, 'fromAddress');
      validateStellarAddress(toAddress, 'toAddress');
      validatePositiveI128(amount, 'amount');

      const fromBalance = balances.get(fromAddress) ?? 0n;
      if (amount > fromBalance) {
        throw new Error('Insufficient position-token balance');
      }
      balances.set(fromAddress, fromBalance - amount);
      balances.set(toAddress, (balances.get(toAddress) ?? 0n) + amount);
    },

    // ── Trustlines ──────────────────────────────────────────────────────────
    async hasPositionTrustline(address) {
      validateStellarAddress(address, 'address');
      return trustlines.has(address);
    },

    async addPositionTrustline(address) {
      validateStellarAddress(address, 'address');
      trustlines.add(address);
    },
  };

  return client;
}

export type MockClient = InvofiClient;
