import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/user.entity';

export enum InvoiceStatus {
  PENDING = 'pending',
  FINANCED = 'financed',
  REPAID = 'repaid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  amount!: string; // Use string for currency to avoid precision issues

  @Column()
  currency!: string; // e.g., 'XLM', 'USDC'

  @Column({ type: 'date' })
  dueDate!: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @ManyToOne(() => User, (user) => user.invoices)
  originator!: User; // The user who created this invoice

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ nullable: true })
  onChainInvoiceId!: string; // Reference to the Soroban contract's invoice ID/hash
}