'use client';

// Public protocol stats (Task 14). Reads the indexer's aggregate row
// (`protocol_stats`, id=1) written by apps/indexer on a 6-hour schedule.
// The table has a public-read RLS policy, so this page works without auth.
// See invofi/apps/indexer/README.md for the schema and pipeline.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  TrendingUp,
  Percent,
  Users,
  ShieldCheck,
  Layers,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { StatsCard } from '@/components/common/StatsCard';
import { StatsGrid } from '@/components/common/StatsGrid';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/lib/formatters';

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

export default function StatsPage() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('protocol_stats').select('*').eq('id', 1).maybeSingle();
    if (error) {
      setError(error.message);
    } else {
      setStats((data as ProtocolStats | null) ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
          title="Refresh"
          aria-label="Refresh stats"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <CardSkeleton key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Could not load stats</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            {error}. Is the <code className="font-mono">protocol_stats</code> table set up?
            See <Link href="https://github.com/Stellar-VaultLink/invofi/tree/main/invofi/apps/indexer" target="_blank" rel="noreferrer" className="underline">apps/indexer README</Link>.
          </p>
        </div>
      )}

      {!loading && !error && stats === null && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">No stats yet — the indexer hasn&apos;t written its first row.</p>
          <p className="text-xs text-muted-foreground">
            It runs on a 6-hour schedule and on demand via{' '}
            <code className="font-mono">workflow_dispatch</code> in the indexer workflow.
          </p>
        </div>
      )}

      {!loading && !error && stats && (
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
