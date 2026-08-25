// ── Contract ABI — compile-time + runtime contract for the typed call builder ──
// (#215) Hand-authored from invofi-contracts' public function signatures
// (registry, financing, repayment, and the SEP-41 position token). This file
// is the single source of truth the typed builder (`src/contracts/`) reads
// to generate `client.contracts.<name>.<method>(params)` with compile-time
// parameter checking and IDE autocomplete.
//
// Regenerating after a contract build:
//   1. In invofi-contracts, run `stellar contract build`, then inspect the
//      built wasm's interface (`stellar contract inspect --wasm
//      target/wasm32-unknown-unknown/release/<contract>.wasm --output json`,
//      or equivalent for your CLI version) to list each function's name,
//      parameter names/types, and return type.
//   2. Update the matching `*_ABI` object below: one entry per function, with
//      the on-chain `method` name and a `params` record mapping each
//      parameter name to its scalar type (see `AbiScalarType`). Mark a
//      parameter `optional: true` only if the SDK method itself treats it as
//      optional (e.g. an omittable read-source account) — the ABI does not
//      encode Soroban-side default values.
//   3. If a function's return type is a struct (not a plain scalar), update
//      the matching `*Returns` interface below to the TS type it decodes to
//      (add the struct to `../types.ts` first if new).
//   4. Update the adapter in the matching `src/contracts/*.ts` file so it
//      still passes the right fields through to the underlying
//      `InvofiClientMethods` call, then run `npm run type-check` — a stale
//      ABI/adapter mismatch fails to compile.

import type { Currency, FinancingOffer, Invoice } from '../types';

/**
 * Scalar Soroban types the typed builder knows how to carry through TS.
 * `currency` is `symbol` on-chain but gets its own entry here so params
 * typed with it narrow to `Currency` ('XLM' | 'USDC') instead of `string`.
 */
export type AbiScalarType = 'address' | 'symbol' | 'currency' | 'i128' | 'u32' | 'u64' | 'bool';

/** Maps an ABI scalar type to the TS type a caller supplies/receives for it. */
export type AbiNativeType<T extends AbiScalarType> = T extends 'address' | 'symbol'
  ? string
  : T extends 'currency'
    ? Currency
    : T extends 'i128'
      ? bigint
      : T extends 'u32' | 'u64'
        ? number
        : T extends 'bool'
          ? boolean
          : never;

export interface AbiParamDef<T extends AbiScalarType = AbiScalarType> {
  readonly type: T;
  /** Set for parameters the SDK method itself treats as optional (e.g. an omittable read-source account). */
  readonly optional?: boolean;
}

export interface AbiFunctionDef {
  /** The exact on-chain method name passed to `contract.call(method, ...)`. */
  readonly method: string;
  readonly params: Record<string, AbiParamDef>;
}

type OptionalParamKeys<P extends Record<string, AbiParamDef>> = {
  [K in keyof P]: P[K]['optional'] extends true ? K : never;
}[keyof P];
type RequiredParamKeys<P extends Record<string, AbiParamDef>> = Exclude<keyof P, OptionalParamKeys<P>>;

/** Derives the typed `params` object a builder method accepts, from an ABI function's param map. */
export type InferParams<Def extends AbiFunctionDef> = { [K in RequiredParamKeys<Def['params']>]: AbiNativeType<Def['params'][K]['type']> } & {
  [K in OptionalParamKeys<Def['params']>]?: AbiNativeType<Def['params'][K]['type']>;
};

// ── Registry contract ────────────────────────────────────────────────────────

export const REGISTRY_ABI = {
  registerInvoice: {
    method: 'register_invoice',
    params: {
      id: { type: 'symbol' },
      originator: { type: 'address' },
      amount: { type: 'i128' },
      currency: { type: 'currency' },
      due_date: { type: 'u64' },
    },
  },
  getInvoice: {
    method: 'get_invoice',
    params: {
      id: { type: 'symbol' },
      source_account: { type: 'address', optional: true },
    },
  },
  cancelInvoice: {
    method: 'cancel_invoice',
    params: {
      id: { type: 'symbol' },
      originator: { type: 'address' },
    },
  },
} as const satisfies Record<string, AbiFunctionDef>;

export interface RegistryReturns {
  registerInvoice: Invoice;
  getInvoice: Invoice;
  cancelInvoice: Invoice;
}

// ── Financing contract ───────────────────────────────────────────────────────

export const FINANCING_ABI = {
  createOffer: {
    method: 'create_offer',
    params: {
      offer_id: { type: 'symbol' },
      invoice_id: { type: 'symbol' },
      lender: { type: 'address' },
      amount: { type: 'i128' },
      currency: { type: 'currency' },
      interest_rate: { type: 'u32' },
      duration: { type: 'u64' },
    },
  },
  getOffer: {
    method: 'get_offer',
    params: {
      id: { type: 'symbol' },
      source_account: { type: 'address', optional: true },
    },
  },
  acceptOffer: {
    method: 'accept_offer',
    params: {
      offer_id: { type: 'symbol' },
      originator: { type: 'address' },
    },
  },
  rejectOffer: {
    method: 'reject_offer',
    params: {
      offer_id: { type: 'symbol' },
      originator: { type: 'address' },
    },
  },
  getPositionTokenId: {
    method: 'get_position_token',
    params: {
      source_account: { type: 'address', optional: true },
    },
  },
} as const satisfies Record<string, AbiFunctionDef>;

export interface FinancingReturns {
  createOffer: FinancingOffer;
  getOffer: FinancingOffer;
  acceptOffer: FinancingOffer;
  rejectOffer: FinancingOffer;
  getPositionTokenId: string | null;
}

// ── Repayment contract ───────────────────────────────────────────────────────

export const REPAYMENT_ABI = {
  repayInvoice: {
    method: 'repay_invoice',
    params: {
      invoice_id: { type: 'symbol' },
      offer_id: { type: 'symbol' },
      repayer: { type: 'address' },
      amount: { type: 'i128' },
    },
  },
  markOverdue: {
    method: 'mark_overdue',
    params: {
      invoice_id: { type: 'symbol' },
      caller: { type: 'address' },
    },
  },
  reclaimInvoice: {
    method: 'reclaim_invoice',
    params: {
      invoice_id: { type: 'symbol' },
      offer_id: { type: 'symbol' },
      lender: { type: 'address' },
    },
  },
} as const satisfies Record<string, AbiFunctionDef>;

export interface RepaymentReturns {
  repayInvoice: Invoice;
  markOverdue: Invoice;
  reclaimInvoice: FinancingOffer;
}

// ── Position token (SEP-41) ─────────────────────────────────────────────────
// The token's contract ID is dynamic (resolved via
// `financing.getPositionTokenId`, not a fixed config field), so
// `src/contracts/positionToken.ts` takes `token_id` as a regular parameter
// rather than exposing this namespace as a per-token factory.

export const POSITION_TOKEN_ABI = {
  getBalance: {
    method: 'balance',
    params: {
      token_id: { type: 'address' },
      address: { type: 'address' },
    },
  },
  getDecimals: {
    method: 'decimals',
    params: {
      token_id: { type: 'address' },
    },
  },
  transfer: {
    method: 'transfer',
    params: {
      token_id: { type: 'address' },
      from: { type: 'address' },
      to: { type: 'address' },
      amount: { type: 'i128' },
    },
  },
} as const satisfies Record<string, AbiFunctionDef>;

export interface PositionTokenReturns {
  getBalance: bigint;
  getDecimals: number;
  transfer: void;
}
