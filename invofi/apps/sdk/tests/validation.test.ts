/**
 * Unit tests — SDK input validation
 *
 * Covers every rule in validation.ts and verifies that createInvofiClient
 * guards each method against invalid inputs before any RPC call is made.
 *
 * Strategy: all tests are pure in-process — no network calls, no Soroban RPC.
 * Each test imports the validation helpers directly and also exercises the
 * client-factory guards by asserting that SdkValidationError is thrown with
 * the correct `code` and `field` *before* any async work starts.
 */

import { describe, it, expect } from 'vitest';
import {
  validate,
  validateStellarAddress,
  SdkValidationError,
  ErrorCode,
  MIN_AMOUNT,
  MAX_INTEREST_RATE_BPS,
  MAX_DURATION_SECS,
} from '../src/validation';
import { createInvofiClient } from '../src/client';
import type { InvofiClientConfig } from '../src/config';
import { Networks } from '@stellar/stellar-sdk';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Valid Stellar G-address (56 chars, base32 A-Z/2-7).
 * Using a well-known Stellar Labs testnet account.
 */
const VALID_G_ADDRESS = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
/** A second valid G-address (from the invofi codebase). */
const VALID_G_ADDRESS_2 = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
/** A valid Stellar contract address (C…) — invofi testnet registry. */
const VALID_C_ADDRESS = 'CCV4OSLYRRMYTRMWH4GVWY2QGSFC5PV33KYQEMQF6DOQW3OXDAVBSHSY';
/** A valid position-token asset string. */
const VALID_ASSET = `POS:${VALID_G_ADDRESS}`;
/** Unix timestamp 1 year in the future. */
const FUTURE_TS = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
/** Unix timestamp in the past. */
const PAST_TS = Math.floor(Date.now() / 1000) - 1;

/** Minimal valid config for createInvofiClient. */
const VALID_CONFIG: InvofiClientConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET as typeof Networks.PUBLIC | typeof Networks.TESTNET,
  registryId: VALID_C_ADDRESS,
  financingId: VALID_C_ADDRESS,
  repaymentId: VALID_C_ADDRESS,
  signTransaction: async (xdr: string, _np: string) => xdr,
};

/** Helper: assert a sync call throws SdkValidationError with given code/field. */
function expectValidationError(fn: () => unknown, code: ErrorCode, field?: string) {
  let thrown: unknown;
  try { fn(); } catch (e) { thrown = e; }
  expect(thrown).toBeInstanceOf(SdkValidationError);
  const err = thrown as SdkValidationError;
  expect(err.code).toBe(code);
  if (field !== undefined) expect(err.field).toBe(field);
}

/**
 * Helper: assert an async SDK method throws/rejects with SdkValidationError
 * before any IO. Handles both sync throws (when validation fires before any
 * `await` in the method body) and proper async rejections.
 */
