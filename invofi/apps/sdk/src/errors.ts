// ── SDK typed error handling & Soroban error code mapping (#223) ────────────
//
// Every RPC-facing failure in client.ts (simulation failure, submit failure,
// non-SUCCESS transaction status) is funneled through `parseContractError`
// so callers get a typed `ContractError` with a stable `.errorType`, a
// human-readable `.message`, an optional `.recovery` suggestion, and the
// original failure preserved as `.cause` — instead of a plain `new Error(...)`
// with an interpolated string that can only be handled by matching text.
//
// Error codes 1–8 in `CONTRACT_ERROR_MAP` are the canonical, shared
// `common/src/errors.rs` discriminants from `Stellar-VaultLink/invofi-contracts`
// (positional Soroban `#[contracterror]` ordering: first variant = 1, second
// = 2, ...): Unauthorized, NotFound, InvalidTransition, Paused,
// InsufficientBalance, InvalidInput, AlreadyExists, Blacklisted. These are
// cross-cutting, contract-agnostic discriminants — e.g. code 2 (`NotFound`)
// covers a missing invoice, offer, or any other by-ID lookup, not a
// per-resource variant. If `common/src/errors.rs` gains variants beyond 8,
// they are not yet mapped here and fall back to `ContractErrorType.UNKNOWN`
// until added.
//
// Usage:
//   import { parseContractError, ContractError, ContractErrorType } from './errors';
//   try { ... } catch (err) { throw parseContractError(err); }

// ── Recovery suggestions ─────────────────────────────────────────────────────

/**
 * A user-facing hint for how to recover from a given error, surfaced by
 * consumers (e.g. the frontend's `SdkErrorBoundary`) alongside the error
 * message.
 */
export interface RecoverySuggestion {
  /** Human-readable recovery hint, e.g. "Fund your wallet with more XLM." */
  message: string;
  /** Optional short action label for a UI button, e.g. "Add funds". */
  action?: string;
  /** Optional URL for more information (docs, faucet, support). */
  url?: string;
}

// ── Base SDK error ───────────────────────────────────────────────────────────

/**
 * Base class for all errors thrown by @invofi/sdk beyond input validation
 * (see `SdkValidationError` in validation.ts for pre-RPC argument checks).
 *
 * Supports error chaining (contract error → SDK error → UI error): pass the
 * originating error as `cause` and it is preserved for callers that want to
 * inspect the full failure chain (e.g. `err.cause`).
 *
 * Note: this SDK targets ES2020 (see tsconfig.json), which predates the
 * ES2022 `Error` `cause` option in TypeScript's lib types. We therefore
 * carry our own `cause` field and wire it through manually rather than
 * relying on `super(message, { cause })`.
 */
export class SdkError extends Error {
  /** The original error this one was constructed from, if any. */
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SdkError';
    this.cause = cause;
    // Maintain proper prototype chain for compiled ES5 targets.
    Object.setPrototypeOf(this, SdkError.prototype);
  }
}

// ── Contract error codes ─────────────────────────────────────────────────────
// `const` object + derived union type, mirroring the `ErrorCode` convention
// in validation.ts. One entry per mapped Soroban contract error, plus
// UNKNOWN for anything not (yet) in CONTRACT_ERROR_MAP.

export const ContractErrorType = {
  // ── common/src/errors.rs canonical discriminants (codes 1–8) ───────────────
  UNAUTHORIZED:          'UNAUTHORIZED',
  NOT_FOUND:              'NOT_FOUND',
  INVALID_TRANSITION:     'INVALID_TRANSITION',
  PAUSED:                 'PAUSED',
  INSUFFICIENT_BALANCE:   'INSUFFICIENT_BALANCE',
  INVALID_INPUT:          'INVALID_INPUT',
  ALREADY_EXISTS:         'ALREADY_EXISTS',
  BLACKLISTED:            'BLACKLISTED',

  // ── Fallback ─────────────────────────────────────────────────────────────────
  UNKNOWN:                'UNKNOWN',
} as const;

