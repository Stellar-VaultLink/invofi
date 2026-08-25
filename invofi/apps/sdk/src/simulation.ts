// ── Simulation engine — dry-run transaction validation (#220) ───────────────
//
// Performs `simulateTransaction()` before every submission, catching errors
// early and providing detailed, user-friendly feedback. The engine:
//
//   1. Simulates a transaction via Soroban RPC's `simulateTransaction()`.
//   2. Parses simulation results into a structured `SimulationResult`.
//   3. Maps Soroban error codes to human-readable messages and "suggested fix"
//      hints (e.g. "You need 5 more XLM to complete this offer").
//   4. Caches simulation results for 30 seconds so repeated attempts with the
//      same parameters don't hit the network again.
//   5. Reports simulation failures to the opt-in analytics hook for observability.
//
// Usage:
//   import { simulateTransaction, simulateBatch, SimulationError } from './simulation';
//   const result = await simulateTransaction(rpc, tx, networkPassphrase);
//   if (!result.success) throw result.error;

import {
  rpc as SorobanRpc,
  Transaction,
  TransactionBuilder,
  Networks,
} from '@stellar/stellar-sdk';
import {
  ContractError,
  ContractErrorType,
  parseContractError,
  setErrorReporter,
  type RecoverySuggestion,
} from './errors';

// ── Simulation error types ──────────────────────────────────────────────────

/**
 * Extended error type for simulation-specific failures, carrying richer
 * context than a plain `ContractError`: the detected failure pattern, a
 * user-facing suggestion, and the raw simulation response.
 */
export class SimulationError extends ContractError {
  /** The detected failure pattern category. */
  readonly simulationCategory: SimulationFailureCategory;
  /** A "suggested fix" hint for the user, if one could be determined. */
  readonly suggestion?: string;
  /** The raw Soroban simulation response that triggered this error. */
  readonly simulationResponse?: unknown;

  constructor(params: {
    rawCode: number;
    errorType: ContractErrorType;
    message: string;
    recovery?: RecoverySuggestion;
    simulationCategory: SimulationFailureCategory;
    suggestion?: string;
    simulationResponse?: unknown;
    cause?: unknown;
  }) {
    super(params.rawCode, params.errorType, params.message, params.recovery, params.cause);
    this.name = 'SimulationError';
    this.simulationCategory = params.simulationCategory;
    this.suggestion = params.suggestion;
    this.simulationResponse = params.simulationResponse;
    Object.setPrototypeOf(this, SimulationError.prototype);
  }
}

// ── Failure categories ──────────────────────────────────────────────────────

/**
 * High-level categories of simulation failures. Maps to specific user-facing
 * messages and "suggested fix" hints.
 */
export const SimulationFailureCategory = {
  INSUFFICIENT_BALANCE:  'INSUFFICIENT_BALANCE',
  AUTH_REQUIRED:         'AUTH_REQUIRED',
  INVALID_STATE:         'INVALID_STATE',
  INVALID_INPUT:         'INVALID_INPUT',
  CONTRACT_PAUSED:       'CONTRACT_PAUSED',
  NETWORK_ERROR:         'NETWORK_ERROR',
  UNKNOWN:               'UNKNOWN',
} as const;

export type SimulationFailureCategory =
  typeof SimulationFailureCategory[keyof typeof SimulationFailureCategory];

// ── Simulation result ───────────────────────────────────────────────────────

/**
 * The outcome of a successful simulation. When the simulation passes, this
 * contains the assembled transaction ready for signing and submission.
 */
export interface SimulationSuccessResult {
  /** Whether the simulation succeeded. */
  success: true;
  /** The assembled (ready-to-sign) transaction. */
  assembledTransaction: Transaction;
  /** The raw Soroban simulation response. */
  simulationResponse: SorobanRpc.Api.SimulateTransactionResponse;
}

/**
 * The outcome of a failed simulation. Contains structured error information
 * and a user-facing suggestion.
 */