async function expectAsyncValidationError(fn: () => Promise<unknown>, code: ErrorCode, field?: string) {
  let promise: Promise<unknown>;
  try {
    // Validation in some methods fires synchronously before the first await
    promise = fn();
  } catch (e) {
    expect(e).toBeInstanceOf(SdkValidationError);
    const err = e as SdkValidationError;
    expect(err.code).toBe(code);
    if (field !== undefined) expect(err.field).toBe(field);
    return;
  }
  await promise.then(
    () => { throw new Error('Expected SdkValidationError but promise resolved without error'); },
    (e: unknown) => {
      expect(e).toBeInstanceOf(SdkValidationError);
      const err = e as SdkValidationError;
      expect(err.code).toBe(code);
      if (field !== undefined) expect(err.field).toBe(field);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// validate.stellarAddress
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.stellarAddress', () => {
  it('accepts a valid G-address', () => {
    expect(() => validate.stellarAddress(VALID_G_ADDRESS, 'addr')).not.toThrow();
  });

  it('accepts a valid C-address (contract)', () => {
    expect(() => validate.stellarAddress(VALID_C_ADDRESS, 'addr')).not.toThrow();
  });

  it('throws INVALID_ADDRESS on empty string', () => {
    expectValidationError(() => validate.stellarAddress('', 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
  });

  it('throws INVALID_ADDRESS on whitespace-only string', () => {
    expectValidationError(() => validate.stellarAddress('   ', 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
  });

  it('throws INVALID_ADDRESS on non-string input', () => {
    expectValidationError(() => validate.stellarAddress(null, 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
    expectValidationError(() => validate.stellarAddress(undefined, 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
    expectValidationError(() => validate.stellarAddress(123, 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
  });

  it('throws INVALID_ADDRESS on wrong length', () => {
    expectValidationError(
      () => validate.stellarAddress('GABC', 'addr'),
      ErrorCode.INVALID_ADDRESS, 'addr',
    );
  });

  it('throws INVALID_ADDRESS on wrong prefix (not G or C)', () => {
    // Build a 56-char string starting with S
    const bad = 'S' + 'A'.repeat(55);
    expectValidationError(() => validate.stellarAddress(bad, 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
  });

  it('throws INVALID_ADDRESS on lowercase characters', () => {
    const bad = VALID_G_ADDRESS.toLowerCase();
    expectValidationError(() => validate.stellarAddress(bad, 'addr'), ErrorCode.INVALID_ADDRESS, 'addr');
  });

  it('includes the field name in the thrown error', () => {
    let err: SdkValidationError | undefined;
    try { validateStellarAddress('bad', 'myField'); } catch (e) { err = e as SdkValidationError; }
    expect(err?.field).toBe('myField');
    expect(err?.message).toContain('myField');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.positiveI128
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.positiveI128', () => {
  it('accepts MIN_AMOUNT (1n)', () => {
    expect(() => validate.positiveI128(MIN_AMOUNT, 'amount')).not.toThrow();
  });

  it('accepts a large positive bigint', () => {
    expect(() => validate.positiveI128(100_000_000n, 'amount')).not.toThrow();
  });

  it('throws INVALID_AMOUNT for 0n', () => {
    expectValidationError(() => validate.positiveI128(0n, 'amount'), ErrorCode.INVALID_AMOUNT, 'amount');
  });

  it('throws INVALID_AMOUNT for negative bigint', () => {
    expectValidationError(() => validate.positiveI128(-1n, 'amount'), ErrorCode.INVALID_AMOUNT, 'amount');
  });

  it('throws INVALID_AMOUNT for number type', () => {
    expectValidationError(() => validate.positiveI128(100, 'amount'), ErrorCode.INVALID_AMOUNT, 'amount');
  });

  it('throws INVALID_AMOUNT for string type', () => {
    expectValidationError(() => validate.positiveI128('100', 'amount'), ErrorCode.INVALID_AMOUNT, 'amount');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.interestRate
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.interestRate', () => {
  it('accepts 1 (minimum)', () => {
    expect(() => validate.interestRate(1, 'rate')).not.toThrow();
  });

  it(`accepts ${MAX_INTEREST_RATE_BPS} (maximum)`, () => {
    expect(() => validate.interestRate(MAX_INTEREST_RATE_BPS, 'rate')).not.toThrow();
  });

  it('accepts 500 (5 %)', () => {
    expect(() => validate.interestRate(500, 'rate')).not.toThrow();
  });

  it('throws INVALID_RATE for 0', () => {
    expectValidationError(() => validate.interestRate(0, 'rate'), ErrorCode.INVALID_RATE, 'rate');
  });

  it('throws INVALID_RATE for negative', () => {
    expectValidationError(() => validate.interestRate(-1, 'rate'), ErrorCode.INVALID_RATE, 'rate');
  });

  it(`throws INVALID_RATE for ${MAX_INTEREST_RATE_BPS + 1}`, () => {
    expectValidationError(() => validate.interestRate(MAX_INTEREST_RATE_BPS + 1, 'rate'), ErrorCode.INVALID_RATE, 'rate');
  });

  it('throws INVALID_RATE for non-integer (float)', () => {
    expectValidationError(() => validate.interestRate(1.5, 'rate'), ErrorCode.INVALID_RATE, 'rate');
  });

  it('throws INVALID_RATE for string', () => {
    expectValidationError(() => validate.interestRate('500' as unknown as number, 'rate'), ErrorCode.INVALID_RATE, 'rate');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.duration
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.duration', () => {
  it('accepts 1 second', () => {
    expect(() => validate.duration(1, 'duration')).not.toThrow();
  });

  it(`accepts MAX_DURATION_SECS (${MAX_DURATION_SECS})`, () => {
    expect(() => validate.duration(MAX_DURATION_SECS, 'duration')).not.toThrow();
  });

  it('throws INVALID_DURATION for 0', () => {
    expectValidationError(() => validate.duration(0, 'duration'), ErrorCode.INVALID_DURATION, 'duration');
  });

  it('throws INVALID_DURATION for negative', () => {
    expectValidationError(() => validate.duration(-3600, 'duration'), ErrorCode.INVALID_DURATION, 'duration');
  });

  it(`throws INVALID_DURATION for ${MAX_DURATION_SECS + 1}`, () => {
    expectValidationError(
      () => validate.duration(MAX_DURATION_SECS + 1, 'duration'),
      ErrorCode.INVALID_DURATION, 'duration',
    );
  });

  it('throws INVALID_DURATION for float', () => {
    expectValidationError(() => validate.duration(86400.5, 'duration'), ErrorCode.INVALID_DURATION, 'duration');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.futureTimestamp
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.futureTimestamp', () => {
  it('accepts a timestamp 1 year in the future', () => {
    expect(() => validate.futureTimestamp(FUTURE_TS, 'dueDate')).not.toThrow();
  });

  it('throws INVALID_DUE_DATE for a past timestamp', () => {
    expectValidationError(() => validate.futureTimestamp(PAST_TS, 'dueDate'), ErrorCode.INVALID_DUE_DATE, 'dueDate');
  });

  it('throws INVALID_DUE_DATE for current time (exactly now)', () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    expectValidationError(() => validate.futureTimestamp(nowSecs, 'dueDate'), ErrorCode.INVALID_DUE_DATE, 'dueDate');
  });

  it('throws INVALID_DUE_DATE for 0 (epoch)', () => {
    expectValidationError(() => validate.futureTimestamp(0, 'dueDate'), ErrorCode.INVALID_DUE_DATE, 'dueDate');
  });

  it('throws INVALID_DUE_DATE for float', () => {
    expectValidationError(() => validate.futureTimestamp(FUTURE_TS + 0.5, 'dueDate'), ErrorCode.INVALID_DUE_DATE, 'dueDate');
  });

  it('throws INVALID_DUE_DATE for string', () => {
    expectValidationError(
      () => validate.futureTimestamp('2030-01-01' as unknown as number, 'dueDate'),
      ErrorCode.INVALID_DUE_DATE, 'dueDate',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.symbolId
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.symbolId', () => {
  it('accepts alphanumeric IDs', () => {
    expect(() => validate.symbolId('inv001', 'id')).not.toThrow();
    expect(() => validate.symbolId('OFF_2024_001', 'id')).not.toThrow();
  });

  it('accepts IDs with underscores', () => {
    expect(() => validate.symbolId('invoice_001', 'id')).not.toThrow();
  });

  it('accepts single-character ID', () => {
    expect(() => validate.symbolId('A', 'id')).not.toThrow();
  });

  it('accepts exactly 32 characters', () => {
    expect(() => validate.symbolId('A'.repeat(32), 'id')).not.toThrow();
  });

  it('throws INVALID_ID for empty string', () => {
    expectValidationError(() => validate.symbolId('', 'id'), ErrorCode.INVALID_ID, 'id');
  });

  it('throws INVALID_ID for 33+ characters', () => {
    expectValidationError(() => validate.symbolId('A'.repeat(33), 'id'), ErrorCode.INVALID_ID, 'id');
  });

  it('throws INVALID_ID for IDs with spaces', () => {
    expectValidationError(() => validate.symbolId('inv 001', 'id'), ErrorCode.INVALID_ID, 'id');
  });

  it('throws INVALID_ID for IDs with hyphens', () => {
    expectValidationError(() => validate.symbolId('inv-001', 'id'), ErrorCode.INVALID_ID, 'id');
  });

  it('throws INVALID_ID for IDs with special characters', () => {
    expectValidationError(() => validate.symbolId('inv#001', 'id'), ErrorCode.INVALID_ID, 'id');
  });

  it('throws INVALID_ID for non-string', () => {
    expectValidationError(() => validate.symbolId(null, 'id'), ErrorCode.INVALID_ID, 'id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.currency
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.currency', () => {
  it('accepts XLM', () => {
    expect(() => validate.currency('XLM', 'currency')).not.toThrow();
  });

  it('accepts USDC', () => {
    expect(() => validate.currency('USDC', 'currency')).not.toThrow();
  });

  it('throws INVALID_CURRENCY for lowercase', () => {
    expectValidationError(() => validate.currency('xlm', 'currency'), ErrorCode.INVALID_CURRENCY, 'currency');
  });

  it('throws INVALID_CURRENCY for unknown token', () => {
    expectValidationError(() => validate.currency('BTC', 'currency'), ErrorCode.INVALID_CURRENCY, 'currency');
  });

  it('throws INVALID_CURRENCY for empty string', () => {
    expectValidationError(() => validate.currency('', 'currency'), ErrorCode.INVALID_CURRENCY, 'currency');
  });

  it('throws INVALID_CURRENCY for non-string', () => {
    expectValidationError(() => validate.currency(null, 'currency'), ErrorCode.INVALID_CURRENCY, 'currency');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.assetString
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.assetString', () => {
  it('accepts a valid CODE:ISSUER string', () => {
    expect(() => validate.assetString(VALID_ASSET, 'asset')).not.toThrow();
  });

  it('throws INVALID_ASSET for empty string', () => {
    expectValidationError(() => validate.assetString('', 'asset'), ErrorCode.INVALID_ASSET, 'asset');
  });

  it('throws INVALID_ASSET for missing issuer', () => {
    expectValidationError(() => validate.assetString('POS', 'asset'), ErrorCode.INVALID_ASSET, 'asset');
  });

  it('throws INVALID_ASSET for malformed issuer', () => {
    expectValidationError(() => validate.assetString('POS:badissuer', 'asset'), ErrorCode.INVALID_ASSET, 'asset');
  });

  it('throws INVALID_ASSET for non-string', () => {
    expectValidationError(() => validate.assetString(42, 'asset'), ErrorCode.INVALID_ASSET, 'asset');
  });

  it('throws INVALID_ASSET when code is empty', () => {
    expectValidationError(() => validate.assetString(`:${VALID_G_ADDRESS}`, 'asset'), ErrorCode.INVALID_ASSET, 'asset');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate.configField
// ─────────────────────────────────────────────────────────────────────────────

describe('validate.configField', () => {
  it('accepts a non-empty string', () => {
    expect(() => validate.configField('https://rpc.example.com', 'cfg.rpcUrl')).not.toThrow();
  });

  it('throws MISSING_CONFIG for empty string', () => {
    expectValidationError(() => validate.configField('', 'cfg.rpcUrl'), ErrorCode.MISSING_CONFIG, 'cfg.rpcUrl');
  });

  it('throws MISSING_CONFIG for whitespace-only string', () => {
    expectValidationError(() => validate.configField('  ', 'cfg.rpcUrl'), ErrorCode.MISSING_CONFIG, 'cfg.rpcUrl');
  });

  it('throws MISSING_CONFIG for undefined', () => {
    expectValidationError(() => validate.configField(undefined, 'cfg.rpcUrl'), ErrorCode.MISSING_CONFIG, 'cfg.rpcUrl');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SdkValidationError class
// ─────────────────────────────────────────────────────────────────────────────

describe('SdkValidationError', () => {
  it('is an instance of Error', () => {
    const err = new SdkValidationError(ErrorCode.INVALID_ADDRESS, 'addr', 'bad address');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SdkValidationError);
  });

  it('has name "SdkValidationError"', () => {
    const err = new SdkValidationError(ErrorCode.INVALID_AMOUNT, 'amount', 'bad amount');
    expect(err.name).toBe('SdkValidationError');
  });

  it('exposes code and field properties', () => {
    const err = new SdkValidationError(ErrorCode.INVALID_RATE, 'interestRate', 'bad rate');
    expect(err.code).toBe(ErrorCode.INVALID_RATE);
    expect(err.field).toBe('interestRate');
    expect(err.message).toBe('bad rate');
  });

  it('instanceof check survives prototype chain (ES5 targets)', () => {
    // Re-create via factory to simulate compiled output
    try {
      validateStellarAddress('', 'x');
    } catch (e) {
      expect(e instanceof SdkValidationError).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createInvofiClient — config-level validation (sync, at construction time)
// ─────────────────────────────────────────────────────────────────────────────

describe('createInvofiClient — config validation', () => {
  it('constructs successfully with a valid config', () => {
    expect(() => createInvofiClient(VALID_CONFIG)).not.toThrow();
  });

  it('throws MISSING_CONFIG when rpcUrl is empty', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, rpcUrl: '' }),
      ErrorCode.MISSING_CONFIG, 'cfg.rpcUrl',
    );
  });

  it('throws MISSING_CONFIG when horizonUrl is empty', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, horizonUrl: '' }),
      ErrorCode.MISSING_CONFIG, 'cfg.horizonUrl',
    );
  });

  it('throws MISSING_CONFIG when registryId is empty', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, registryId: '' }),
      ErrorCode.MISSING_CONFIG, 'cfg.registryId',
    );
  });

  it('throws MISSING_CONFIG when financingId is empty', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, financingId: '' }),
      ErrorCode.MISSING_CONFIG, 'cfg.financingId',
    );
  });

  it('throws MISSING_CONFIG when repaymentId is empty', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, repaymentId: '' }),
      ErrorCode.MISSING_CONFIG, 'cfg.repaymentId',
    );
  });

  it('throws MISSING_CONFIG when signTransaction is not a function', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, signTransaction: null as unknown as () => Promise<string> }),
      ErrorCode.MISSING_CONFIG, 'cfg.signTransaction',
    );
  });

  it('throws INVALID_ASSET when positionTokenAsset is malformed', () => {
    expectValidationError(
      () => createInvofiClient({ ...VALID_CONFIG, positionTokenAsset: 'BAD_NO_ISSUER' }),
      ErrorCode.INVALID_ASSET, 'cfg.positionTokenAsset',
    );
  });

  it('accepts a valid positionTokenAsset', () => {
    expect(() => createInvofiClient({ ...VALID_CONFIG, positionTokenAsset: VALID_ASSET })).not.toThrow();
  });

  it('accepts config without positionTokenAsset', () => {
    // VALID_CONFIG has no positionTokenAsset — it's already a valid minimal config
    expect(() => createInvofiClient(VALID_CONFIG)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerInvoice — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('registerInvoice — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS for empty originator', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: 'inv001', amount: 1000n, currency: 'XLM', dueDate: FUTURE_TS }, ''),
      ErrorCode.INVALID_ADDRESS, 'originatorAddress',
    );
  });

  it('throws INVALID_ADDRESS for malformed originator', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: 'inv001', amount: 1000n, currency: 'XLM', dueDate: FUTURE_TS }, 'not-an-address'),
      ErrorCode.INVALID_ADDRESS, 'originatorAddress',
    );
  });

  it('throws INVALID_ID for empty invoice ID', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: '', amount: 1000n, currency: 'XLM', dueDate: FUTURE_TS }, VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'params.id',
    );
  });

  it('throws INVALID_AMOUNT for zero amount', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: 'inv001', amount: 0n, currency: 'XLM', dueDate: FUTURE_TS }, VALID_G_ADDRESS),
      ErrorCode.INVALID_AMOUNT, 'params.amount',
    );
  });

  it('throws INVALID_AMOUNT for negative amount', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: 'inv001', amount: -1n, currency: 'XLM', dueDate: FUTURE_TS }, VALID_G_ADDRESS),
      ErrorCode.INVALID_AMOUNT, 'params.amount',
    );
  });

  it('throws INVALID_CURRENCY for unknown currency', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: 'inv001', amount: 1000n, currency: 'BTC' as 'XLM', dueDate: FUTURE_TS }, VALID_G_ADDRESS),
      ErrorCode.INVALID_CURRENCY, 'params.currency',
    );
  });

  it('throws INVALID_DUE_DATE for past due date', async () => {
    await expectAsyncValidationError(
      () => client.registerInvoice({ id: 'inv001', amount: 1000n, currency: 'XLM', dueDate: PAST_TS }, VALID_G_ADDRESS),
      ErrorCode.INVALID_DUE_DATE, 'params.dueDate',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getInvoice — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('getInvoice — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty id', async () => {
    await expectAsyncValidationError(
      () => client.getInvoice(''),
      ErrorCode.INVALID_ID, 'id',
    );
  });

  it('throws INVALID_ADDRESS for malformed sourceAccount', async () => {
    await expectAsyncValidationError(
      () => client.getInvoice('inv001', 'bad-address'),
      ErrorCode.INVALID_ADDRESS, 'sourceAccount',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancelInvoice — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelInvoice — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty invoice ID', async () => {
    await expectAsyncValidationError(
      () => client.cancelInvoice('', VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'invoiceId',
    );
  });

  it('throws INVALID_ADDRESS for malformed originator', async () => {
    await expectAsyncValidationError(
      () => client.cancelInvoice('inv001', 'bad'),
      ErrorCode.INVALID_ADDRESS, 'originatorAddress',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createOffer — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('createOffer — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);
  const validParams = {
    offerId: 'off001',
    invoiceId: 'inv001',
    amount: 5000n,
    currency: 'USDC' as const,
    interestRate: 500,
    duration: 86400,
  };

  it('throws INVALID_ADDRESS for empty lender', async () => {
    await expectAsyncValidationError(
      () => client.createOffer(validParams, ''),
      ErrorCode.INVALID_ADDRESS, 'lenderAddress',
    );
  });

  it('throws INVALID_ID for empty offerId', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, offerId: '' }, VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'params.offerId',
    );
  });

  it('throws INVALID_ID for empty invoiceId', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, invoiceId: '' }, VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'params.invoiceId',
    );
  });

  it('throws INVALID_AMOUNT for zero amount', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, amount: 0n }, VALID_G_ADDRESS),
      ErrorCode.INVALID_AMOUNT, 'params.amount',
    );
  });

  it('throws INVALID_CURRENCY for unknown currency', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, currency: 'ETH' as 'USDC' }, VALID_G_ADDRESS),
      ErrorCode.INVALID_CURRENCY, 'params.currency',
    );
  });

  it('throws INVALID_RATE for zero interest rate', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, interestRate: 0 }, VALID_G_ADDRESS),
      ErrorCode.INVALID_RATE, 'params.interestRate',
    );
  });

  it('throws INVALID_RATE for rate > 10 000 bps', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, interestRate: 10_001 }, VALID_G_ADDRESS),
      ErrorCode.INVALID_RATE, 'params.interestRate',
    );
  });

  it('throws INVALID_DURATION for zero duration', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, duration: 0 }, VALID_G_ADDRESS),
      ErrorCode.INVALID_DURATION, 'params.duration',
    );
  });

  it('throws INVALID_DURATION for duration > MAX_DURATION_SECS', async () => {
    await expectAsyncValidationError(
      () => client.createOffer({ ...validParams, duration: MAX_DURATION_SECS + 1 }, VALID_G_ADDRESS),
      ErrorCode.INVALID_DURATION, 'params.duration',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// acceptOffer — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('acceptOffer — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty offerId', async () => {
    await expectAsyncValidationError(
      () => client.acceptOffer('', VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'offerId',
    );
  });

  it('throws INVALID_ADDRESS for malformed originator', async () => {
    await expectAsyncValidationError(
      () => client.acceptOffer('off001', 'not-valid'),
      ErrorCode.INVALID_ADDRESS, 'originatorAddress',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rejectOffer — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('rejectOffer — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty offerId', async () => {
    await expectAsyncValidationError(
      () => client.rejectOffer('', VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'offerId',
    );
  });

  it('throws INVALID_ADDRESS for malformed originator', async () => {
    await expectAsyncValidationError(
      () => client.rejectOffer('off001', 'bad'),
      ErrorCode.INVALID_ADDRESS, 'originatorAddress',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOffer — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('getOffer — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty id', async () => {
    await expectAsyncValidationError(
      () => client.getOffer(''),
      ErrorCode.INVALID_ID, 'id',
    );
  });

  it('throws INVALID_ADDRESS for malformed sourceAccount', async () => {
    await expectAsyncValidationError(
      () => client.getOffer('off001', 'bad-address'),
      ErrorCode.INVALID_ADDRESS, 'sourceAccount',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// repayInvoice — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('repayInvoice — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty invoiceId', async () => {
    await expectAsyncValidationError(
      () => client.repayInvoice('', 'off001', VALID_G_ADDRESS, 1000n),
      ErrorCode.INVALID_ID, 'invoiceId',
    );
  });

  it('throws INVALID_ID for empty offerId', async () => {
    await expectAsyncValidationError(
      () => client.repayInvoice('inv001', '', VALID_G_ADDRESS, 1000n),
      ErrorCode.INVALID_ID, 'offerId',
    );
  });

  it('throws INVALID_ADDRESS for malformed repayer', async () => {
    await expectAsyncValidationError(
      () => client.repayInvoice('inv001', 'off001', 'not-valid', 1000n),
      ErrorCode.INVALID_ADDRESS, 'repayerAddress',
    );
  });

  it('throws INVALID_AMOUNT for zero repayment', async () => {
    await expectAsyncValidationError(
      () => client.repayInvoice('inv001', 'off001', VALID_G_ADDRESS, 0n),
      ErrorCode.INVALID_AMOUNT, 'amount',
    );
  });

  it('throws INVALID_AMOUNT for negative repayment', async () => {
    await expectAsyncValidationError(
      () => client.repayInvoice('inv001', 'off001', VALID_G_ADDRESS, -100n),
      ErrorCode.INVALID_AMOUNT, 'amount',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markOverdue — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('markOverdue — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty invoiceId', async () => {
    await expectAsyncValidationError(
      () => client.markOverdue('', VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'invoiceId',
    );
  });

  it('throws INVALID_ADDRESS for malformed caller', async () => {
    await expectAsyncValidationError(
      () => client.markOverdue('inv001', 'bad'),
      ErrorCode.INVALID_ADDRESS, 'callerAddress',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reclaimInvoice — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('reclaimInvoice — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ID for empty invoiceId', async () => {
    await expectAsyncValidationError(
      () => client.reclaimInvoice('', 'off001', VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'invoiceId',
    );
  });

  it('throws INVALID_ID for empty offerId', async () => {
    await expectAsyncValidationError(
      () => client.reclaimInvoice('inv001', '', VALID_G_ADDRESS),
      ErrorCode.INVALID_ID, 'offerId',
    );
  });

  it('throws INVALID_ADDRESS for malformed lender', async () => {
    await expectAsyncValidationError(
      () => client.reclaimInvoice('inv001', 'off001', 'bad'),
      ErrorCode.INVALID_ADDRESS, 'lenderAddress',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transferPositionToken — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('transferPositionToken — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS for bad tokenId', async () => {
    await expectAsyncValidationError(
      () => client.transferPositionToken('not-a-contract', VALID_G_ADDRESS, VALID_G_ADDRESS, 100n),
      ErrorCode.INVALID_ADDRESS, 'tokenId',
    );
  });

  it('throws INVALID_ADDRESS for bad fromAddress', async () => {
    await expectAsyncValidationError(
      () => client.transferPositionToken(VALID_C_ADDRESS, 'bad', VALID_G_ADDRESS, 100n),
      ErrorCode.INVALID_ADDRESS, 'fromAddress',
    );
  });

  it('throws INVALID_ADDRESS for bad toAddress', async () => {
    await expectAsyncValidationError(
      () => client.transferPositionToken(VALID_C_ADDRESS, VALID_G_ADDRESS, 'bad', 100n),
      ErrorCode.INVALID_ADDRESS, 'toAddress',
    );
  });

  it('throws INVALID_AMOUNT for zero amount', async () => {
    await expectAsyncValidationError(
      () => client.transferPositionToken(VALID_C_ADDRESS, VALID_G_ADDRESS, VALID_G_ADDRESS, 0n),
      ErrorCode.INVALID_AMOUNT, 'amount',
    );
  });

  it('throws INVALID_AMOUNT for negative amount', async () => {
    await expectAsyncValidationError(
      () => client.transferPositionToken(VALID_C_ADDRESS, VALID_G_ADDRESS, VALID_G_ADDRESS, -1n),
      ErrorCode.INVALID_AMOUNT, 'amount',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTokenBalance — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('getTokenBalance — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS for bad tokenId', async () => {
    await expectAsyncValidationError(
      () => client.getTokenBalance('bad', VALID_G_ADDRESS),
      ErrorCode.INVALID_ADDRESS, 'tokenId',
    );
  });

  it('throws INVALID_ADDRESS for bad holder address', async () => {
    await expectAsyncValidationError(
      () => client.getTokenBalance(VALID_C_ADDRESS, 'bad'),
      ErrorCode.INVALID_ADDRESS, 'address',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTokenDecimals — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('getTokenDecimals — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS for bad tokenId', async () => {
    await expectAsyncValidationError(
      () => client.getTokenDecimals('bad-token'),
      ErrorCode.INVALID_ADDRESS, 'tokenId',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasPositionTrustline — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('hasPositionTrustline — input validation', () => {
  const clientWithAsset = createInvofiClient({ ...VALID_CONFIG, positionTokenAsset: VALID_ASSET });
  const clientNoAsset   = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS for bad address', async () => {
    await expectAsyncValidationError(
      () => clientWithAsset.hasPositionTrustline('bad'),
      ErrorCode.INVALID_ADDRESS, 'address',
    );
  });

  it('throws MISSING_CONFIG when positionTokenAsset not set', async () => {
    await expectAsyncValidationError(
      () => clientNoAsset.hasPositionTrustline(VALID_G_ADDRESS),
      ErrorCode.MISSING_CONFIG, 'cfg.positionTokenAsset',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addPositionTrustline — method-level validation
// ─────────────────────────────────────────────────────────────────────────────

describe('addPositionTrustline — input validation', () => {
  const clientWithAsset = createInvofiClient({ ...VALID_CONFIG, positionTokenAsset: VALID_ASSET });
  const clientNoAsset   = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS for bad address', async () => {
    await expectAsyncValidationError(
      () => clientWithAsset.addPositionTrustline('bad'),
      ErrorCode.INVALID_ADDRESS, 'address',
    );
  });

  it('throws MISSING_CONFIG when positionTokenAsset not set', async () => {
    await expectAsyncValidationError(
      () => clientNoAsset.addPositionTrustline(VALID_G_ADDRESS),
      ErrorCode.MISSING_CONFIG, 'cfg.positionTokenAsset',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPositionTokenId — optional sourceAccount validation
// ─────────────────────────────────────────────────────────────────────────────

describe('getPositionTokenId — input validation', () => {
  const client = createInvofiClient(VALID_CONFIG);

  it('throws INVALID_ADDRESS when bad sourceAccount is supplied', async () => {
    await expectAsyncValidationError(
      () => client.getPositionTokenId('not-an-address'),
      ErrorCode.INVALID_ADDRESS, 'sourceAccount',
    );
  });

  // No sourceAccount → falls back to fixed read account; validation passes
  // (we cannot test the RPC call here without mocking the server)
});
