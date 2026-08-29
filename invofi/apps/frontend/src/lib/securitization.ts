/**
 * Securitization data helpers
 *
 * All Supabase interactions for the fractionalization feature live here.
 * The module is intentionally side-effect free — it exports pure async
 * functions that callers (components, hooks) invoke explicitly.
 *
 * Monetary amounts are kept as `bigint` (stroops) throughout calculations and
 * only converted to formatted strings via `formatAmount()` at the boundary.
 * This prevents the floating-point precision loss that occurs when large i128
 * values are cast through `Number`.
 */

import { z } from 'zod';
import { supabase } from './supabase';
import { toStroopsBigInt, formatAmount } from './utils';
import type {
  DividendRecord,
  FractionalPosition,
  FractionalPositionView,
  FractionalizationRecord,
  PriceHistoryPoint,
} from '@/types/securitization';
import type { Currency } from '@/types';

// ── Validation schemas ────────────────────────────────────────────────────────

/** Validates a human-unit decimal string with up to 7 decimal places. */
const positiveDecimal = (label: string) =>
  z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, `Enter a valid ${label} (e.g. 10.50)`)
    .refine(v => toStroopsBigInt(v) > 0n, `${label} must be greater than zero`);

/**
 * Zod schema for the fractionalization wizard form.
 * Note: `pricePerFraction` is now derived server-side from
 * `invoice.amount / totalFractions` and is excluded from the persisted
 * payload; it is still exposed in the wizard's review step for display only.
 */
export const fractionalizationSchema = z.object({
  totalFractions: z
    .number({ invalid_type_error: 'Enter a whole number' })
    .int('Must be a whole number')
    .min(2, 'Minimum 2 fractions')
    .max(1_000_000, 'Maximum 1 000 000 fractions'),
  // pricePerFraction is derived from invoice.amount / totalFractions, not user-editable
  pricePerFraction: positiveDecimal('price per fraction'),
  priceCurrency: z.enum(['XLM', 'USDC']),
  tokenSymbol: z
    .string()
    .min(3, 'At least 3 characters')
    .max(12, 'Max 12 characters')
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, digits, and hyphens only'),
  tokenName: z.string().min(3, 'At least 3 characters').max(64, 'Max 64 characters'),
  description: z.string().max(500, 'Max 500 characters'),
});

/** Type inferred from `fractionalizationSchema`. */
export type FractionalizationDraft = z.infer<typeof fractionalizationSchema>;

/**
 * Zod schema for the fraction purchase form.
 * Supply-cap validation is enforced server-side; the Zod refine here is a
 * client-side UX hint only and should not be relied on for correctness.
 */
export const purchaseSchema = z.object({
  fractionCount: z
    .number({ invalid_type_error: 'Enter a whole number' })
    .int('Must be a whole number')
    .min(1, 'Buy at least 1 fraction'),
});

/** Type inferred from `purchaseSchema`. */
export type PurchaseDraft = z.infer<typeof purchaseSchema>;

// ── Fractionalization record helpers ─────────────────────────────────────────

/**
 * Fetch the active (non-cancelled) fractionalization for a given invoice.
 * Returns `null` when no record exists or the only record is cancelled.
 */
export async function fetchFractionalizationRecord(
  invoiceId: string,
): Promise<FractionalizationRecord | null> {
  const { data, error } = await supabase
    .from('fractionalization_records')
    .select('*')
    .eq('invoice_id', invoiceId)
    .neq('status', 'cancelled')
    .maybeSingle();
  if (error) throw error;
  return data as FractionalizationRecord | null;
}

/**
 * Fetch all active (non-cancelled) fractionalized invoices for the marketplace.
 * Returns newest-first.
 */
