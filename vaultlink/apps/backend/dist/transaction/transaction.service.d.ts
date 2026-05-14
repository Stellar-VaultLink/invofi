import { Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';
export declare class TransactionService {
    private transactionRepository;
    constructor(transactionRepository: Repository<Transaction>);
    createInvoiceToken(invoice: Invoice): Promise<Transaction>;
    acceptOffer(offer: FinancingOffer): Promise<Transaction>;
    createRepayment(offer: FinancingOffer): Promise<Transaction>;
}