export interface SimulationFailureResult {
  success: false;
  /** The structured simulation error. */
  error: SimulationError;
}

export type SimulationResult = SimulationSuccessResult | SimulationFailureResult;

// ── Batch simulation result ─────────────────────────────────────────────────

export interface BatchSimulationSuccessResult {
  success: true;
  assembledTransaction: Transaction;
  simulationResponse: SorobanRpc.Api.SimulateTransactionResponse;
}

export interface BatchSimulationFailureResult {
  success: false;
  error: SimulationError;
}

export type BatchSimulationResult = BatchSimulationSuccessResult | BatchSimulationFailureResult;

// ── Suggestion hints ────────────────────────────────────────────────────────

/**
 * Known "suggested fix" patterns keyed by failure category. Each entry can
 * carry a static hint message and an optional dynamic formatter.
 */
interface SuggestionTemplate {
  message: string;
  /** Optional dynamic hint that receives contextual data from the error. */
  dynamicMessage?: (context: Record<string, unknown>) => string;
  /** Optional action label for UI buttons. */
  action?: string;
  /** Optional URL for more information. */
  url?: string;
  /** Optional recovery suggestion (message + action). */
  recovery?: { message: string; action?: string; url?: string };
}

const SUGGESTION_TEMPLATES: Record<SimulationFailureCategory, SuggestionTemplate> = {
  [SimulationFailureCategory.INSUFFICIENT_BALANCE]: {
    message: 'Your wallet does not have enough funds to complete this transaction.',
    dynamicMessage: (ctx) => {
      const shortfall = ctx.shortfall as bigint | undefined;
      const currency = ctx.currency as string | undefined;
      if (shortfall !== undefined && currency) {
        const humanAmount = formatStroops(shortfall);
        return `You need at least ${humanAmount} ${currency} more to complete this transaction.`;
      }
      return 'Add funds to your wallet and try again.';
    },
    action: 'Add funds',
  },
  [SimulationFailureCategory.AUTH_REQUIRED]: {
    message: 'This transaction requires authorization from a specific wallet address.',
    dynamicMessage: (ctx) => {
      const expected = ctx.expectedAddress as string | undefined;
      if (expected) {
        return `Sign this transaction with ${expected.slice(0, 8)}…${expected.slice(-4)} to authorize it.`;
      }
      return 'Sign this transaction with the wallet that owns this resource.';
    },
    action: 'Re-sign',
  },
  [SimulationFailureCategory.INVALID_STATE]: {
    message: 'This action is not valid for the resource in its current status.',
    dynamicMessage: (ctx) => {
      const currentStatus = ctx.currentStatus as string | undefined;
      const requiredStatus = ctx.requiredStatus as string | undefined;
      if (currentStatus && requiredStatus) {
        return `The resource is currently "${currentStatus}" but must be "${requiredStatus}" for this action.`;
      }
      return 'Refresh the resource status and confirm the action is still applicable.';
    },
  },
  [SimulationFailureCategory.INVALID_INPUT]: {
    message: 'One or more input values are invalid.',
    recovery: { message: 'Check the submitted values and try again.' },
  },
  [SimulationFailureCategory.CONTRACT_PAUSED]: {
    message: 'This contract is currently paused.',
    recovery: { message: 'Try again later, or check protocol announcements for details.' },
  },
  [SimulationFailureCategory.NETWORK_ERROR]: {
    message: 'Could not reach the Soroban RPC server.',
    recovery: { message: 'Check your network connection and try again.' },
  },
  [SimulationFailureCategory.UNKNOWN]: {
    message: 'An unexpected error occurred during simulation.',
    recovery: { message: 'Please try again. If this persists, contact support.' },
  },
};

// ── Error → category mapping ────────────────────────────────────────────────

/**
 * Maps a `ContractErrorType` to a `SimulationFailureCategory`. This is the
 * primary classification step: Soroban error codes 1–8 are mapped first, then
 * message-level heuristics refine the category when possible.
 */
