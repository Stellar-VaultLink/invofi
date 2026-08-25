// ── Typed financing contract client (#215) ───────────────────────────────────
import { FINANCING_ABI, type FinancingReturns } from '../types/contract-abi';
import { buildTypedContract, type TypedContract } from './builder';
import type { InvofiClientMethods } from '../client';

export type FinancingContract = TypedContract<typeof FINANCING_ABI, FinancingReturns>;

export function createFinancingContract(client: InvofiClientMethods): FinancingContract {
  return buildTypedContract(FINANCING_ABI, {
    createOffer: params =>
      client.createOffer(
        {
          offerId: params.offer_id,
          invoiceId: params.invoice_id,
          amount: params.amount,
          currency: params.currency,
          interestRate: params.interest_rate,
          duration: params.duration,
        },
        params.lender,
      ),
    getOffer: params => client.getOffer(params.id, params.source_account),
    acceptOffer: params => client.acceptOffer(params.offer_id, params.originator),
    rejectOffer: params => client.rejectOffer(params.offer_id, params.originator),
    getPositionTokenId: params => client.getPositionTokenId(params.source_account),
  });
}
