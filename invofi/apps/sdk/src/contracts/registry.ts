// ── Typed registry contract client (#215) ────────────────────────────────────
import { REGISTRY_ABI, type RegistryReturns } from '../types/contract-abi';
import { buildTypedContract, type TypedContract } from './builder';
import type { InvofiClientMethods } from '../client';

export type RegistryContract = TypedContract<typeof REGISTRY_ABI, RegistryReturns>;

export function createRegistryContract(client: InvofiClientMethods): RegistryContract {
  return buildTypedContract(REGISTRY_ABI, {
    registerInvoice: params =>
      client.registerInvoice(
        { id: params.id, amount: params.amount, currency: params.currency, dueDate: params.due_date },
        params.originator,
      ),
    getInvoice: params => client.getInvoice(params.id, params.source_account),
    cancelInvoice: params => client.cancelInvoice(params.id, params.originator),
  });
}
