// Contract shapes are owned by @invofi/sdk (Task 15 / ADR-0003) — re-export
// here so every component keeps importing from '@/types' with one source of
// truth. App-only types (profiles, wallet state) stay local.
export type {
  Currency,
  FinancingOffer,
  Invoice,
  InvoiceStatus,
  OfferStatus,
} from '@invofi/sdk';

import type { Currency } from '@invofi/sdk';

export type UserRole = 'business' | 'lender';

export type PositionListingStatus = 'Open' | 'Settled' | 'Withdrawn';

/**
 * A secondary-market ask for position tokens (ADR-0004).
 *
 * Discovery only: the row advertises a holder's intent to sell. InvoFi never
 * escrows the token or the payment — settlement is a plain SEP-41 transfer the
 * seller signs, after which they mark the listing Settled. Listings are
 * off-chain by design, so the shape lives here rather than in @invofi/sdk
 * (which owns contract shapes).
 */
export interface PositionListing {
  id: string;
  /** Stellar address holding the position tokens. */
  seller: string;
  seller_id: string | null;
  /** Invoice reference — the receivable the position is a claim on. */
  invoice_id: string;
  /** Financing offer the position came from, when known. */
  offer_id: string | null;
  /** Position tokens offered, human units (mirror convention, e.g. "1000.00"). */
  token_amount: string;
  /** What the seller is asking, human units. */
  asking_price: string;
  price_currency: Currency;
  status: PositionListingStatus;
  note: string | null;
  created_at: string;
  updated_at?: string;
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
  walletId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isInstalled: boolean;
  networkMismatch: boolean;
}

// Securitization / fractionalization types
export type {
  FractionalizationRecord,
  FractionalizationStatus,
  FractionalPosition,
  FractionalPositionStatus,
  FractionalPositionView,
  PriceHistoryPoint,
  DividendRecord,
  DividendStatus,
  FractionalizationStep1,
} from './securitization';
