import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
export declare class InvoiceController {
    private invoiceService;
    private readonly logger;
    constructor(invoiceService: InvoiceService);
    create(createInvoiceDto: CreateInvoiceDto, req: any): Promise<import("./invoice.entity").Invoice>;
    findAll(req: any): Promise<import("./invoice.entity").Invoice[]>;
    findOne(id: string): Promise<import("./invoice.entity").Invoice>;
    update(id: string, updateData: Partial<CreateInvoiceDto>, req: any): Promise<import("./invoice.entity").Invoice>;
    remove(id: string, req: any): Promise<void>;
    tokenize(id: string, req: any): Promise<import("./invoice.entity").Invoice>;
}
