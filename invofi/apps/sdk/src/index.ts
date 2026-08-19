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
