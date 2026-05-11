import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancingOffer } from './financing-offer.entity';
import { FinancingController } from './financing.controller';
import { FinancingService } from './financing.service';
import { InvoiceModule } from '../invoice/invoice.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [TypeOrmModule.forFeature([FinancingOffer]), InvoiceModule, TransactionModule],
  controllers: [FinancingController],
  providers: [FinancingService],
  exports: [FinancingService],
})
export class FinancingModule {}