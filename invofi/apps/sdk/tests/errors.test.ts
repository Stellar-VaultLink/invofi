/**
 * Unit tests — SDK typed error handling (#223)
 *
 * Covers: parseContractError's numeric-code extraction and mapping,
 * fallback behavior for unmapped/unparseable errors, cause chaining,
 * the opt-in analytics reporter hook, and prototype-chain correctness for
 * SdkError/ContractError.
 *
 * Strategy: all tests are pure in-process — no network calls, no Soroban RPC.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  SdkError,
  ContractError,
  ContractErrorType,
  CONTRACT_ERROR_MAP,
  parseContractError,
  setErrorReporter,
} from '../src/errors';

afterEach(() => {
  // Always reset the opt-in reporter between tests so it doesn't leak.
  setErrorReporter(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// parseContractError — code extraction & mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('parseContractError', () => {
  it('extracts a mapped code from a realistic `Error(Contract, #N)` string and returns the typed error', () => {
    // Code 1 is the canonical common/src/errors.rs discriminant for Unauthorized.
    const raw = 'HostError: Error(Contract, #1)\n\nEvent log (newest first):...';
    const err = parseContractError(raw);

    expect(err).toBeInstanceOf(ContractError);
    expect(err.rawCode).toBe(1);
    expect(err.errorType).toBe(ContractErrorType.UNAUTHORIZED);
    expect(err.message).toContain(CONTRACT_ERROR_MAP[1].message);
    expect(err.recovery).toBeDefined();
    expect(err.recovery?.message).toBe(CONTRACT_ERROR_MAP[1].recovery?.message);
  });

  it('extracts a different mapped code correctly (NotFound, code 2)', () => {
    const raw = 'Error(Contract, #2)';
    const err = parseContractError(raw);

    expect(err.rawCode).toBe(2);
    expect(err.errorType).toBe(ContractErrorType.NOT_FOUND);
  });

  it('extracts InsufficientBalance (code 5), which carries an actionable recovery', () => {
    const raw = 'Error(Contract, #5)';
    const err = parseContractError(raw);

    expect(err.rawCode).toBe(5);
    expect(err.errorType).toBe(ContractErrorType.INSUFFICIENT_BALANCE);
    expect(err.recovery?.action).toBe('Add funds');
  });

  it('maps all eight canonical codes (1-8) to their expected discriminant', () => {
    const expected: Record<number, string> = {
      1: ContractErrorType.UNAUTHORIZED,
      2: ContractErrorType.NOT_FOUND,
      3: ContractErrorType.INVALID_TRANSITION,
      4: ContractErrorType.PAUSED,
      5: ContractErrorType.INSUFFICIENT_BALANCE,
      6: ContractErrorType.INVALID_INPUT,
      7: ContractErrorType.ALREADY_EXISTS,
      8: ContractErrorType.BLACKLISTED,
    };

    for (const [code, type] of Object.entries(expected)) {
      const err = parseContractError(`Error(Contract, #${code})`);
      expect(err.errorType).toBe(type);
    }
  });

  it('does not map code 9 or above — those fall back to UNKNOWN', () => {
    expect(CONTRACT_ERROR_MAP[9]).toBeUndefined();
    expect(CONTRACT_ERROR_MAP[15]).toBeUndefined();

    const err = parseContractError('Error(Contract, #9)');
    expect(err.errorType).toBe(ContractErrorType.UNKNOWN);
    expect(err.rawCode).toBe(9);
  });

  it('prefixes the mapped message with an optional context message', () => {
    const raw = 'Error(Contract, #1)';
    const err = parseContractError(raw, 'Simulation failed');
    expect(err.message.startsWith('Simulation failed:')).toBe(true);
  });

  it('falls back to UNKNOWN for a code not present in CONTRACT_ERROR_MAP, without throwing', () => {
    const raw = 'Error(Contract, #999999)';
    let err: ContractError | undefined;
    expect(() => {
      err = parseContractError(raw);
    }).not.toThrow();

    expect(err).toBeInstanceOf(ContractError);
    expect(err!.errorType).toBe(ContractErrorType.UNKNOWN);
    expect(err!.rawCode).toBe(999999);
    expect(err!.message).toContain('999999');
  });

  it('falls back to UNKNOWN with rawCode -1 when no code can be extracted at all', () => {
    const raw = 'network request timed out';
    const err = parseContractError(raw);

    expect(err.errorType).toBe(ContractErrorType.UNKNOWN);
    expect(err.rawCode).toBe(-1);
    expect(err.message).toContain('network request timed out');
  });

  it('handles a plain Error instance as input and preserves its message', () => {
    const original = new Error('Error(Contract, #1)');
    const err = parseContractError(original);
    expect(err.errorType).toBe(ContractErrorType.UNAUTHORIZED);
  });

  it('handles a non-string, non-Error object payload (e.g. sendResult.errorResult-shaped)', () => {
    const raw = { status: 'ERROR', errorResultXdr: 'AAAAAAAAAGT////+AAAAAA==' };
    let err: ContractError | undefined;
    expect(() => {
      err = parseContractError(raw);
    }).not.toThrow();
    expect(err).toBeInstanceOf(ContractError);
    expect(err!.errorType).toBe(ContractErrorType.UNKNOWN);
  });

  it('chains the original raw error as `cause`', () => {
    const original = new Error('Error(Contract, #1)');
    const err = parseContractError(original);
    expect(err.cause).toBe(original);
  });

  it('chains a non-Error raw value as `cause` too', () => {
    const raw = 'Error(Contract, #1)';
    const err = parseContractError(raw);
    expect(err.cause).toBe(raw);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setErrorReporter — opt-in analytics hook
// ─────────────────────────────────────────────────────────────────────────────

describe('setErrorReporter', () => {
  it('is not invoked when no reporter is registered', () => {
    // No reporter set (afterEach clears it) — this must not throw.
    expect(() => parseContractError('Error(Contract, #1)')).not.toThrow();
  });

  it('is invoked with the constructed error once a reporter is registered', () => {
    const seen: SdkError[] = [];
    setErrorReporter(err => seen.push(err));

    const err = parseContractError('Error(Contract, #1)');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(err);
  });

  it('is invoked for UNKNOWN/unmapped errors too', () => {
    const seen: SdkError[] = [];
    setErrorReporter(err => seen.push(err));

    parseContractError('some unparseable failure');

    expect(seen).toHaveLength(1);
  });

  it('a reporter that throws does not break parseContractError', () => {
    setErrorReporter(() => {
      throw new Error('reporter boom');
    });

    expect(() => parseContractError('Error(Contract, #1)')).not.toThrow();
  });

  it('stops being invoked once unregistered with undefined', () => {
    const seen: SdkError[] = [];
    setErrorReporter(err => seen.push(err));
    setErrorReporter(undefined);

    parseContractError('Error(Contract, #1)');

    expect(seen).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SdkError / ContractError — class hierarchy & prototype chain
// ─────────────────────────────────────────────────────────────────────────────

describe('SdkError / ContractError class hierarchy', () => {
  it('ContractError is an instance of SdkError and Error', () => {
    const err = parseContractError('Error(Contract, #1)');
    expect(err).toBeInstanceOf(ContractError);
    expect(err).toBeInstanceOf(SdkError);
    expect(err).toBeInstanceOf(Error);
  });

  it('instanceof checks survive when caught from a thrown value (ES5-target prototype chain)', () => {
    try {
      throw parseContractError('Error(Contract, #1)');
    } catch (e) {
      expect(e instanceof ContractError).toBe(true);
      expect(e instanceof SdkError).toBe(true);
      expect(e instanceof Error).toBe(true);
    }
  });

  it('SdkError sets name to "SdkError" and ContractError overrides it to "ContractError"', () => {
    const base = new SdkError('base message');
    expect(base.name).toBe('SdkError');

    const contractErr = parseContractError('Error(Contract, #1)');
    expect(contractErr.name).toBe('ContractError');
  });

  it('SdkError carries an optional cause', () => {
    const cause = new Error('root cause');
    const err = new SdkError('wrapped', cause);
    expect(err.cause).toBe(cause);
  });

  it('SdkError without a cause leaves it undefined', () => {
    const err = new SdkError('no cause here');
    expect(err.cause).toBeUndefined();
  });
});
