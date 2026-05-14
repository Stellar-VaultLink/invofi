import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity'; // Import FinancingOffer
import { Transaction } from '../transaction/transaction.entity'; // Import Transaction

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ unique: true, nullable: true })
  stellarAccountId?: string; // Public key of the Stellar account (made optional)

  @Column({ default: 'originator' }) // 'originator', 'funder', 'admin'
  role!: string;

  @OneToMany(() => Invoice, (invoice: Invoice) => invoice.createdBy) // Corrected relationship to createdBy
  invoices!: Invoice[];

  @OneToMany(() => FinancingOffer, (offer: FinancingOffer) => offer.lender) // Added for lender offers
  lendingOffers!: FinancingOffer[];

  @OneToMany(() => Transaction, (transaction: Transaction) => transaction.user) // Added for transactions
  transactions!: Transaction[];
}