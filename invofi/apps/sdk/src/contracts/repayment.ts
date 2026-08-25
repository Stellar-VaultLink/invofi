// ── Typed repayment contract client (#215) ───────────────────────────────────
import { REPAYMENT_ABI, type RepaymentReturns } from '../types/contract-abi';
import { buildTypedContract, type TypedContract } from './builder';
import type { InvofiClientMethods } from '../client';

export type RepaymentContract = TypedContract<typeof REPAYMENT_ABI, RepaymentReturns>;

export function createRepaymentContract(client: InvofiClientMethods): RepaymentContract {
  return buildTypedContract(REPAYMENT_ABI, {
    repayInvoice: params => client.repayInvoice(params.invoice_id, params.offer_id, params.repayer, params.amount),
    markOverdue: params => client.markOverdue(params.invoice_id, params.caller),
    reclaimInvoice: params => client.reclaimInvoice(params.invoice_id, params.offer_id, params.lender),
  });
}
