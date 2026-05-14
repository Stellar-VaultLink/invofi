import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js'; // Import Decimal for precise calculations
import { Invoice, InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { TransactionService } from '../transaction/transaction.service';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    private transactionService: TransactionService,
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto, userId: string): Promise<Invoice> {
    // Convert amount to string for precise storage
    const amountString = new Decimal(createInvoiceDto.amount).toFixed(7);
    const invoice = this.invoiceRepository.create({
      ...createInvoiceDto,
      amount: amountString, // Use the string amount
      dueDate: new Date(createInvoiceDto.dueDate), // Convert dueDate string to Date object
      createdById: userId,
    });
    return await this.invoiceRepository.save(invoice);
  }

  async findAll(userId?: string): Promise<Invoice[]> {
    if (userId) {
      return this.invoiceRepository.find({
        where: { createdById: userId },
        relations: ['financingOffers'],
      });
    }
    return this.invoiceRepository.find({ relations: ['financingOffers'] });
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['createdBy', 'financingOffers'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async update(id: string, updateData: Partial<Invoice>, userId: string): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (invoice.createdById !== userId && invoice.status !== InvoiceStatus.DRAFT) {
      throw new ForbiddenException('Cannot update non-draft invoice');
    }

    // Handle amount conversion if present in updateData
    if (updateData.amount !== undefined) {
      updateData.amount = new Decimal(updateData.amount).toFixed(7);
    }
    // Handle dueDate conversion if present in updateData
    if (updateData.dueDate !== undefined && typeof updateData.dueDate === 'string') {
      (updateData as any).dueDate = new Date(updateData.dueDate);
    }

    Object.assign(invoice, updateData); // Apply updates
    return await this.invoiceRepository.save(invoice);
  }
  
  async remove(id: string, userId: string): Promise<void> {
    const invoice = await this.findOne(id);

    if (invoice.createdById !== userId) {
      throw new ForbiddenException('Cannot delete another user\'s invoice');
    }

    await this.invoiceRepository.remove(invoice);
  }

  async tokenize(id: string, userId: string): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (invoice.createdById !== userId) {
      throw new ForbiddenException('Cannot tokenize another user\'s invoice');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ForbiddenException('Only draft invoices can be tokenized');
    }

    const transaction = await this.transactionService.createInvoiceToken(invoice);
    invoice.status = InvoiceStatus.PENDING;
    invoice.contractId = transaction.contractId;
    invoice.tokenId = transaction.tokenId;

    return this.invoiceRepository.save(invoice);
  }
}