export type ContractErrorType = typeof ContractErrorType[keyof typeof ContractErrorType];

// ── Contract error → typed mapping table ─────────────────────────────────────
//
// Codes 1–8 are the canonical `common/src/errors.rs` discriminants — see the
// file-level banner above. This table is the single place to extend if
// `common/src/errors.rs` ever gains variants beyond 8.

interface ContractErrorEntry {
  type: ContractErrorType;
  message: string;
  recovery?: RecoverySuggestion;
}

export const CONTRACT_ERROR_MAP: Record<number, ContractErrorEntry> = {
  1: {
    type: ContractErrorType.UNAUTHORIZED,
    message: 'The calling address is not authorized to perform this action.',
    recovery: { message: 'Sign this transaction with the address that owns/originated this resource.' },
  },
  2: {
    type: ContractErrorType.NOT_FOUND,
    message: 'No resource was found with the given ID.',
    recovery: { message: 'Double-check the ID and that it was created successfully.' },
  },
  3: {
    type: ContractErrorType.INVALID_TRANSITION,
    message: 'This action is not valid for the resource in its current status.',
    recovery: { message: 'Refresh the resource’s status and confirm the action is still applicable.' },
  },
  4: {
    type: ContractErrorType.PAUSED,
    message: 'This contract is currently paused and not accepting this action.',
    recovery: { message: 'Try again later, or check protocol announcements for details.' },
  },
  5: {
    type: ContractErrorType.INSUFFICIENT_BALANCE,
    message: 'The account does not have sufficient balance to complete this transaction.',
    recovery: { message: 'Add funds to your wallet and try again.', action: 'Add funds' },
  },
  6: {
    type: ContractErrorType.INVALID_INPUT,
    message: 'One or more input values were invalid.',
    recovery: { message: 'Check the submitted values and try again.' },
  },
  7: {
    type: ContractErrorType.ALREADY_EXISTS,
    message: 'A resource with this ID already exists.',
    recovery: { message: 'Use a different ID, or look up the existing resource instead.' },
  },
  8: {
    type: ContractErrorType.BLACKLISTED,
    message: 'This address has been blacklisted and cannot perform this action.',
    recovery: { message: 'Contact support if you believe this is a mistake.' },
  },
};

// ── Analytics hook (opt-in, dependency-free) ─────────────────────────────────
//
// Consuming apps can opt in to reporting SDK errors to their own analytics/
// observability pipeline without the SDK taking a dependency on any specific
// analytics package. No-op until `setErrorReporter` is called.

let errorReporter: ((err: SdkError) => void) | undefined;

/**
 * Register a callback invoked with every `SdkError` (including
 * `ContractError`) constructed via `parseContractError`. Optional — if never
 * called, no reporting happens. Pass `undefined` to unregister.
 */
export function setErrorReporter(fn: ((err: SdkError) => void) | undefined): void {
  errorReporter = fn;
}

/** Internal: report an error to the registered reporter, if any. Never throws. */
function reportError(err: SdkError): void {
  if (!errorReporter) return;
  try {
    errorReporter(err);
  } catch {
    // Reporting must never break the caller's error-handling flow.
  }
}

// ── Contract error ────────────────────────────────────────────────────────────

/**
 * A typed error representing a failed Soroban contract call — simulation
 * failure, submit failure, or a transaction that did not reach SUCCESS
 * status. Constructed by `parseContractError`.
 */
export class ContractError extends SdkError {
  /** The raw numeric Soroban contract error code, or -1 if none could be extracted. */
  readonly rawCode: number;
  /** The typed classification of this error (UNKNOWN if rawCode is unmapped). */
  readonly errorType: ContractErrorType;
  /** Optional recovery suggestion for this error type. */
  readonly recovery?: RecoverySuggestion;

  constructor(rawCode: number, errorType: ContractErrorType, message: string, recovery?: RecoverySuggestion, cause?: unknown) {
    super(message, cause);
    this.name = 'ContractError';
    this.rawCode = rawCode;
    this.errorType = errorType;
    this.recovery = recovery;
    // Maintain proper prototype chain for compiled ES5 targets.
    Object.setPrototypeOf(this, ContractError.prototype);
  }
}