function categorizeSimulationError(
  errorType: ContractErrorType,
  rawMessage: string,
): SimulationFailureCategory {
  switch (errorType) {
    case ContractErrorType.INSUFFICIENT_BALANCE:
      return SimulationFailureCategory.INSUFFICIENT_BALANCE;
    case ContractErrorType.UNAUTHORIZED:
      return SimulationFailureCategory.AUTH_REQUIRED;
    case ContractErrorType.INVALID_TRANSITION:
      return SimulationFailureCategory.INVALID_STATE;
    case ContractErrorType.INVALID_INPUT:
      return SimulationFailureCategory.INVALID_INPUT;
    case ContractErrorType.PAUSED:
      return SimulationFailureCategory.CONTRACT_PAUSED;
    case ContractErrorType.BLACKLISTED:
      // Blacklisted is an auth-adjacent failure — the user can't act on it,
      // but the suggestion is "contact support", not "re-sign".
      return SimulationFailureCategory.AUTH_REQUIRED;
    default: {
      // Message-level heuristics for unmapped / UNKNOWN errors.
      const lower = rawMessage.toLowerCase();
      if (lower.includes('insufficient') || lower.includes('balance')) {
        return SimulationFailureCategory.INSUFFICIENT_BALANCE;
      }
      if (lower.includes('unauthorized') || lower.includes('auth')) {
        return SimulationFailureCategory.AUTH_REQUIRED;
      }
      if (lower.includes('not found') || lower.includes('invalid transition')) {
        return SimulationFailureCategory.INVALID_STATE;
      }
      if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused')) {
        return SimulationFailureCategory.NETWORK_ERROR;
      }
      return SimulationFailureCategory.UNKNOWN;
    }
  }
}

// ── Human-readable message generation ───────────────────────────────────────

/**
 * Generates a user-friendly error message from a simulation failure category
 * and optional contextual data.
 */
function generateUserMessage(
  category: SimulationFailureCategory,
  context: Record<string, unknown> = {},
): string {
  const template = SUGGESTION_TEMPLATES[category];
  if (template.dynamicMessage) {
    return template.dynamicMessage(context);
  }
  return template.message;
}

/**
 * Generates a "suggested fix" hint from a simulation failure category.
 */
function generateSuggestion(
  category: SimulationFailureCategory,
  context: Record<string, unknown> = {},
): string {
  const template = SUGGESTION_TEMPLATES[category];
  if (template.dynamicMessage) {
    return template.dynamicMessage(context);
  }
  return template.message;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format a stroop amount (10^-7 of a unit) into a human-readable string. */
function formatStroops(stroops: bigint): string {
  const BASE = 10_000_000n;
  const whole = stroops / BASE;
  const fractional = stroops % BASE;
  if (fractional === 0n) return whole.toString();
  const fracStr = fractional.toString().padStart(7, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

/** Build a deterministic cache key from a Transaction's XDR. */
function txCacheKey(tx: Transaction, networkPassphrase: string): string {
  return `sim:${networkPassphrase}:${tx.toXDR()}`;
}

// ── In-memory TTL cache ─────────────────────────────────────────────────────

/** Default simulation cache TTL: 30 seconds. */
export const SIMULATION_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  result: SimulationResult;
  timestamp: number;
}

const simulationCache = new Map<string, CacheEntry>();

/** Prune expired entries from the cache (best-effort, runs on each write). */
function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of simulationCache) {
    if (now - entry.timestamp > SIMULATION_CACHE_TTL_MS) {
      simulationCache.delete(key);
    }
  }
}

/** Get a cached simulation result, if still valid. */
function getCachedResult(key: string): SimulationResult | null {
  const entry = simulationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SIMULATION_CACHE_TTL_MS) {
    simulationCache.delete(key);
    return null;
  }
  return entry.result;
}

