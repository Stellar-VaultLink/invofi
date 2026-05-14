import { User } from '../../user/user.entity';
export declare enum InvoiceStatus {
    PENDING = "pending",
    FINANCED = "financed",
    REPAID = "repaid",
    OVERDUE = "overdue",
    CANCELLED = "cancelled"
}
export declare class Invoice {
    id: string;
    amount: string;
    currency: string;
    dueDate: Date;
    status: InvoiceStatus;
    originator: User;
    createdAt: Date;
    updatedAt: Date;
    onChainInvoiceId: string;
}
