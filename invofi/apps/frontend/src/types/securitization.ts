/**
 * Securitization / fractionalization domain types.
 *
 * Design rationale
 * ────────────────
 * Position tokens are already SEP-41 Stellar assets minted 1-for-1 with
 * invoice principal at offer acceptance (ADR-0002). Fractionalization builds
 * an off-chain metadata layer on top: the invoice owner records that they have
 * split their position into N fractions at a given unit price, and investors
 * record which fractions they hold.
 *
 * Nothing about fractional ownership changes on-chain — the underlying asset
 * is still the POS SEP-41 token. What we add is:
 *  • A fractionalization_records table: N, unit_price, status
 *  • A fractional_positions table: buyer, fraction count
 *  • A price_history table: indexed by listing close events
 *  • A dividend_distributions table: originator pushes yield allocations
 *
 * All amounts are stored as decimal strings (human units) matching the
 * existing Supabase mirror convention in financing_offers.
 */

import type { Currency } from '@/types';

// ── Fractionalization record ─────────────────────────────────────────────────

export type FractionalizationStatus = 'active' | 'sold_out' | 'cancelled';

/**
 * One fractionalization event for an invoice.
 * An invoice owner may fractionalize once; re-fractionalization is blocked
 * while any active record exists.
 */
export interface FractionalizationRecord {
  id: string;
  /** Invoice being fractionalized. */
  invoice_id: string;
  /** Supabase user ID of the invoice originator. */
  originator_id: string;
  /** Stellar address of the originator (for display + on-chain lookups). */
  originator_address: string;
  /** Total number of fraction tokens minted. */
  total_fractions: number;
  /** Fractions still available for purchase. */
  available_fractions: number;
  /** Price per fraction in human units (e.g. "10.50"). */
  price_per_fraction: string;
  /** Currency of the price. */
  price_currency: Currency;
  /** Symbol for the fraction token (e.g. "INV-001-FRAC"). */
  token_symbol: string;
  /** Human-readable token name. */
  token_name: string;
  /** Decimal places (mirrors SEP-41 — typically 7 for Stellar assets). */
  decimals: number;
  /** Active = fractions still on sale. sold_out = fully subscribed. cancelled = withdrawn. */
  status: FractionalizationStatus;
  /** Optional description shown to buyers. */
  description: string | null;
  created_at: string;
  updated_at?: string;
}

// ── Fractional position ──────────────────────────────────────────────────────

export type FractionalPositionStatus = 'held' | 'sold' | 'redeemed';

/**
 * An investor's holding of fractions from a single fractionalization.
 * Multiple purchase events for the same fractionalization are summed into
 * one row (upsert on lender_id + fractionalization_id).
 */
export interface FractionalPosition {
  id: string;
  fractionalization_id: string;
  /** Supabase user ID of the investor. */
  lender_id: string;
  /** Stellar address of the investor. */
  lender_address: string;
  /** Number of fractions held. */
  fraction_count: number;
  /** Purchase price per fraction at acquisition time. */
  purchase_price_per_fraction: string;
  purchase_currency: Currency;
  status: FractionalPositionStatus;
  purchased_at: string;
  updated_at?: string;
  /** Joined from fractionalization_records — available when fetched with select('*, fractionalization:fractionalization_records(*)'). */
  fractionalization?: FractionalizationRecord;
}

// ── Price history ────────────────────────────────────────────────────────────

/**
 * One price observation for a fractionalization's fraction token.
 * Written when a fraction purchase settles or when a secondary-market trade
 * is marked Settled.
 */
export interface PriceHistoryPoint {
  id: string;
  fractionalization_id: string;
  /** Price per fraction at this event. */
  price: string;
  currency: Currency;
  /** Number of fractions traded. */
  volume: number;
  /** ISO timestamp. */
  recorded_at: string;
  /** 'primary' = direct purchase; 'secondary' = secondary-market trade. */
  source: 'primary' | 'secondary';
}

// ── Dividend distribution ────────────────────────────────────────────────────

export type DividendStatus = 'pending' | 'distributed' | 'cancelled';

/**
 * A dividend (yield distribution) from an invoice originator to all fraction
 * holders. The originator pushes one row per distribution event; the UI shows
 * each holder's pro-rata share.
 */
export interface DividendRecord {
  id: string;
  fractionalization_id: string;
  /** Total amount distributed to all holders. */
  total_amount: string;
  currency: Currency;
  /** Per-fraction payout = total_amount / total_fractions. */
  per_fraction_amount: string;
  status: DividendStatus;
  /** ISO timestamp of distribution. */
  distributed_at: string | null;
  created_at: string;
  note: string | null;
}

// ── View models ──────────────────────────────────────────────────────────────

/** A fractional position enriched with current valuation for portfolio display. */
export interface FractionalPositionView {
  position: FractionalPosition;
  record: FractionalizationRecord;
  /** Current estimated value = fraction_count × record.price_per_fraction. */
  currentValue: string;
  /** Total dividends earned on this position. */
  totalDividendsEarned: string;
  /** Percentage of the total fractions held by this investor. */
  ownershipPercent: number;
}

// ── Wizard form steps ────────────────────────────────────────────────────────

export interface FractionalizationStep1 {
  totalFractions: number;
  pricePerFraction: string;
  priceCurrency: Currency;
  tokenSymbol: string;
  tokenName: string;
  description: string;
}
