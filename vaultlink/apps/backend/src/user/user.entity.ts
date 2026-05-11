import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Invoice } from '../invoice/invoice.entity';
import { FinancingOffer } from '../financing/financing-offer.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  stellarPublicKey: string;

  @Column({ unique: true })
  walletAddress: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ default: 0 })
  creditScore: number;

  @Column({ type: 'decimal', precision: 20, scale: 7, default: 0 })
  walletBalance: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Invoice, (invoice) => invoice.creator)
  invoices: Invoice[];

  @OneToMany(() => FinancingOffer, (offer) => offer.lender)
  lendingOffers: FinancingOffer[];
}