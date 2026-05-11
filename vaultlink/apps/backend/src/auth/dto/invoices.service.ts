import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { User } from '../users/user.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private invoicesRepository: Repository<Invoice>,
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto, originator: User): Promise<Invoice> {
    const newInvoice = this.invoicesRepository.create({
      ...createInvoiceDto,
      originator,
      status: InvoiceStatus.PENDING,
    });
    return this.invoicesRepository.save(newInvoice);
  }

  async findAll(): Promise<Invoice[]> {
    return this.invoicesRepository.find({ relations: ['originator'] });
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.findOne({ where: { id }, relations: ['originator'] });
    if (!invoice) throw new NotFoundException(`Invoice with ID "${id}" not found`);
    return invoice;
  }
}