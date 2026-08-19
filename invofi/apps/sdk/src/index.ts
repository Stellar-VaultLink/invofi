// @invofi/sdk — typed client for the InvoFi protocol (Task 15)
//
// The SDK is framework-agnostic: it takes a Stellar RPC URL, the three
// protocol contract IDs, and a `signTransaction` callback. Use it from any
// TypeScript environment (React/Next.js frontends, scripts, bots).
//
// The frontend binds it once in `apps/frontend/src/lib/contract.ts` and
// re-exports the typed methods — no contract-call code is duplicated there.

export { createInvofiClient, type InvofiClient, SdkValidationError, ErrorCode } from './client';
export type { InvofiClientConfig } from './config';
export type { Currency, FinancingOffer, Invoice, InvoiceStatus, OfferStatus } from './types';

// ── Offline mock client (#177) + contract-interaction testing (#226) ────────
// `createMockClient` is a drop-in replacement for `createInvofiClient` backed
// by in-memory state — no RPC, Horizon, wallet, or testnet required. It is for
// UI development only (no crypto/signing simulation). Deterministic fixtures
// cover every invoice status, offers, and position-token balances.
//
// Since #226 it doubles as a contract-interaction testing framework: every
// successful state-changing call records the protocol event it would have
// emitted on-chain (`client.events`, same `ProtocolEvent` shapes as
// `listenToEvents`), domain failures throw typed `ContractError`s, failure
// rules (`failures` option / `failNext`) simulate deterministic RPC/contract
// failures, and `reset()`/`setBalance`/`seededInvoices`/`seededOffers` give
// tests full control over in-memory state. Pair with `createTestInvoice` /
// `createTestOffer` (below) to compose pre-seeded data.
export {
  createMockClient,
  type MockClient,
  type MockClientOptions,
  // Testing framework (#226) types.
  type MockTestingSurface,
  type MockFailureRule,
  type MockMethodName,
  // Deterministic mock identities + fixtures (shared with the frontend mock).
  MOCK_WALLET_ADDRESS,
  MOCK_BUSINESS_A,
  MOCK_BUSINESS_B,
  MOCK_BUSINESS_C,
  MOCK_LENDER_B,
  MOCK_POSITION_TOKEN_ID,
  MOCK_POSITION_BALANCE,
  // Contract ids reported in mock-emitted events.
  MOCK_REGISTRY_ID,
  MOCK_FINANCING_ID,
  MOCK_REPAYMENT_ID,
} from './mock';

// ── Test fixture builders (#226) ────────────────────────────────────────────
// `createTestInvoice` / `createTestOffer` produce SDK-valid fixture objects
// for composing custom pre-seeded data in contract-interaction tests.
export {
  createTestInvoice,
  createTestOffer,
  toStroops,
  STROOP_BASE,
  type TestInvoiceOverrides,
  type TestOfferOverrides,
} from './testing';

// Validation helpers re-exported for consumers who want to pre-validate
// before calling SDK methods (e.g. form-level validation in the frontend).
export { validate, type ErrorCode as ValidationErrorCode } from './validation';
export {
  MIN_AMOUNT,
  MAX_INTEREST_RATE_BPS,
  MAX_DURATION_SECS,
  VALID_CURRENCIES,
} from './validation';

// ── Typed error handling & Soroban error code mapping (#223) ────────────────
// `SdkError` is the base class for all non-validation SDK errors;
// `ContractError extends SdkError` wraps a failed contract call with a typed
// `errorType`, an optional `recovery` suggestion, and the raw Soroban error
// code. `parseContractError` is the mapping entry point client.ts funnels
// every simulate/send/getTransaction failure through. `setErrorReporter` is
// an optional, dependency-free analytics/observability hook.
//
// NOTE: `CONTRACT_ERROR_MAP`'s numeric codes are a placeholder/starter set —
// see the banner comment at the top of `src/errors.ts` for details on why,
// and what must be reconciled before relying on them against live contracts.
export {
  SdkError,
  ContractError,
  ContractErrorType,
  CONTRACT_ERROR_MAP,
  parseContractError,
  setErrorReporter,
  type RecoverySuggestion,
} from './errors';

