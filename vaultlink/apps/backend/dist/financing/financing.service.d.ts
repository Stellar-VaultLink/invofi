import { Repository } from 'typeorm';
import { FinancingOffer } from './financing-offer.entity';
import { CreateFinancingDto } from './dto/create-financing.dto';
import { InvoiceService } from '../invoice/invoice.service';
import { TransactionService } from '../transaction/transaction.service';
export declare class FinancingService {
    private offerRepository;
    private invoiceService;
    private transactionService;
    constructor(offerRepository: Repository<FinancingOffer>, invoiceService: InvoiceService, transactionService: TransactionService);
    create(createFinancingDto: CreateFinancingDto, userId: string): Promise<FinancingOffer>;
    findAll(userId?: string): Promise<FinancingOffer[]>;
    findOne(id: string): Promise<FinancingOffer>;
    accept(id: string, userId: string): Promise<FinancingOffer>;
}
