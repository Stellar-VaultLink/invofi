import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';

export enum TransactionType {
  INVOICE_TOKENIZATION = 'invoice_tokenization',
  OFFER_ACCEPTANCE = 'offer_acceptance',
  REPAYMENT = 'repayment',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column()
  txHash: string;

  @Column()
  contractId: string;

  @Column({ nullable: true })
  tokenId: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.invoices)
  user: User;

  @Column({ nullable: true })
  invoiceId: string;

  @ManyToOne(() => Invoice)
  invoice: Invoice;

  @Column({ nullable: true })
  offerId: string;

  @ManyToOne(() => FinancingOffer)
  offer: FinancingOffer;
}