// Stellar primitives the client surface needs — re-exported so consumers
// don't need a direct @stellar/stellar-sdk dependency for common cases.
export { Contract, Networks, xdr, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';

// ── Event stream (listenToEvents) ───────────────────────────────────────────
// Typed, polling-based event subscription for InvoFi protocol events.
// All 20 on-chain event types are covered with strongly-typed payloads.
//
// @example
// ```ts
// import { listenToEvents, Networks } from '@invofi/sdk';
//
// const stop = listenToEvents({
//   rpcUrl:            'https://soroban-testnet.stellar.org',
//   networkPassphrase: Networks.TESTNET,
//   contractIds:       [registryId, financingId, repaymentId],
//   eventTypes:        ['inv_reg', 'off_acc', 'inv_rep'],
//   onEvent(event) {
//     if (event.type === 'inv_reg') {
//       console.log('Invoice registered:', event.subjectId, event.data.originator);
//     }
//   },
//   onError(err) {
//     console.error('Event stream error:', err.message);
//   },
// });
//
// // Stop polling when done:
// stop();
// ```
export { listenToEvents } from './events';
export type {
  ProtocolEventName,
  ProtocolEvent,
  ListenToEventsOptions,
  StopListening,
  // Per-event payload types
  InvoiceRegisteredData,
  InvoiceAmountUpdatedData,
  InvoiceStatusUpdatedData,
  InvoiceCancelledData,
  InvoiceOverdueData,
  InvoiceDefaultedData,
  InvoiceDisputedData,
  InvoiceResolvedData,
  OfferCreatedData,
  OfferWithdrawnData,
  OfferAcceptedData,
  OfferRejectedData,
  OfferDefaultedData,
  PositionTokenMintedData,
  InvoiceRepaidData,
  PoolStakedData,
  PoolUnstakedData,
  PoolPayoutData,
  ReputationRecordedData,
} from './events';

// ── Offline cache (IndexedDB, stale-while-revalidate) ───────────────────────
// Browser-only, gracefully no-ops under SSR/Node (see cache.ts). Caches
// invoice/offer/position reads with configurable per-type TTLs and evicts
// least-recently-used entries once total cached size exceeds 50 MB.
//
// Instance-scoped, not module-global (PR #236 review): `createCache(scope)`
// returns a handle bound to one immutable network+account `CacheScope`, each
// with its own private IndexedDB connection, so concurrent handles never
// race over which database is "current" and switching wallets never serves
// one identity's cached data to another. `createInvofiClient` builds one
// automatically from `cfg.networkPassphrase`/`cfg.accountAddress` and
// exposes it as `client.cache` — its state-changing methods
// (register/accept/reject/repay/etc.) already call `cache.invalidate()`
// internally on success. On an explicit wallet disconnect, call
// `client.cache.clearCache()` to wipe the departing account's store.
//
// @example
// ```ts
// import { createCache, CACHE_TTL_MS } from '@invofi/sdk';
//
// // Usually just `client.cache` from createInvofiClient — shown standalone
// // here for a caller that wants a cache without a full client.
// const cache = createCache({ network: cfg.networkPassphrase, accountAddress });
//
// const { data, isStale, refresh } = await cache.staleWhileRevalidate(
//   `invoices:${status}:${page}`,
//   CACHE_TTL_MS.invoices,
//   () => client.listInvoices(status, page),
// );
// // Render `data` immediately (may be null/stale); `refresh` resolves once
// // the background re-fetch has silently updated the cache.
// ```
export { createCache, isIndexedDbAvailable, CACHE_TTL_MS, MAX_CACHE_SIZE_BYTES } from './cache';
export type { CacheEntry, CacheHandle, CacheScope, StaleWhileRevalidateResult } from './cache';
