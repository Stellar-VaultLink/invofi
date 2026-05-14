import { User } from '../user/user.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';
export declare enum InvoiceStatus {
    DRAFT = "draft",
    PENDING = "pending",
    FUNDED = "funded",
    REPAID = "repaid",
    DEFAULTED = "defaulted"
}
export declare class Invoice {
    id: string;
    title: string;
    description?: string;
    amount: string;
    currency: string;
    issuer: string;
    recipient: string;
    dueDate: Date;
    status: InvoiceStatus;
    contractId?: string;
    tokenId?: string;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
    createdBy: User;
    financingOffers: FinancingOffer[];
}
