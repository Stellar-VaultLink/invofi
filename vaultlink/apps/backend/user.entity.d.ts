import { Invoice } from '../invoices/invoice.entity';
export declare class User {
    id: string;
    email: string;
    passwordHash: string;
    stellarAccountId: string;
    role: string;
    invoices: Invoice[];
}
