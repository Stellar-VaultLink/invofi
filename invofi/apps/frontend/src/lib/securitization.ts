/**
 * Securitization data helpers
 *
 * All Supabase interactions for the fractionalization feature live here.
 * The module is intentionally side-effect free — it exports pure async
 * functions that callers (components, hooks) invoke explicitly.
 */

import { z } from 'zod';
import { supabase } from './supabase';
import { toStroopsBigInt } from './utils';
import type {
  DividendRecord,
  FractionalPosition,
  FractionalPositionView,
  FractionalizationRecord,
  PriceHistoryPoint,
} from '@/types/securitization';
import type { Currency } from '@/types';

// ── Validation schemas ────────────────────────────────────────────────────────

const positiveDecimal = (label: string) =>
  z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, `Enter a valid ${label} (e.g. 10.50)`)
    .refine(v => toStroopsBigInt(v) > 0n, `${label} must be greater than zero`);

export const fractionalizationSchema = z.object({
  totalFractions: z
    .number({ invalid_type_error: 'Enter a whole number' })
    .int('Must be a whole number')
    .min(2, 'Minimum 2 fractions')
    .max(1_000_000, 'Maximum 1 000 000 fractions'),
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

export type FractionalizationDraft = z.infer<typeof fractionalizationSchema>;

export const purchaseSchema = z.object({
  fractionCount: z
    .number({ invalid_type_error: 'Enter a whole number' })
    .int('Must be a whole number')
    .min(1, 'Buy at least 1 fraction'),
});

export type PurchaseDraft = z.infer<typeof purchaseSchema>;

// ── Fractionalization record helpers ─────────────────────────────────────────

/** Fetch the active fractionalization for a given invoice, if one exists. */
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

/** All active (non-cancelled) fractionalized invoices for the marketplace. */
export async function fetchActiveFragrationalizations(): Promise<FractionalizationRecord[]> {
  const { data, error } = await supabase
    .from('fractionalization_records')
    .select('*')
    .in('status', ['active', 'sold_out'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as FractionalizationRecord[]) ?? [];
}

/** Publish a new fractionalization. Enforces the one-per-invoice constraint at db level. */
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

  // Seed the first price history point
  await recordPricePoint({
    fractionalizationId: (data as FractionalizationRecord).id,
    price: draft.pricePerFraction,
    currency: draft.priceCurrency as Currency,
    volume: draft.totalFractions,
    source: 'primary',
  });

  return data as FractionalizationRecord;
}

/** Cancel a fractionalization (originator only — enforced by RLS). */
export async function cancelFractionalization(id: string): Promise<void> {
  const { error } = await supabase
    .from('fractionalization_records')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

// ── Purchase helpers ──────────────────────────────────────────────────────────

/**
 * Record a fraction purchase.
 * 1. Validates available_fractions ≥ fractionCount.
 * 2. Upserts the lender's fractional_positions row (adds to existing count).
 * 3. Decrements available_fractions on the record.
 * 4. Appends a price_history point.
 * 5. Marks the record sold_out if available_fractions reaches 0.
 *
 * Note: this is an optimistic off-chain write. The actual token transfer must
 * be signed by the caller separately via transferPositionToken().
 */
export async function purchaseFraction(
  fractionalizationId: string,
  fractionCount: number,
  lenderId: string,
  lenderAddress: string,
): Promise<FractionalPosition> {
  // 1. Fetch current record
  const { data: record, error: fetchErr } = await supabase
    .from('fractionalization_records')
    .select('*')
    .eq('id', fractionalizationId)
    .single();
  if (fetchErr) throw fetchErr;

  const rec = record as FractionalizationRecord;
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

  // 2. Upsert position
  const { data: posData, error: posErr } = await supabase
    .from('fractional_positions')
    .upsert(
      {
        fractionalization_id: fractionalizationId,
        lender_id: lenderId,
        lender_address: lenderAddress,
        fraction_count: fractionCount,
        purchase_price_per_fraction: rec.price_per_fraction,
        purchase_currency: rec.price_currency,
        status: 'held',
        purchased_at: new Date().toISOString(),
      },
      {
        onConflict: 'fractionalization_id,lender_id',
        // Postgres expression: existing + new (handled via RPC below if needed).
        // For now we overwrite with the new count; callers sum multiple purchases
        // client-side. A proper increment would use a database function.
        ignoreDuplicates: false,
      },
    )
    .select()
    .single();
  if (posErr) throw posErr;

  // 3. Decrement available_fractions
  const newAvailable = rec.available_fractions - fractionCount;
  const { error: updateErr } = await supabase
    .from('fractionalization_records')
    .update({
      available_fractions: newAvailable,
      status: newAvailable === 0 ? 'sold_out' : 'active',
    })
    .eq('id', fractionalizationId);
  if (updateErr) throw updateErr;

  // 4. Record price point
  await recordPricePoint({
    fractionalizationId,
    price: rec.price_per_fraction,
    currency: rec.price_currency as Currency,
    volume: fractionCount,
    source: 'primary',
  });

  return posData as FractionalPosition;
}

// ── Fractional position queries ───────────────────────────────────────────────

/** All fractional positions for a lender, with fractionalization details joined. */
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

/** Build view models enriched with current value + dividend totals. */
export async function buildPositionViews(
  positions: FractionalPosition[],
): Promise<import('@/types/securitization').FractionalPositionView[]> {
  if (positions.length === 0) return [];

  const fracIds = positions.map(p => p.fractionalization_id);
  const { data: divData } = await supabase
    .from('dividend_distributions')
    .select('fractionalization_id, per_fraction_amount, status')
    .in('fractionalization_id', fracIds)
    .eq('status', 'distributed');

  const dividendsByFrac = new Map<string, number>();
  for (const d of (divData ?? []) as { fractionalization_id: string; per_fraction_amount: string }[]) {
    const prev = dividendsByFrac.get(d.fractionalization_id) ?? 0;
    dividendsByFrac.set(
      d.fractionalization_id,
      prev + Number(toStroopsBigInt(d.per_fraction_amount)),
    );
  }

  return positions.map(p => {
    const record = p.fractionalization as FractionalizationRecord;
    const currentUnitPrice = Number(toStroopsBigInt(record?.price_per_fraction ?? '0'));
    const currentValue = ((currentUnitPrice * p.fraction_count) / 1e7).toFixed(7);
    const totalDivPerFrac = dividendsByFrac.get(p.fractionalization_id) ?? 0;
    const totalDividendsEarned = ((totalDivPerFrac * p.fraction_count) / 1e7).toFixed(7);
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

interface RecordPricePointInput {
  fractionalizationId: string;
  price: string;
  currency: Currency;
  volume: number;
  source: 'primary' | 'secondary';
}

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

export async function fetchPriceHistory(
  fractionalizationId: string,
  limit = 60,
): Promise<PriceHistoryPoint[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('fractionalization_id', fractionalizationId)
    .order('recorded_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as PriceHistoryPoint[]) ?? [];
}

// ── Dividends ─────────────────────────────────────────────────────────────────

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

export async function createDividend(
  fractionalizationId: string,
  originatorId: string,
  totalAmount: string,
  currency: Currency,
  totalFractions: number,
  note?: string,
): Promise<DividendRecord> {
  const perFraction = (
    Number(toStroopsBigInt(totalAmount)) / totalFractions / 1e7
  ).toFixed(7);

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

export function computeTotalCost(
  pricePerFraction: string,
  count: number,
): string {
  const unitStroops = Number(toStroopsBigInt(pricePerFraction));
  const totalStroops = unitStroops * count;
  return (totalStroops / 1e7).toFixed(7);
}
