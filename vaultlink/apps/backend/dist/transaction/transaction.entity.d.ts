import { User } from '../user/user.entity';
import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';
export declare enum TransactionType {
    INVOICE_TOKENIZATION = "invoice_tokenization",
    OFFER_ACCEPTANCE = "offer_acceptance",
    REPAYMENT = "repayment"
}
export declare enum TransactionStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    FAILED = "failed"
}
export declare class Transaction {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    txHash: string;
    contractId: string;
    tokenId: string;
    createdAt: Date;
    userId: string;
    user: User;
    invoiceId: string;
    invoice: Invoice;
    offerId: string;
    offer: FinancingOffer;
}
