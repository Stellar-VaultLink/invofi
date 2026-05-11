import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from '../user/user.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  FUNDED = 'funded',
  REPAID = 'repaid',
  DEFAULTED = 'defaulted',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount: string;

  @Column()
  currency: string;

  @Column()
  issuer: string;

  @Column()
  recipient: string;

  @Column()
  dueDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ nullable: true })
  contractId: string;

  @Column({ nullable: true })
  tokenId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdById: string;

  @ManyToOne(() => User, (user) => user.invoices)
  createdBy: User;

  @OneToMany(() => FinancingOffer, (offer) => offer.invoice)
  financingOffers: FinancingOffer[];
}