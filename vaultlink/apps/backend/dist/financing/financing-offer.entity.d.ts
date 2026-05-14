import { User } from '../user/user.entity';
import { Invoice } from '../invoice/invoice.entity';
export declare enum OfferStatus {
    PENDING = "pending",
    ACCEPTED = "accepted",
    REJECTED = "rejected",
    EXPIRED = "expired"
}
export declare class FinancingOffer {
    id: string;
    amount: string;
    interestRate: number;
    duration: number;
    status: OfferStatus;
    contractId: string;
    createdAt: Date;
    updatedAt: Date;
    invoiceId: string;
    lenderId: string;
    invoice: Invoice;
    lender: User;
}