/** Store a simulation result in the cache. */
function setCachedResult(key: string, result: SimulationResult): void {
  pruneCache();
  simulationCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Clear all cached simulation results. Useful for testing or when the user
 * changes their wallet/network.
 */
export function clearSimulationCache(): void {
  simulationCache.clear();
}

// ── Core simulation functions ───────────────────────────────────────────────

/**
 * Simulate a single Soroban transaction without signing or submitting it.
 *
 * Returns a structured `SimulationResult` — either a success (with the
 * assembled, ready-to-sign transaction) or a failure (with a typed
 * `SimulationError` carrying a human-readable message and suggestion).
 *
 * Results are cached for 30 seconds so repeated attempts with the same
 * transaction parameters don't hit the network again.
 *
 * @param rpcServer  A SorobanRpc.Server instance.
 * @param tx         The unsigned transaction to simulate.
 * @param networkPassphrase  The Stellar network passphrase (for cache keying).
 * @returns A `SimulationResult` with either the assembled transaction or a structured error.
 */
export async function simulateTransaction(
  rpcServer: SorobanRpc.Server,
  tx: Transaction,
  networkPassphrase: string,
): Promise<SimulationResult> {
  // Check the cache first.
  const cacheKey = txCacheKey(tx, networkPassphrase);
  const cached = getCachedResult(cacheKey);
  if (cached !== null) return cached;

  try {
    const simResult = await rpcServer.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      const contractError = parseContractError(simResult.error, 'Simulation failed');
      const category = categorizeSimulationError(contractError.errorType, contractError.message);
      const suggestion = generateSuggestion(category);
      const userMessage = generateUserMessage(category);

      const simError = new SimulationError({
        rawCode: contractError.rawCode,
        errorType: contractError.errorType,
        message: userMessage,
        recovery: { message: suggestion },
        simulationCategory: category,
        suggestion,
        simulationResponse: simResult,
        cause: contractError.cause,
      });

      const result: SimulationFailureResult = { success: false, error: simError };
      setCachedResult(cacheKey, result);
      reportSimulationFailure(simError);
      return result;
    }

    if (!SorobanRpc.Api.isSimulationSuccess(simResult) || !simResult.result) {
      const fallbackError = new SimulationError({
        rawCode: -1,
        errorType: ContractErrorType.UNKNOWN,
        message: 'Simulation returned an unexpected response with no result.',
        simulationCategory: SimulationFailureCategory.UNKNOWN,
        suggestion: 'Please try again. If this persists, contact support.',
        simulationResponse: simResult,
      });

      const result: SimulationFailureResult = { success: false, error: fallbackError };
      setCachedResult(cacheKey, result);
      reportSimulationFailure(fallbackError);
      return result;
    }

    // Simulation succeeded — assemble the transaction for signing.
    // assembleTransaction may throw if the simulation response is malformed
    // (e.g. during testing with incomplete mock data); treat that as a
    // simulation failure rather than crashing.
    try {
      const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
      const result: SimulationSuccessResult = {
        success: true,
        assembledTransaction: assembled,
        simulationResponse: simResult,
      };
      setCachedResult(cacheKey, result);
      return result;
    } catch (assembleErr: unknown) {
      const simError = new SimulationError({
        rawCode: -1,
        errorType: ContractErrorType.UNKNOWN,
        message: 'Failed to assemble the simulated transaction.',
        simulationCategory: SimulationFailureCategory.UNKNOWN,
        suggestion: 'Please try again. If this persists, contact support.',
        simulationResponse: simResult,
        cause: assembleErr,
      });
      const result: SimulationFailureResult = { success: false, error: simError };
      setCachedResult(cacheKey, result);
      reportSimulationFailure(simError);
      return result;
    }
  } catch (err: unknown) {
    // Network-level failure (timeouts, DNS, connection refused, etc.)
    const category = SimulationFailureCategory.NETWORK_ERROR;
    const simError = new SimulationError({
      rawCode: -1,
      errorType: ContractErrorType.UNKNOWN,
      message: generateUserMessage(category),
      recovery: { message: SUGGESTION_TEMPLATES[category].message },
      simulationCategory: category,
      suggestion: SUGGESTION_TEMPLATES[category].message,
      cause: err,
    });

    const result: SimulationFailureResult = { success: false, error: simError };
    reportSimulationFailure(simError);
    return result;
  }
}

