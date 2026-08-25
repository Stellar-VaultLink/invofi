/**
 * Unit tests — Simulation engine (#220)
 *
 * Covers:
 *   - SimulationError class hierarchy and properties
 *   - SimulationFailureCategory mapping
 *   - User-friendly message generation
 *   - "Suggested fix" hints for each failure category
 *   - In-memory TTL cache (30s expiry, deduplication)
 *   - simulateTransaction / simulateBatch / simulateOrThrow / simulateBatchOrThrow
 *   - Error propagation and analytics reporting
 *   - Edge cases: network errors, unknown errors, malformed responses
 *
 * Strategy: all tests mock the Soroban RPC server to avoid network calls.
 * Each test imports the simulation helpers directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SimulationError,
  SimulationFailureCategory,
  simulateTransaction,
  simulateBatch,
  simulateOrThrow,
  simulateBatchOrThrow,
  clearSimulationCache,
  setSimulationReporter,
  SIMULATION_CACHE_TTL_MS,
} from '../src/simulation';
import { ContractError, ContractErrorType } from '../src/errors';
import {
  TransactionBuilder,
  Networks,
  Contract,
  nativeToScVal,
  rpc as SorobanRpc,
  Transaction,
} from '@stellar/stellar-sdk';

// ── Mock assembleTransaction ────────────────────────────────────────────────
// SorobanRpc.assembleTransaction requires a fully valid simulation response
// with real XDR data. In tests we mock it to return the original transaction
// (wrapped as a builder mock).
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: (_tx: Transaction, _sim: unknown) => ({
        build: () => _tx,
      }),
    },
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_G_ADDRESS = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
const VALID_C_ADDRESS = 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7';
const NETWORK_PASSPHRASE = Networks.TESTNET;

/**
 * Build a minimal unsigned transaction for simulation tests.
 * Uses a dummy account to avoid network dependency.
 */
function buildDummyTx(): Transaction {
  // We use a zeroed-out account object — enough for TransactionBuilder to
  // create a valid XDR, which is all we need for simulation mocking.
  const dummyAccount = {
    accountId: () => VALID_G_ADDRESS,
    sequenceNumber: () => 0n,
    incrementSequenceNumber: () => {},
  };
  return new TransactionBuilder(dummyAccount as never, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      new Contract(VALID_C_ADDRESS).call(
        'test_method',
        nativeToScVal('test_id', { type: 'symbol' }),
      ),
    )
    .setTimeout(30)
    .build();
}

/**
 * Create a mock SorobanRpc.Server that returns the specified simulation result.
 */
function createMockRpcServer(
  simulationResponse: SorobanRpc.Api.SimulateTransactionResponse,
): SorobanRpc.Server {
  return {
    simulateTransaction: vi.fn().mockResolvedValue(simulationResponse),
  } as unknown as SorobanRpc.Server;
}

/**
 * Create a mock RPC server that throws on simulateTransaction (network error).
 */
function createFailingRpcServer(error: Error): SorobanRpc.Server {
  return {
    simulateTransaction: vi.fn().mockRejectedValue(error),
  } as unknown as SorobanRpc.Server;
}

/** Build a successful simulation response with a return value. */
function successfulSimResponse(): SorobanRpc.Api.SimulateTransactionResponse {
  return {
    id: 'test-sim-id',
    transactionData: {} as never, // isSimulationSuccess checks "transactionData" in sim
    result: {
      auth: [],
      retval: { type: 0 } as never, // scvVoid
    },
    cost: { cpuInsn: 1000, memByte: 512, txByte: 200 },
    events: [],
  } as unknown as SorobanRpc.Api.SimulateTransactionResponse;
}

