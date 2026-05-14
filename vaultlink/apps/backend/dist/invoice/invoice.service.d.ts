import { Repository } from 'typeorm';
import { Invoice } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { TransactionService } from '../transaction/transaction.service';
export declare class InvoiceService {
    private invoiceRepository;
    private transactionService;
    constructor(invoiceRepository: Repository<Invoice>, transactionService: TransactionService);
    create(createInvoiceDto: CreateInvoiceDto, userId: string): Promise<Invoice>;
    findAll(userId?: string): Promise<Invoice[]>;
    findOne(id: string): Promise<Invoice>;
    update(id: string, updateData: Partial<Invoice>, userId: string): Promise<Invoice>;
    remove(id: string, userId: string): Promise<void>;
    tokenize(id: string, userId: string): Promise<Invoice>;
}
