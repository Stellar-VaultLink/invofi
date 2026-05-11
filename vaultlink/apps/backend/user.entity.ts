import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Invoice } from '../invoices/invoice.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ unique: true, nullable: true })
  stellarAccountId: string; // Public key of the Stellar account

  @Column({ default: 'originator' }) // 'originator', 'funder', 'admin'
  role: string;

  @OneToMany(() => Invoice, invoice => invoice.originator)
  invoices: Invoice[];
}