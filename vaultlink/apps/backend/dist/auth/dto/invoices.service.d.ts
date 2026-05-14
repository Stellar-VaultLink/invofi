import { Repository } from 'typeorm';
import { Invoice } from './invoice.entity';
import { CreateInvoiceDto } from './create-invoice.dto';
import { User } from '../../user/user.entity';
export declare class InvoicesService {
    private invoicesRepository;
    constructor(invoicesRepository: Repository<Invoice>);
    create(createInvoiceDto: CreateInvoiceDto, originator: User): Promise<Invoice>;
    findAll(): Promise<Invoice[]>;
    findOne(id: string): Promise<Invoice>;
}
