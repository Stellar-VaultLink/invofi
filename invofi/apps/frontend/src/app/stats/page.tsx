// Public protocol stats (Task 14). Reads the indexer's aggregate row
// (`protocol_stats`, id=1) written by apps/indexer on a 6-hour schedule.
// The table has a public-read RLS policy, so this page works without auth.
// See invofi/apps/indexer/README.md for the schema and pipeline.
//
// ISR (issue #149): this page is Incremental Static Regeneration — the
// server renders it once and revalidates every `revalidate` seconds, so the
// RPC/Supabase load from public crawlers is bounded. The render is
// server-side only (`no-store` semantics via the Supabase anon client);
// the interactive refresh button lives in StatsRefreshButton and re-runs
// the server component via router.refresh().

import Link from 'next/link';
import {
  FileText,
  TrendingUp,
  Percent,
  Users,
  ShieldCheck,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { StatsCard } from '@/components/common/StatsCard';
import { StatsGrid } from '@/components/common/StatsGrid';
import StatsRefreshButton from './StatsRefreshButton';
import { formatAmount } from '@/lib/formatters';

export const revalidate = 60;

interface ProtocolStats {
  id: number;
  total_invoices: number;
  total_offers: number;
  invoices_financed: number;
  total_volume: string;
  total_repaid: string;
  repayment_rate: number;
  active_lenders: number;
  defaulted_invoices: number;
  insurance_pool: string;
  last_ledger: number;
  updated_at?: string;
}

/** ISO date → display string. */
function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/**
 * Fetch the aggregate protocol stats row with the anon key only.
 *
 * The `protocol_stats` table has a public-read RLS policy, so the data can be
 * fetched server-side at build/ISR time without any authenticated session.
 * Deliberately NOT using the cookies-based server client (utils/supabase/server)
 * — that reads `cookies()` and would opt every page into dynamic rendering.
 */
async function fetchProtocolStats(): Promise<{
  stats: ProtocolStats | null;
  error: string | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    // Graceful offline/CI degradation — same outcome as the old client fetch
    // before env vars are wired up: render the "no stats" empty state.
    return { stats: null, error: null };
  }

  const supabase = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('protocol_stats')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return { stats: null, error: error.message };
  }
  return { stats: (data as ProtocolStats | null) ?? null, error: null };
}

export default async function StatsPage() {
  const { stats, error } = await fetchProtocolStats();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Protocol Stats</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live aggregates from the InvoFi indexer — updated every 6 hours from
            Soroban on-chain events and contract state.
          </p>
        </div>
        <StatsRefreshButton />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Could not load stats</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            {error}. Is the <code className="font-mono">protocol_stats</code> table set up?
            See <Link href="https://github.com/Stellar-VaultLink/invofi/tree/main/invofi/apps/indexer" target="_blank" rel="noreferrer" className="underline">apps/indexer README</Link>.
          </p>
        </div>
      )}

      {!error && stats === null && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">No stats yet — the indexer hasn&apos;t written its first row.</p>
          <p className="text-xs text-muted-foreground">
            It runs on a 6-hour schedule and on demand via{' '}
            <code className="font-mono">workflow_dispatch</code> in the indexer workflow.
          </p>
        </div>
      )}

      {!error && stats && (
        <>
          <StatsGrid columns={4}>
            <StatsCard
              title="Invoices Financed"
              value={stats.invoices_financed}
              icon={FileText}
              description="Offers accepted on-chain"
            />
            <StatsCard
              title="Total Volume"
              value={formatAmount(stats.total_volume)}
              icon={TrendingUp}
              description="Financed principal (on-chain total_financed)"
            />
            <StatsCard
              title="Repayment Rate"
              value={`${(stats.repayment_rate * 100).toFixed(1)}%`}
              icon={Percent}
              description="Repaid / financed volume"
            />
            <StatsCard
              title="Active Lenders"
              value={stats.active_lenders}
              icon={Users}
              description="Unique lenders with accepted offers"
            />
            <StatsCard
              title="Total Invoices"
              value={stats.total_invoices}
              icon={Layers}
              description="Registered on-chain"
            />
            <StatsCard
              title="Total Offers"
              value={stats.total_offers}
              icon={FileText}
              description="Created across all invoices"
            />
            <StatsCard
              title="Insurance Pool"
              value={formatAmount(stats.insurance_pool)}
              icon={ShieldCheck}
              description="Staked by insurance providers"
            />
            <StatsCard
              title="Defaulted"
              value={stats.defaulted_invoices}
              icon={AlertTriangle}
              description="Repaid via default path"
            />
          </StatsGrid>

          <p className="mt-6 text-xs text-muted-foreground">
            On-chain verified at ledger{' '}
            <span className="font-mono">{stats.last_ledger.toLocaleString()}</span>
            {' · '}last indexed {formatDate(stats.updated_at)}.
          </p>
        </>
      )}
    </div>
  );
}