// ── Typed contract call builder (#215) ───────────────────────────────────────
// `buildTypedContract` turns an ABI (`src/types/contract-abi.ts`) plus an
// implementation map into an object of typed methods:
// `client.contracts.financing.acceptOffer({ offer_id, originator })`.
//
// It does not talk to Soroban directly — each `impl[key]` delegates to the
// already-validated, already-tested flat methods on `InvofiClientMethods`
// (`register_invoice` → `registerInvoice`, etc.), so signing/simulation/
// submission logic lives in exactly one place (client.ts). What this layer
// adds is:
//   1. Compile-time checking of function names and parameter shapes, derived
//      from the ABI (wrong name or wrong param type is a TS error).
//   2. A generic runtime check that the caller actually passed the shape the
//      ABI declares — every required param present, every value the right
//      JS type for its declared Soroban scalar — independent of (and before)
//      whatever field-specific validation (range checks, address format,
//      etc.) the underlying flat method performs.

import type { AbiFunctionDef, AbiScalarType, InferParams } from '../types/contract-abi';
import { SdkValidationError, ErrorCode, VALID_CURRENCIES } from '../validation';

export type TypedContract<Abi extends Record<string, AbiFunctionDef>, Returns extends { [K in keyof Abi]: unknown }> = {
  [K in keyof Abi]: (params: InferParams<Abi[K]>) => Promise<Returns[K]>;
};

/** The adapter map a per-contract module supplies: one implementation per ABI key. */
export type TypedContractImpl<Abi extends Record<string, AbiFunctionDef>, Returns extends { [K in keyof Abi]: unknown }> = {
  [K in keyof Abi]: (params: InferParams<Abi[K]>) => Promise<Returns[K]>;
};

/** Checks a single value against its declared ABI scalar type. Throws `SdkValidationError` on mismatch. */
function checkAbiValue(type: AbiScalarType, value: unknown, field: string): void {
  switch (type) {
    case 'address':
    case 'symbol':
      if (typeof value !== 'string' || value.trim() === '') {
        throw new SdkValidationError(ErrorCode.INVALID_TYPE, field, `${field}: expected a non-empty string (${type}), got ${typeof value}`);
      }
      return;
    case 'currency':
      if (typeof value !== 'string' || !VALID_CURRENCIES.has(value as 'XLM' | 'USDC')) {
        throw new SdkValidationError(
          ErrorCode.INVALID_TYPE,
          field,
          `${field}: expected one of ${[...VALID_CURRENCIES].join(' | ')} (currency), got ${JSON.stringify(value)}`,
        );
      }
      return;
    case 'i128':
      if (typeof value !== 'bigint') {
        throw new SdkValidationError(ErrorCode.INVALID_TYPE, field, `${field}: expected a bigint (i128), got ${typeof value}`);
      }
      return;
    case 'u32':
    case 'u64':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new SdkValidationError(ErrorCode.INVALID_TYPE, field, `${field}: expected a non-negative integer (${type}), got ${JSON.stringify(value)}`);
      }
      return;
    case 'bool':
      if (typeof value !== 'boolean') {
        throw new SdkValidationError(ErrorCode.INVALID_TYPE, field, `${field}: expected a boolean, got ${typeof value}`);
      }
      return;
  }
}

/**
 * Validates a call's `params` object against an ABI function's declared
 * shape: every non-optional param present, every value the right JS type
 * for its Soroban scalar type. This runs before the call reaches the
 * underlying SDK method (and its own field-specific validation).
 *
 * @throws {SdkValidationError} on a missing required param or a type mismatch.
 */
export function validateAbiParams(def: AbiFunctionDef, params: Record<string, unknown>, functionName: string): void {
  for (const [key, paramDef] of Object.entries(def.params)) {
    const value = params[key];
    if (value === undefined) {
      if (paramDef.optional) continue;
      throw new SdkValidationError(
        ErrorCode.MISSING_FIELD,
        `${functionName}.${key}`,
        `${functionName}(...): missing required parameter "${key}" (expected ${paramDef.type})`,
      );
    }
    checkAbiValue(paramDef.type, value, `${functionName}.${key}`);
  }
}

/**
 * Builds a typed, namespaced contract client from an ABI and an
 * implementation map. Each generated method validates its params against
 * the ABI, then delegates to `impl[key]`.
 */
export function buildTypedContract<Abi extends Record<string, AbiFunctionDef>, Returns extends { [K in keyof Abi]: unknown }>(
  abi: Abi,
  impl: TypedContractImpl<Abi, Returns>,
): TypedContract<Abi, Returns> {
  const contract = {} as TypedContract<Abi, Returns>;
  for (const key of Object.keys(abi) as (keyof Abi & string)[]) {
    const def = abi[key];
    const fn = impl[key];
    contract[key] = (async (params: Record<string, unknown>) => {
      validateAbiParams(def, params ?? {}, key);
      return fn(params as InferParams<Abi[typeof key]>);
    }) as TypedContract<Abi, Returns>[typeof key];
  }
  return contract;
}
