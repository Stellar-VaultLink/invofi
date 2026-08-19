'use client';

/**
 * useMatchedInvoices
 *
 * Fetches Pending invoices from Supabase, loads originator history from the
 * financing_offers mirror, runs the matching algorithm, and returns a sorted
 * list of MatchResult values.
 *
 * The hook caches the raw invoice + history queries via TanStack Query so
 * repeated renders don't re-fetch; the matching computation is re-run
 * client-side whenever the preferences change (cheap pure-JS work).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { matchInvoices } from '@/lib/matching';
import { QUERY_STALE_TIME } from '@/lib/constants';
import type { Invoice } from '@/types';
import type { LenderPreferences, MatchResult, OriginatorHistory } from '@/types/matching';

const supabase = createClient();

// ── Raw data fetchers ─────────────────────────────────────────────────────────

async function fetchPendingInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'Pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Invoice[];
}

async function fetchOriginatorHistory(): Promise<Map<string, OriginatorHistory>> {
  // Pull all non-Pending offers and group by originator via the joined invoice
  const { data, error } = await supabase
    .from('financing_offers')
    .select('status, invoices(originator)')
    .in('status', ['Repaid', 'Defaulted', 'Financed']);

  if (error) throw error;

  const map = new Map<string, OriginatorHistory>();

  for (const row of data ?? []) {
    // Supabase may return the joined relation as an object OR an array depending
    // on the inferred type. Normalise to a single object either way.
    const rawInv = row.invoices as
      | { originator: string }
      | { originator: string }[]
      | null;
    const inv = Array.isArray(rawInv) ? (rawInv[0] ?? null) : rawInv;
    if (!inv?.originator) continue;

    const addr = inv.originator;
    const existing = map.get(addr) ?? {
      originatorAddress: addr,
      totalOffers: 0,
      repaidOffers: 0,
      defaultedOffers: 0,
    };

    existing.totalOffers++;
    if (row.status === 'Repaid') existing.repaidOffers++;
    if (row.status === 'Defaulted') existing.defaultedOffers++;

    map.set(addr, existing);
  }

  return map;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseMatchedInvoicesOptions {
  /** Maximum results. Defaults to 20. */
  limit?: number;
  /**
   * Minimum score 0–100. Results below this threshold are excluded.
   * Defaults to 1 (show everything that scores > 0).
   */
  minScore?: number;
}

interface UseMatchedInvoicesReturn {
  matches: MatchResult[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Total number of Pending invoices before matching filter. */
  totalInvoices: number;
}

export function useMatchedInvoices(
  preferences: LenderPreferences,
  opts: UseMatchedInvoicesOptions = {},
): UseMatchedInvoicesReturn {
  const { limit = 20, minScore = 1 } = opts;

  const invoicesQuery = useQuery({
    queryKey: ['matched-invoices', 'pending'],
    queryFn: fetchPendingInvoices,
    staleTime: QUERY_STALE_TIME,
  });

  const historyQuery = useQuery({
    queryKey: ['originator-history'],
    queryFn: fetchOriginatorHistory,
    staleTime: QUERY_STALE_TIME * 2, // history changes less often
  });

  const matches = useMemo<MatchResult[]>(() => {
    const invoices = invoicesQuery.data ?? [];
    const history = historyQuery.data ?? new Map();

    if (invoices.length === 0) return [];

    return matchInvoices(invoices, preferences, history, { limit, minScore });
  }, [invoicesQuery.data, historyQuery.data, preferences, limit, minScore]);

  const isLoading = invoicesQuery.isLoading || historyQuery.isLoading;
  const isError = invoicesQuery.isError || historyQuery.isError;
  const error = (invoicesQuery.error ?? historyQuery.error) as Error | null;

  return {
    matches,
    isLoading,
    isError,
    error,
    totalInvoices: invoicesQuery.data?.length ?? 0,
  };
}
