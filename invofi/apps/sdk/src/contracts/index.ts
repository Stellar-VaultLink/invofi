// ── Typed contract call builder — public surface (#215) ──────────────────────
// `client.contracts.<name>.<method>(params)` — a namespaced, typed call
// builder layered over `InvofiClientMethods`. See `builder.ts` for how
// compile-time and runtime validation are derived from the ABI in
// `src/types/contract-abi.ts`.

import type { InvofiClientMethods } from '../client';
import { createRegistryContract, type RegistryContract } from './registry';
import { createFinancingContract, type FinancingContract } from './financing';
import { createRepaymentContract, type RepaymentContract } from './repayment';
import { createPositionTokenContract, type PositionTokenContract } from './positionToken';

export interface ContractsNamespace {
  registry: RegistryContract;
  financing: FinancingContract;
  repayment: RepaymentContract;
  positionToken: PositionTokenContract;
}

export function createContractsNamespace(client: InvofiClientMethods): ContractsNamespace {
  return {
    registry: createRegistryContract(client),
    financing: createFinancingContract(client),
    repayment: createRepaymentContract(client),
    positionToken: createPositionTokenContract(client),
  };
}

export { buildTypedContract, validateAbiParams } from './builder';
export type { TypedContract, TypedContractImpl } from './builder';
export type { RegistryContract, FinancingContract, RepaymentContract, PositionTokenContract };
