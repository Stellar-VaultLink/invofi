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
  @PrimaryGeneratedColumn('uuid') // Auto-generated UUID
  id!: string;

  @Column() // Title of the invoice
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string; // Optional description

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount!: string; // Use string for currency to avoid precision issues

  @Column() // Currency type (e.g., 'USDC', 'XLM')
  currency!: string;

  @Column() // Issuer of the invoice
  issuer!: string;

  @Column() // Recipient of the invoice
  recipient!: string;

  @Column() // Due date of the invoice
  dueDate!: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus; // Current status of the invoice

  @Column({ nullable: true })
  contractId?: string; // Stellar Soroban contract ID

  @Column({ nullable: true })
  tokenId?: string; // NFT token ID on Soroban

  @CreateDateColumn()
  createdAt!: Date; // Timestamp of creation

  @UpdateDateColumn()
  updatedAt!: Date; // Timestamp of last update

  @Column()
  createdById!: string; // ID of the user who created the invoice

  @ManyToOne(() => User, (user) => user.invoices)
  createdBy!: User; // User who created the invoice

  @OneToMany(() => FinancingOffer, (offer) => offer.invoice)
  financingOffers!: FinancingOffer[]; // Related financing offers
}