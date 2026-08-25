'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Layers, Loader2 } from 'lucide-react';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { FractionalPositionCard } from '@/components/securitization/FractionalPositionCard';
import { DividendTracker } from '@/components/securitization/DividendTracker';
import { PriceHistoryChart } from '@/components/securitization/PriceHistoryChart';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  fetchFractionalPositions,
  buildPositionViews,
  fetchPriceHistoryBatch,
} from '@/lib/securitization';
import type { FractionalPositionView } from '@/types/securitization';
import type { PriceHistoryPoint } from '@/types/securitization';
import type { Currency } from '@/types';

export default function FractionsPortfolioPage() {
  const [views, setViews] = useState<FractionalPositionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Map fractionalization_id → price history
  const [historyMap, setHistoryMap] = useState<Map<string, PriceHistoryPoint[]>>(new Map());
  // Which card is expanded for dividends
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) { setLoading(false); return; }

        const positions = await fetchFractionalPositions(user.id);
        if (cancelled) return;

        const built = await buildPositionViews(positions);
        if (cancelled) return;
        setViews(built);

        // Batch-fetch price history for all unique fractionalizations in one query
        const ids = [...new Set(positions.map(p => p.fractionalization_id))];
        if (ids.length > 0) {
          const histMap = await fetchPriceHistoryBatch(ids);
          if (!cancelled) setHistoryMap(histMap);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load fractional positions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Aggregate stats grouped by currency ──────────────────────────────────
  // Sum values and dividends per currency to avoid mixing USDC and XLM totals.
  const statsByCurrency = views.reduce<Record<string, { value: number; dividends: number }>>(
    (acc, v) => {
      const currency: Currency = v.record?.price_currency ?? v.position.purchase_currency;
      const bucket = acc[currency] ?? { value: 0, dividends: 0 };
      bucket.value    += parseFloat(v.currentValue);
      bucket.dividends += parseFloat(v.totalDividendsEarned);
      acc[currency] = bucket;
      return acc;
    },
    {},
  );

  const totalFractions = views.reduce((s, v) => s + v.position.fraction_count, 0);

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Back */}
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Portfolio
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Fractional Positions
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your fractional invoice token holdings, dividends, and price history.
            </p>
          </div>
          <Link
            href="/marketplace/fractions"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Browse fractional marketplace →
          </Link>
        </div>

        {/* Error state */}
        {loadError && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Failed to load positions</p>
              <p className="text-xs text-muted-foreground mt-0.5">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* Summary stats — per-currency to avoid mixing USDC + XLM */}
        {!loading && views.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            {Object.entries(statsByCurrency).map(([currency, stats]) => (
              <div key={currency} className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="text-xs text-muted-foreground mb-1">Est. value ({currency})</p>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {stats.value.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">{currency}</p>
              </div>
            ))}
            {Object.entries(statsByCurrency).map(([currency, stats]) => (
              stats.dividends > 0 ? (
                <div key={`div-${currency}`} className="rounded-xl border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">Dividends ({currency})</p>
                  <p className="text-2xl font-bold font-mono text-green-700 dark:text-green-400">
                    {stats.dividends.toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">earned</p>
                </div>
              ) : null
            ))}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Fractions held</p>
              <p className="text-2xl font-bold font-mono text-foreground">
                {totalFractions.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {views.length} position{views.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fractional positions…
          </div>
        )}

        {/* Empty */}
        {!loading && !loadError && views.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No fractional positions yet.</p>
            <Link
              href="/marketplace/fractions"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Browse fractionalized invoices →
            </Link>
          </div>
        )}

        {/* Position cards */}
        {!loading && views.length > 0 && (
          <div className="space-y-6">
            {views.map(view => (
              <div key={view.position.id} className="space-y-3">
                <FractionalPositionCard
                  view={view}
                  fractionalizationId={view.position.fractionalization_id}
                />

                {/* Price chart for this fractionalization */}
                {historyMap.has(view.position.fractionalization_id) && (
                  <PriceHistoryChart
                    data={historyMap.get(view.position.fractionalization_id)!}
                    currency={view.record?.price_currency ?? view.position.purchase_currency}
                    height={100}
                  />
                )}

                {/* Dividend accordion */}
                {view.record && (
                  <div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                      onClick={() =>
                        setExpanded(prev =>
                          prev === view.position.fractionalization_id
                            ? null
                            : view.position.fractionalization_id,
                        )
                      }
                    >
                      {expanded === view.position.fractionalization_id
                        ? '▲ Hide dividends'
                        : '▼ Show dividend history'}
                    </button>
                    {expanded === view.position.fractionalization_id && (
                      <div className="mt-3 rounded-xl border p-4 bg-card">
                        <DividendTracker
                          record={view.record}
                          positionFractions={view.position.fraction_count}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
