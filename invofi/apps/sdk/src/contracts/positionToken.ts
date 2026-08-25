// ── Typed position-token (SEP-41) contract client (#215) ─────────────────────
import { POSITION_TOKEN_ABI, type PositionTokenReturns } from '../types/contract-abi';
import { buildTypedContract, type TypedContract } from './builder';
import type { InvofiClientMethods } from '../client';

export type PositionTokenContract = TypedContract<typeof POSITION_TOKEN_ABI, PositionTokenReturns>;

export function createPositionTokenContract(client: InvofiClientMethods): PositionTokenContract {
  return buildTypedContract(POSITION_TOKEN_ABI, {
    getBalance: params => client.getTokenBalance(params.token_id, params.address),
    getDecimals: params => client.getTokenDecimals(params.token_id),
    transfer: params => client.transferPositionToken(params.token_id, params.from, params.to, params.amount),
  });
}
