import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';
import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async createInvoiceToken(invoice: Invoice): Promise<Transaction> {
    const transaction = this.transactionRepository.create({
      type: TransactionType.INVOICE_TOKENIZATION,
      txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      contractId: `contract_${Date.now()}`,
      tokenId: `token_${Date.now()}`,
      userId: invoice.createdById,
      invoiceId: invoice.id,
      status: TransactionStatus.COMPLETED,
    });
    return this.transactionRepository.save(transaction);
  }

  async acceptOffer(offer: FinancingOffer): Promise<Transaction> {
    const transaction = this.transactionRepository.create({
      type: TransactionType.OFFER_ACCEPTANCE,
      txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      contractId: `financing_${Date.now()}`,
      userId: offer.invoice.createdById,
      offerId: offer.id,
      invoiceId: offer.invoiceId,
      status: TransactionStatus.COMPLETED,
    });
    return this.transactionRepository.save(transaction);
  }

  async createRepayment(offer: FinancingOffer): Promise<Transaction> {
    const transaction = this.transactionRepository.create({
      type: TransactionType.REPAYMENT,
      txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      contractId: `repayment_${Date.now()}`,
      userId: offer.invoice.createdById,
      offerId: offer.id,
      invoiceId: offer.invoiceId,
      status: TransactionStatus.COMPLETED,
    });
    return this.transactionRepository.save(transaction);
  }
}