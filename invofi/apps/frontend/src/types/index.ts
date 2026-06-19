export type InvoiceStatus = 'Pending' | 'Financed' | 'Repaid' | 'Overdue' | 'Cancelled';
export type OfferStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Repaid' | 'Defaulted';
export type UserRole = 'business' | 'lender';
export type Currency = 'XLM' | 'USDC';

export interface Invoice {
  id: string;
  originator: string;
  amount: bigint;
  currency: Currency;
  due_date: number;
  status: InvoiceStatus;
}

export interface FinancingOffer {
  id: string;
  invoice_id: string;
  lender: string;
  amount: bigint;
  currency: Currency;
  interest_rate: number;
  duration: number;
  status: OfferStatus;
  funded_at: number;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  wallet_address: string | null;
  display_name: string | null;
  created_at: string;
}

export interface WalletState {
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
}