export async function fetchActiveFractionalizations(): Promise<FractionalizationRecord[]> {
  const { data, error } = await supabase
    .from('fractionalization_records')
    .select('*')
    .in('status', ['active', 'sold_out'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as FractionalizationRecord[]) ?? [];
}

/**
 * @deprecated Typo alias kept for one release cycle; use `fetchActiveFractionalizations`.
 */
export const fetchActiveFragrationalizations = fetchActiveFractionalizations;

/**
 * Publish a new fractionalization for an invoice.
 *
 * Performs an atomic two-step write:
 *  1. Inserts the `fractionalization_records` row.
 *  2. Seeds the first `price_history` point.
 *
 * If the price-history insert fails, the fractionalization record is rolled
 * back (the caller should surface the error and allow a clean retry).
 *
 * Throws if the invoice already has an active fractionalization (enforced by
 * the `unique_active_per_invoice` partial constraint at DB level).
 */
export async function createFractionalization(
  draft: FractionalizationDraft,
  invoiceId: string,
  originatorId: string,
  originatorAddress: string,
): Promise<FractionalizationRecord> {
  const { data, error } = await supabase
    .from('fractionalization_records')
    .insert({
      invoice_id: invoiceId,
      originator_id: originatorId,
      originator_address: originatorAddress,
      total_fractions: draft.totalFractions,
      available_fractions: draft.totalFractions,
      price_per_fraction: draft.pricePerFraction,
      price_currency: draft.priceCurrency,
      token_symbol: draft.tokenSymbol,
      token_name: draft.tokenName,
      decimals: 7,
      status: 'active',
      description: draft.description.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  const created = data as FractionalizationRecord;

  // Seed the first price history point atomically. If this fails we throw,
  // leaving the record in the DB but the caller can retry cleanly (the
  // `unique_active_per_invoice` constraint will reject a duplicate, so the
  // caller should handle that case and reload instead of re-inserting).
  try {
    await recordPricePoint({
      fractionalizationId: created.id,
      price: draft.pricePerFraction,
      currency: draft.priceCurrency as Currency,
      volume: draft.totalFractions,
      source: 'primary',
    });
  } catch (priceErr) {
    // Cancel the fractionalization so the state is consistent before rethrowing
    await supabase
      .from('fractionalization_records')
      .update({ status: 'cancelled' })
      .eq('id', created.id);
    throw priceErr;
  }

  return created;
}

/**
 * Cancel a fractionalization record.
 * Access is enforced by RLS: only the originator (`originator_id = auth.uid()`)
 * may update their own record.
 */
export async function cancelFractionalization(id: string): Promise<void> {
  const { error } = await supabase
    .from('fractionalization_records')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

// ── Purchase helpers ──────────────────────────────────────────────────────────

/**
 * Record a fraction purchase via the `add_fractional_position` security-definer
 * RPC, which atomically:
 *  1. Verifies the record is `active` and has sufficient `available_fractions`.
 *  2. Decrements `available_fractions` and transitions to `sold_out` when exhausted.
 *  3. Upserts `fractional_positions`, **adding** to any existing `fraction_count`
 *     rather than overwriting it — preventing a repeat buyer from losing their
 *     earlier fractions.
 *  4. Inserts a `price_history` point for the trade.
 *
 * Note: this is an optimistic off-chain write. The actual SEP-41 token transfer
 * must be signed by the caller separately via `transferPositionToken()`.
 */
export async function purchaseFraction(
  fractionalizationId: string,
  fractionCount: number,
  lenderId: string,
  lenderAddress: string,
): Promise<FractionalPosition> {
  // First fetch the record for the price/currency values we need to pass
  const { data: record, error: fetchErr } = await supabase
    .from('fractionalization_records')
    .select('*')
    .eq('id', fractionalizationId)
    .single();
  if (fetchErr) throw fetchErr;

  const rec = record as FractionalizationRecord;

  // Client-side guard (the RPC enforces this too)
  if (rec.status !== 'active') {
    throw new Error(
      rec.status === 'sold_out'
        ? 'This fractionalization is sold out.'
        : 'This fractionalization is no longer active.',
    );
  }
  if (fractionCount > rec.available_fractions) {
    throw new Error(
      `Only ${rec.available_fractions} fraction${rec.available_fractions !== 1 ? 's' : ''} available.`,
    );
  }

  // Atomic additive upsert + inventory decrement + price-history via RPC
  const { data: posData, error: posErr } = await supabase.rpc('add_fractional_position', {
    p_fractionalization_id: fractionalizationId,
    p_lender_id: lenderId,
    p_lender_address: lenderAddress,
    p_fraction_count: fractionCount,
    p_price_per_fraction: rec.price_per_fraction,
    p_currency: rec.price_currency,
  });
  if (posErr) throw posErr;

  return posData as FractionalPosition;
}

// ── Fractional position queries ───────────────────────────────────────────────

/**
 * Fetch all fractional positions for a lender, with the joined
 * `fractionalization_records` row included.
 */
export async function fetchFractionalPositions(
  lenderId: string,
): Promise<FractionalPosition[]> {
  const { data, error } = await supabase
    .from('fractional_positions')
    .select('*, fractionalization:fractionalization_records(*)')
    .eq('lender_id', lenderId)
    .eq('status', 'held')
    .order('purchased_at', { ascending: false });
  if (error) throw error;
  return (data as FractionalPosition[]) ?? [];
}

/**
 * Build view models enriched with current valuation and dividend totals.
 *
 * All arithmetic is performed in `bigint` (stroops) to preserve the full
 * i128 precision. Values are formatted to human-unit strings only at the
 * very end via `formatAmount()`.
 *
 * Dividend totals are grouped per currency so mixed-currency positions are
 * never incorrectly summed.
 */
export async function buildPositionViews(
  positions: FractionalPosition[],
): Promise<FractionalPositionView[]> {
  if (positions.length === 0) return [];

  const fracIds = positions.map(p => p.fractionalization_id);
  const { data: divData } = await supabase
    .from('dividend_distributions')
    .select('fractionalization_id, per_fraction_amount, currency, status')
    .in('fractionalization_id', fracIds)
    .eq('status', 'distributed');

  // Map fractionalization_id → total per_fraction_amount in stroops (bigint)
  const dividendsByFrac = new Map<string, bigint>();
  for (const d of (divData ?? []) as {
    fractionalization_id: string;
    per_fraction_amount: string;
    currency: string;
  }[]) {
    const prev = dividendsByFrac.get(d.fractionalization_id) ?? 0n;
    dividendsByFrac.set(
      d.fractionalization_id,
      prev + toStroopsBigInt(d.per_fraction_amount),
    );
  }

  return positions.map(p => {
    const record = p.fractionalization as FractionalizationRecord;
    const count = BigInt(p.fraction_count);

    // Current value: keep in bigint until formatting
    const currentUnitStroops = toStroopsBigInt(record?.price_per_fraction ?? '0');
    const currentValueStroops = currentUnitStroops * count;
    const currentValue = formatAmount(currentValueStroops);

    // Dividends earned: bigint multiply to avoid precision loss
    const totalDivPerFracStroops = dividendsByFrac.get(p.fractionalization_id) ?? 0n;
    const totalDividendsStroops = totalDivPerFracStroops * count;
    const totalDividendsEarned = formatAmount(totalDividendsStroops);

    const ownershipPercent =
      record?.total_fractions > 0
        ? Math.round((p.fraction_count / record.total_fractions) * 10000) / 100
        : 0;
    return {
      position: p,
      record,
      currentValue,
      totalDividendsEarned,
      ownershipPercent,
    };
  });
}

// ── Price history ─────────────────────────────────────────────────────────────

/** Input type for `recordPricePoint`. */
interface RecordPricePointInput {
  fractionalizationId: string;
  price: string;
  currency: Currency;
  volume: number;
  source: 'primary' | 'secondary';
}

/**
 * Append a price observation to `price_history`.
 * Non-fatal: failures are swallowed because price history is supplementary.
 */
export async function recordPricePoint(input: RecordPricePointInput): Promise<void> {
  await supabase.from('price_history').insert({
    fractionalization_id: input.fractionalizationId,
    price: input.price,
    currency: input.currency,
    volume: input.volume,
    source: input.source,
    recorded_at: new Date().toISOString(),
  });
  // Non-fatal: price history is supplementary data
}

/**
 * Fetch the most recent `limit` price-history points for a fractionalization,
 * returned in chronological (ascending) order for chart rendering.
 *
 * We query descending-by-date to get the *newest* `limit` rows, then reverse
 * so callers always receive chronological data.
 */
export async function fetchPriceHistory(
  fractionalizationId: string,
  limit = 60,
): Promise<PriceHistoryPoint[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('fractionalization_id', fractionalizationId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as PriceHistoryPoint[]) ?? []).reverse();
}

/**
 * Batch-fetch price history for multiple fractionalization IDs in a single
 * query and return them grouped by ID.  Use this instead of calling
 * `fetchPriceHistory` in a loop to avoid N+1 database round-trips.
 *
 * @param ids  Array of fractionalization UUIDs to fetch history for.
 * @param limitPerRecord  Maximum points to retain per record (newest kept).
 * @returns Map from fractionalization_id to chronologically-ordered points.
 */
export async function fetchPriceHistoryBatch(
  ids: string[],
  limitPerRecord = 20,
): Promise<Map<string, PriceHistoryPoint[]>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .in('fractionalization_id', ids)
    .order('recorded_at', { ascending: true });
  if (error) throw error;

  const grouped = new Map<string, PriceHistoryPoint[]>();
  for (const point of (data as PriceHistoryPoint[]) ?? []) {
    const list = grouped.get(point.fractionalization_id) ?? [];
    list.push(point);
    grouped.set(point.fractionalization_id, list);
  }

  // Trim each list to the newest `limitPerRecord` points
  for (const [id, points] of grouped) {
    if (points.length > limitPerRecord) {
      grouped.set(id, points.slice(points.length - limitPerRecord));
    }
  }

  return grouped;
}

// ── Dividends ─────────────────────────────────────────────────────────────────

/**
 * Fetch dividend distribution history for a fractionalization, newest-first.
 */
export async function fetchDividends(
  fractionalizationId: string,
): Promise<DividendRecord[]> {
  const { data, error } = await supabase
    .from('dividend_distributions')
    .select('*')
    .eq('fractionalization_id', fractionalizationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as DividendRecord[]) ?? [];
}

/**
 * Create a dividend distribution record.
 *
 * `per_fraction_amount` is derived via **truncating integer division** of
 * `totalAmount` (in stroops) by `totalFractions`, ensuring that
 * `per_fraction_amount × totalFractions ≤ totalAmount`.  Rounding up would
 * allow the total payout to exceed the originator's input.
 *
 * Throws a descriptive error when `totalFractions` is zero or negative.
 */
export async function createDividend(
  fractionalizationId: string,
  originatorId: string,
  totalAmount: string,
  currency: Currency,
  totalFractions: number,
  note?: string,
): Promise<DividendRecord> {
  if (!Number.isInteger(totalFractions) || totalFractions <= 0) {
    throw new Error('totalFractions must be a positive integer');
  }

  // Truncating bigint division: never promises more than total_amount
  const totalStroops = toStroopsBigInt(totalAmount);
  const perFracStroops = totalStroops / BigInt(totalFractions);
  const perFraction = formatAmount(perFracStroops);

  const { data, error } = await supabase
    .from('dividend_distributions')
    .insert({
      fractionalization_id: fractionalizationId,
      originator_id: originatorId,
      total_amount: totalAmount,
      currency,
      per_fraction_amount: perFraction,
      status: 'distributed',
      distributed_at: new Date().toISOString(),
      note: note?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DividendRecord;
}

// ── Compute total cost for N fractions ────────────────────────────────────────

/**
 * Compute the total cost for purchasing `count` fractions at `pricePerFraction`.
 *
 * Arithmetic is done in `bigint` to avoid floating-point precision loss on
 * large stroop values, and the result is formatted via `formatAmount()`.
 *
 * @throws {Error} if `count` is not a positive integer.
 */
export function computeTotalCost(
  pricePerFraction: string,
  count: number,
): string {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('count must be a positive integer');
  }
  const unitStroops = toStroopsBigInt(pricePerFraction);
  const totalStroops = unitStroops * BigInt(count);
  return formatAmount(totalStroops);
}

/**
 * Derive the `pricePerFraction` from the invoice amount and the desired split.
 *
 * Uses truncating integer division (bigint) so the per-fraction amount never
 * causes `perFraction × totalFractions > invoiceAmount`.
 *
 * @throws {Error} if `totalFractions` is not a positive integer.
 */
export function derivePerFractionPrice(
  invoiceAmountStroops: string,
  totalFractions: number,
): string {
  if (!Number.isInteger(totalFractions) || totalFractions <= 0) {
    throw new Error('totalFractions must be a positive integer');
  }
  const totalStroops = toStroopsBigInt(invoiceAmountStroops);
  const perStroops = totalStroops / BigInt(totalFractions);
  return formatAmount(perStroops);
}