// ── Invofi error — domain-facing name for a decoded contract failure (#188) ─
//
// `InvofiError` is the public, stable name consumers (frontend toasts,
// analytics, debugging) use for a *decoded* contract-call failure. It is a
// `ContractError`, so it carries:
//   - a machine-readable code: `errorType` (`UNAUTHORIZED`, `NOT_FOUND`,
//     `PAUSED`, `INSUFFICIENT_BALANCE`, …) plus the raw Soroban `rawCode`;
//   - a human-readable `message` plus an optional `recovery` suggestion;
//   - the original failure preserved as `cause`.
// Branching on `errorType` replaces the regex-matching of raw Soroban error
// text (#188) — the SDK decodes once, callers branch on the typed variant.

/** A decoded contract-call failure surfaced by `client.send()`. */
export type InvofiError = ContractError;

// ── Error code extraction & mapping ──────────────────────────────────────────

/**
 * Soroban simulation/transaction failures typically stringify as something
 * like `HostError: Error(Contract, #4)` or embed `Error(Contract, #4)`
 * within a larger JSON/diagnostic payload. This pattern extracts the
 * trailing `#<N>` contract error code from any such string.
 */
const CONTRACT_ERROR_CODE_RE = /Error\(Contract,\s*#(\d+)\)/;
/** Fallback: a bare `#<N>` anywhere in the string. */
const BARE_ERROR_CODE_RE = /#(\d+)/;

/** Best-effort extraction of a raw error message string from an unknown thrown value. */
function stringifyRawError(rawError: unknown): string {
  if (typeof rawError === 'string') return rawError;
  if (rawError instanceof Error) return rawError.message;
  if (rawError && typeof rawError === 'object') {
    try {
      return JSON.stringify(rawError);
    } catch {
      return String(rawError);
    }
  }
  return String(rawError);
}

/** Extracts a numeric Soroban contract error code from a raw error value, if present. */
function extractErrorCode(rawError: unknown): number | undefined {
  const text = stringifyRawError(rawError);
  const match = CONTRACT_ERROR_CODE_RE.exec(text) ?? BARE_ERROR_CODE_RE.exec(text);
  if (!match) return undefined;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : undefined;
}

/**
 * Parses a raw error (as thrown/returned by a failed `simulateTransaction`,
 * `sendTransaction`, or `getTransaction` call) into a typed `ContractError`.
 *
 * - Extracts a numeric Soroban error code (`Error(Contract, #N)`) when present.
 * - Looks it up in `CONTRACT_ERROR_MAP`; unmapped codes fall back to
 *   `ContractErrorType.UNKNOWN` with the raw code preserved.
 * - When no code can be extracted at all, falls back to `UNKNOWN` with
 *   `rawCode: -1`, preserving the original message.
 * - Always attaches the original `rawError` as `.cause` for chaining.
 * - Reports the constructed error via the opt-in analytics hook.
 *
 * This never throws — it always returns a `ContractError` for the caller to throw.
 */
export function parseContractError(rawError: unknown, contextMessage?: string): ContractError {
  const originalMessage = stringifyRawError(rawError);
  const code = extractErrorCode(rawError);

  if (code !== undefined && code in CONTRACT_ERROR_MAP) {
    const entry = CONTRACT_ERROR_MAP[code];
    const message = contextMessage ? `${contextMessage}: ${entry.message}` : entry.message;
    const err = new ContractError(code, entry.type, message, entry.recovery, rawError);
    reportError(err);
    return err;
  }

  const fallbackMessage = contextMessage
    ? `${contextMessage}: ${originalMessage}`
    : `Contract call failed: ${originalMessage}`;
  const err = new ContractError(code ?? -1, ContractErrorType.UNKNOWN, fallbackMessage, undefined, rawError);
  reportError(err);
  return err;
}
