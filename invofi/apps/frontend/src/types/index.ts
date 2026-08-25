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
import type { DocumentMimeType } from '@/lib/documents/validation';
import type { DocumentStatus } from '@/lib/documents/status';

export type UserRole = 'business' | 'lender';

/**
 * An invoice proof document attached by the originator and verified by
 * lenders (issue #222). Bytes live on IPFS; this row is the access-controlled
 * index (CID + SHA-256 hash + verification state).
 */
export interface InvoiceDocument {
  id: string;
  invoice_id: string;
  uploader_id: string;
  file_name: string;
  mime_type: DocumentMimeType;
  file_size: number;
  ipfs_cid: string;
  /** SHA-256 hex digest of the file bytes, for tamper detection. */
  document_hash: string;
  status: DocumentStatus;
  verification_comment: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

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
  /**
   * True only when `wallet_address` was bound via a verified SEP-10
   * challenge signature (see `docs/05-authentication.md`, Method 3),
   * as opposed to the legacy blind-trust `signInWithWallet` linking.
   * Optional because it requires a schema column (`user_profiles
   * .wallet_verified boolean`) that may not exist on older projects —
   * treat `undefined`/`null` the same as `false`.
   */
  wallet_verified?: boolean | null;
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

// ── Multi-signature transaction approval (issue #219) ────────────────────────

export type PendingTransactionStatus =
  | 'Pending' // awaiting the required number of approvals
  | 'Executed' // threshold met and submitted to the network
  | 'Rejected' // a party rejected it before it could execute
  | 'Expired'; // the 24h approval window elapsed

/**
 * A high-value transaction awaiting M-of-N wallet approvals before it can be
 * submitted (issue #219). The `xdr` is the base transaction envelope with no
 * signatures; each approver signs that same envelope and their signature is
 * stored as a {@link TransactionApproval}. Once the required number of
 * signatures is collected they are combined onto the envelope and submitted.
 *
 * Off-chain coordination by design — the row lives in the Supabase mirror, not
 * on-chain, so the shape lives here rather than in @invofi/sdk.
 */
export interface PendingTransaction {
  id: string;
  /** Human label shown in the queue, e.g. "Treasury payment — 12,000 XLM". */
  title: string;
  /** What kind of operation this envelope performs (payment, invoice, …). */
  operation: string;
  /** Stellar address that created the request (the transaction source). */
  initiator: string;
  initiator_id: string | null;
  /** Base transaction envelope XDR, unsigned. */
  xdr: string;
  network_passphrase: string;
  /** Amount in human units (mirror convention), for threshold display. */
  amount: string;
  currency: Currency;
  /** Signatures needed before the transaction may execute. */
  required_signatures: number;
  status: PendingTransactionStatus;
  /** Network hash, set once the combined transaction is submitted. */
  tx_hash: string | null;
  /** ISO timestamp after which an un-approved request auto-rejects. */
  expires_at: string;
  created_at: string;
  updated_at?: string;
}

/**
 * One co-signer's approval of a {@link PendingTransaction}. `signature` is a
 * base64-encoded Stellar `DecoratedSignature` over the base envelope; the set
 * of approvals is combined onto the envelope at execution time.
 */
export interface TransactionApproval {
  id: string;
  pending_tx_id: string;
  approver_address: string;
  approver_id: string | null;
  /** base64 DecoratedSignature over the pending transaction's `xdr`. */
  signature: string;
  created_at: string;
}

/** A pending transaction with its approvals joined (Supabase nested select). */
export interface PendingTransactionWithApprovals extends PendingTransaction {
  transaction_approvals: TransactionApproval[];
}

// Matching engine types (lender preferences, scores, quality)
export type {
  RiskProfile,
  CurrencyPreference,
  LenderPreferences,
  LenderPreferencesSerialized,
  MatchQuality,
  MatchResult,
  OriginatorHistory,
  ScoreBreakdown,
} from './matching';
export { DEFAULT_PREFERENCES, serializePreferences, deserializePreferences } from './matching';