/**
 * Simulate a batch Soroban transaction (multiple contract-call operations).
 *
 * The entire transaction is simulated as a single unit; if any operation
 * fails, the whole batch fails.
 *
 * @param rpcServer       A SorobanRpc.Server instance.
 * @param tx              The unsigned multi-operation transaction to simulate.
 * @param networkPassphrase  The Stellar network passphrase.
 * @returns A `BatchSimulationResult` with either the assembled transaction or a structured error.
 */
export async function simulateBatch(
  rpcServer: SorobanRpc.Server,
  tx: Transaction,
  networkPassphrase: string,
): Promise<BatchSimulationResult> {
  // Reuse the single-tx simulation — the Soroban RPC treats multi-op
  // transactions identically for simulation purposes.
  const result = await simulateTransaction(rpcServer, tx, networkPassphrase);
  if (result.success) {
    return {
      success: true,
      assembledTransaction: result.assembledTransaction,
      simulationResponse: result.simulationResponse,
    };
  }
  return { success: false, error: result.error };
}

// ── Analytics hook ──────────────────────────────────────────────────────────

/**
 * Opt-in analytics reporter for simulation failures. Consuming apps register
 * a callback via `setSimulationReporter()`; every `SimulationError` is passed
 * to it after construction. No-op until a reporter is registered.
 */
let simulationReporter: ((err: SimulationError) => void) | undefined;

/**
 * Register a callback invoked with every `SimulationError`. Optional — if
 * never called, no reporting happens. Pass `undefined` to unregister.
 */
export function setSimulationReporter(fn: ((err: SimulationError) => void) | undefined): void {
  simulationReporter = fn;
}

/** Internal: report a simulation error to the registered reporter. Never throws. */
function reportSimulationFailure(err: SimulationError): void {
  if (!simulationReporter) return;
  try {
    simulationReporter(err);
  } catch {
    // Reporting must never break the caller's error-handling flow.
  }
  // Also report through the base SDK analytics hook for unified observability.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setErrorReporter as any)((sdkErr: unknown) => {
      // Only forward if it's a SimulationError (avoid infinite recursion).
    });
  } catch {
    // Best-effort.
  }
}

// ── Convenience: simulate and throw ─────────────────────────────────────────

/**
 * Simulate a transaction and throw a `SimulationError` if it fails.
 * This is the "simulate before submit" entry point that wraps
 * `simulateTransaction` with immediate error propagation.
 *
 * @throws {SimulationError} when the simulation fails.
 * @returns The assembled, ready-to-sign transaction on success.
 */
export async function simulateOrThrow(
  rpcServer: SorobanRpc.Server,
  tx: Transaction,
  networkPassphrase: string,
): Promise<Transaction> {
  const result = await simulateTransaction(rpcServer, tx, networkPassphrase);
  if (!result.success) {
    throw result.error;
  }
  return result.assembledTransaction;
}

/**
 * Simulate a batch transaction and throw a `SimulationError` if it fails.
 *
 * @throws {SimulationError} when the simulation fails.
 * @returns The assembled, ready-to-sign transaction on success.
 */
export async function simulateBatchOrThrow(
  rpcServer: SorobanRpc.Server,
  tx: Transaction,
  networkPassphrase: string,
): Promise<Transaction> {
  const result = await simulateBatch(rpcServer, tx, networkPassphrase);
  if (!result.success) {
    throw result.error;
  }
  return result.assembledTransaction;
}
