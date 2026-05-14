import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Invoice } from '../invoice/invoice.entity';

export enum OfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('financing_offers')
export class FinancingOffer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  interestRate!: number;

  @Column()
  duration!: number;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status!: OfferStatus;

  @Column({ nullable: true })
  contractId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column()
  invoiceId!: string;

  @Column()
  lenderId!: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.financingOffers)
  invoice!: Invoice;

  @ManyToOne(() => User, (user) => user.lendingOffers)
  lender!: User;
}