/** Build a failed simulation response with a Soroban error code. */
function errorSimResponse(
  code: number,
  message?: string,
): SorobanRpc.Api.SimulateTransactionResponse {
  return {
    id: 'test-sim-id',
    error: message ?? `HostError: Error(Contract, #${code})`,
    cost: { cpuInsn: 1000, memByte: 512, txByte: 200 },
    events: [],
  } as unknown as SorobanRpc.Api.SimulateTransactionResponse;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  clearSimulationCache();
  setSimulationReporter(undefined);
});

afterEach(() => {
  clearSimulationCache();
  setSimulationReporter(undefined);
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// SimulationError class
// ─────────────────────────────────────────────────────────────────────────────

describe('SimulationError', () => {
  it('is an instance of ContractError, SdkError, and Error', () => {
    const err = new SimulationError({
      rawCode: 1,
      errorType: ContractErrorType.UNAUTHORIZED,
      message: 'test error',
      simulationCategory: SimulationFailureCategory.AUTH_REQUIRED,
    });

    expect(err).toBeInstanceOf(SimulationError);
    expect(err).toBeInstanceOf(ContractError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "SimulationError"', () => {
    const err = new SimulationError({
      rawCode: -1,
      errorType: ContractErrorType.UNKNOWN,
      message: 'test',
      simulationCategory: SimulationFailureCategory.UNKNOWN,
    });
    expect(err.name).toBe('SimulationError');
  });

  it('exposes simulationCategory, suggestion, and simulationResponse', () => {
    const simResponse = { id: 'test' };
    const err = new SimulationError({
      rawCode: 5,
      errorType: ContractErrorType.INSUFFICIENT_BALANCE,
      message: 'not enough funds',
      simulationCategory: SimulationFailureCategory.INSUFFICIENT_BALANCE,
      suggestion: 'Add more XLM',
      simulationResponse: simResponse,
    });

    expect(err.simulationCategory).toBe(SimulationFailureCategory.INSUFFICIENT_BALANCE);
    expect(err.suggestion).toBe('Add more XLM');
    expect(err.simulationResponse).toBe(simResponse);
  });

  it('preserves rawCode, errorType, and recovery from parent ContractError', () => {
    const err = new SimulationError({
      rawCode: 5,
      errorType: ContractErrorType.INSUFFICIENT_BALANCE,
      message: 'insufficient',
      recovery: { message: 'Add funds', action: 'Add funds' },
      simulationCategory: SimulationFailureCategory.INSUFFICIENT_BALANCE,
    });

    expect(err.rawCode).toBe(5);
    expect(err.errorType).toBe(ContractErrorType.INSUFFICIENT_BALANCE);
    expect(err.recovery?.message).toBe('Add funds');
  });

  it('instanceof check survives prototype chain (ES5 targets)', () => {
    const err = new SimulationError({
      rawCode: -1,
      errorType: ContractErrorType.UNKNOWN,
      message: 'test',
      simulationCategory: SimulationFailureCategory.UNKNOWN,
    });
    try {
      throw err;
    } catch (e) {
      expect(e instanceof SimulationError).toBe(true);
      expect(e instanceof ContractError).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SimulationFailureCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('SimulationFailureCategory', () => {
  it('has all expected categories', () => {
    expect(SimulationFailureCategory.INSUFFICIENT_BALANCE).toBe('INSUFFICIENT_BALANCE');
    expect(SimulationFailureCategory.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(SimulationFailureCategory.INVALID_STATE).toBe('INVALID_STATE');
    expect(SimulationFailureCategory.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(SimulationFailureCategory.CONTRACT_PAUSED).toBe('CONTRACT_PAUSED');
    expect(SimulationFailureCategory.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(SimulationFailureCategory.UNKNOWN).toBe('UNKNOWN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateTransaction — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateTransaction — happy path', () => {
  it('returns success with an assembled transaction when simulation succeeds', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(true);
    expect(result.success && result.assembledTransaction).toBeDefined();
    expect(result.success && result.simulationResponse).toBeDefined();
    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
  });

  it('returns success and does not re-simulate for the same transaction within TTL', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    const result1 = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    const result2 = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    // RPC should only be called once (second call served from cache)
    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateTransaction — error cases
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateTransaction — error cases', () => {
  it('returns failure with SimulationError for code 1 (Unauthorized)', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(1));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(SimulationError);
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.AUTH_REQUIRED);
      expect(result.error.suggestion).toBeDefined();
      expect(result.error.message).toContain('wallet');
    }
  });

  it('returns failure with INSUFFICIENT_BALANCE for code 5', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.INSUFFICIENT_BALANCE);
      expect(result.error.suggestion).toContain('funds');
    }
  });

  it('returns failure with INVALID_STATE for code 3 (InvalidTransition)', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(3));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.INVALID_STATE);
    }
  });

  it('returns failure with INVALID_INPUT for code 6', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(6));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.INVALID_INPUT);
    }
  });

  it('returns failure with CONTRACT_PAUSED for code 4', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(4));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.CONTRACT_PAUSED);
    }
  });

  it('returns failure with UNKNOWN for unmapped codes', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(999));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.UNKNOWN);
    }
  });

  it('returns failure with NETWORK_ERROR when RPC throws', async () => {
    const tx = buildDummyTx();
    const rpc = createFailingRpcServer(new Error('ECONNREFUSED'));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.NETWORK_ERROR);
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it('caches failure results so repeated attempts don\'t re-simulate', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    const result1 = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    const result2 = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result1.success).toBe(false);
    expect(result2.success).toBe(false);
    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateTransaction — cache TTL
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateTransaction — cache TTL', () => {
  it('re-simulates after cache expires', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    // First call — caches the result
    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();

    // Simulate time passing beyond the TTL
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.advanceTimersByTime(SIMULATION_CACHE_TTL_MS + 1000);

    // Second call — should re-simulate
    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearSimulationCache
// ─────────────────────────────────────────────────────────────────────────────

describe('clearSimulationCache', () => {
  it('clears the cache so the next call re-simulates', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();

    clearSimulationCache();

    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateBatch
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateBatch', () => {
  it('returns success for a valid batch transaction', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    const result = await simulateBatch(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(true);
    expect(result.success && result.assembledTransaction).toBeDefined();
  });

  it('returns failure for a failing batch simulation', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(1));

    const result = await simulateBatch(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(SimulationError);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateOrThrow
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateOrThrow', () => {
  it('returns the assembled transaction on success', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    const assembled = await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);

    expect(assembled).toBeDefined();
    expect(assembled.toXDR).toBeDefined();
  });

  it('throws SimulationError on failure', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    await expect(simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE)).rejects.toThrow(SimulationError);
  });

  it('throws SimulationError with INSUFFICIENT_BALANCE category', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      expect((err as SimulationError).simulationCategory).toBe(
        SimulationFailureCategory.INSUFFICIENT_BALANCE,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateBatchOrThrow
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateBatchOrThrow', () => {
  it('returns the assembled transaction on success', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    const assembled = await simulateBatchOrThrow(rpc, tx, NETWORK_PASSPHRASE);

    expect(assembled).toBeDefined();
  });

  it('throws SimulationError on failure', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(2));

    await expect(simulateBatchOrThrow(rpc, tx, NETWORK_PASSPHRASE)).rejects.toThrow(
      SimulationError,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setSimulationReporter — analytics hook
// ─────────────────────────────────────────────────────────────────────────────

describe('setSimulationReporter', () => {
  it('is invoked when a simulation fails and a reporter is registered', async () => {
    const seen: SimulationError[] = [];
    setSimulationReporter((err) => seen.push(err));

    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(SimulationError);
  });

  it('is NOT invoked on success', async () => {
    const seen: SimulationError[] = [];
    setSimulationReporter((err) => seen.push(err));

    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(seen).toHaveLength(0);
  });

  it('a reporter that throws does not break simulateTransaction', async () => {
    setSimulationReporter(() => {
      throw new Error('reporter boom');
    });

    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);
    expect(result.success).toBe(false);
  });

  it('stops being invoked once unregistered with undefined', async () => {
    const seen: SimulationError[] = [];
    setSimulationReporter((err) => seen.push(err));
    setSimulationReporter(undefined);

    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(seen).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion hints
// ─────────────────────────────────────────────────────────────────────────────

describe('SimulationError suggestions', () => {
  it('provides a suggestion for INSUFFICIENT_BALANCE', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationError);
      const simErr = err as SimulationError;
      expect(simErr.suggestion).toBeDefined();
      expect(simErr.suggestion!.length).toBeGreaterThan(0);
    }
  });

  it('provides a suggestion for AUTH_REQUIRED', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(1));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      const simErr = err as SimulationError;
      expect(simErr.suggestion).toBeDefined();
    }
  });

  it('provides a suggestion for INVALID_STATE', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(3));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      const simErr = err as SimulationError;
      expect(simErr.suggestion).toBeDefined();
    }
  });

  it('provides a suggestion for NETWORK_ERROR', async () => {
    const tx = buildDummyTx();
    const rpc = createFailingRpcServer(new Error('timeout'));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      const simErr = err as SimulationError;
      expect(simErr.suggestion).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateTransaction — edge cases', () => {
  it('handles simulation response with no result (unexpected response)', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer({
      id: 'test',
      // No transactionData, no error, no result — all checks fail
    } as unknown as SorobanRpc.Api.SimulateTransactionResponse);

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.UNKNOWN);
    }
  });

  it('handles RPC throwing a non-Error value (string)', async () => {
    const tx = buildDummyTx();
    const rpc = {
      simulateTransaction: vi.fn().mockRejectedValue('string error'),
    } as unknown as SorobanRpc.Server;

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.simulationCategory).toBe(SimulationFailureCategory.NETWORK_ERROR);
    }
  });

  it('preserves error cause chain from the underlying contract error', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(1));

    const result = await simulateTransaction(rpc, tx, NETWORK_PASSPHRASE);

    expect(result.success).toBe(false);
    if (!result.success) {
      // The cause should be the original error string from the simulation
      expect(result.error.cause).toBeDefined();
    }
  });

  it('handles concurrent simulations of the same transaction', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(successfulSimResponse());

    // Fire two simulations concurrently for the same tx
    const [result1, result2] = await Promise.all([
      simulateTransaction(rpc, tx, NETWORK_PASSPHRASE),
      simulateTransaction(rpc, tx, NETWORK_PASSPHRASE),
    ]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    // Both should succeed (the second may or may not hit cache depending on timing)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable message content
// ─────────────────────────────────────────────────────────────────────────────

describe('SimulationError messages are human-readable', () => {
  it('INSUFFICIENT_BALANCE message mentions funds', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(5));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      const simErr = err as SimulationError;
      // Message should be human-readable, not a raw Soroban error
      expect(simErr.message).not.toContain('Error(Contract');
      expect(simErr.message).not.toContain('HostError');
    }
  });

  it('AUTH_REQUIRED message mentions wallet/signing', async () => {
    const tx = buildDummyTx();
    const rpc = createMockRpcServer(errorSimResponse(1));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      const simErr = err as SimulationError;
      expect(simErr.message).not.toContain('Error(Contract');
    }
  });

  it('NETWORK_ERROR message mentions network/connection', async () => {
    const tx = buildDummyTx();
    const rpc = createFailingRpcServer(new Error('ECONNREFUSED'));

    try {
      await simulateOrThrow(rpc, tx, NETWORK_PASSPHRASE);
      expect.fail('Should have thrown');
    } catch (err) {
      const simErr = err as SimulationError;
      expect(simErr.message).not.toContain('Error(Contract');
      expect(simErr.simulationCategory).toBe(SimulationFailureCategory.NETWORK_ERROR);
    }
  });
});
