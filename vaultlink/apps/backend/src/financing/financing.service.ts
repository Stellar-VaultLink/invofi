import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinancingOffer, OfferStatus } from './financing-offer.entity';
import { CreateFinancingDto } from './dto/create-financing.dto';
import { InvoiceService } from '../invoice/invoice.service';
import { TransactionService } from '../transaction/transaction.service';

@Injectable()
export class FinancingService {
  constructor(
    @InjectRepository(FinancingOffer)
    private offerRepository: Repository<FinancingOffer>,
    private invoiceService: InvoiceService,
    private transactionService: TransactionService,
  ) {}

  async create(createFinancingDto: CreateFinancingDto, userId: string): Promise<FinancingOffer> {
    const invoice = await this.invoiceService.findOne(createFinancingDto.invoiceId);

    const offer = this.offerRepository.create({
      ...createFinancingDto,
      lenderId: userId,
    });
    return this.offerRepository.save(offer);
  }

  async findAll(userId?: string): Promise<FinancingOffer[]> {
    if (userId) {
      return this.offerRepository.find({
        where: { lenderId: userId },
        relations: ['invoice', 'invoice.createdBy'],
      });
    }
    return this.offerRepository.find({
      relations: ['invoice', 'invoice.createdBy', 'lender'],
    });
  }

  async findOne(id: string): Promise<FinancingOffer> {
    const offer = await this.offerRepository.findOne({
      where: { id },
      relations: ['invoice', 'lender'],
    });
    if (!offer) {
      throw new NotFoundException('Financing offer not found');
    }
    return offer;
  }

  async accept(id: string, userId: string): Promise<FinancingOffer> {
    const offer = await this.findOne(id);

    if (offer.invoice.createdById !== userId) {
      throw new ForbiddenException('Only invoice creator can accept offers');
    }

    if (offer.status !== OfferStatus.PENDING) {
      throw new ForbiddenException('Offer is not pending');
    }

    const transaction = await this.transactionService.acceptOffer(offer);
    offer.status = OfferStatus.ACCEPTED;
    offer.contractId = transaction.contractId;

    return this.offerRepository.save(offer);
  }
}