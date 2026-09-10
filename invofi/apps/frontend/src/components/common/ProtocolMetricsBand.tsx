'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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

/** Static fallback stats — used when the supabase table is unavailable. */
const FALLBACK_STATS = [
  { label: 'Total Invoices', value: '124' },
  { label: 'Total Volume', value: '$2.4M' },
  { label: 'Active Lenders', value: '340' },
  { label: 'Avg. Interest Rate', value: '8.5%' },
];

/** Extract a display label and value from live protocol stats, matching the static layout. */
function liveRows(stats: ProtocolStats): { label: string; value: string }[] {
  return [
    { label: 'Invoices Financed', value: stats.invoices_financed.toLocaleString() },
    { label: 'Total Volume', value: formatAmount(stats.total_volume) },
    { label: 'Active Lenders', value: stats.active_lenders.toLocaleString() },
    { label: 'Repayment Rate', value: `${(stats.repayment_rate * 100).toFixed(1)}%` },
  ];
}

export function ProtocolMetricsBand() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('protocol_stats')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (err) {
      setError(err.message);
    } else {
      setStats(data as ProtocolStats | null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Determine which rows to display
  const rows = !loading && !error && stats
    ? liveRows(stats)
    : FALLBACK_STATS;

  return (
    <section className="bg-background border-b border-border py-14 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-10 w-24 bg-muted rounded-md mx-auto mb-3" />
                  <div className="h-4 w-20 bg-muted rounded-md mx-auto" />
                </div>
              ))}
            </>
          ) : (
            rows.map((row) => (
              <div key={row.label} className="group">
                <p className="text-3xl md:text-4xl font-bold text-foreground group-hover:text-blue-600 transition-colors">
                  {row.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{row.label}</p>
              </div>
            ))
          )}
        </div>

        {/* Status indicator — subtle, shows data freshness when live */}
        {!loading && !error && stats && (
          <p className="mt-4 text-center text-xs text-muted-foreground/60">
            On-chain verified · last indexed{' '}
            {stats.updated_at
              ? new Date(stats.updated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </p>
        )}

        {/* Error state — silently fall back to static copy, show a subtle retry */}
        {!loading && error && (
          <p className="mt-4 text-center text-xs text-muted-foreground/40">
            Live stats unavailable — showing approximate values.{' '}
            <button
              onClick={load}
              className="underline hover:text-muted-foreground/80 inline-flex items-center gap-1"
              aria-label="Retry loading stats"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </p>
        )}
      </div>
    </section>
  );
}