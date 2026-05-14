import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';
import { Transaction } from '../transaction/transaction.entity';
export declare class User {
    id: string;
    email: string;
    passwordHash: string;
    stellarAccountId?: string;
    role: string;
    invoices: Invoice[];
    lendingOffers: FinancingOffer[];
    transactions: Transaction[];
}
