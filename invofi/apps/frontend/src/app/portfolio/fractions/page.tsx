'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Layers, Loader2 } from 'lucide-react';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { FractionalPositionCard } from '@/components/securitization/FractionalPositionCard';
import { DividendTracker } from '@/components/securitization/DividendTracker';
import { PriceHistoryChart } from '@/components/securitization/PriceHistoryChart';
import { supabase } from '@/lib/supabase';
import {
  fetchFractionalPositions,
  buildPositionViews,
  fetchPriceHistory,
} from '@/lib/securitization';
import type { FractionalPositionView } from '@/types/securitization';
import type { PriceHistoryPoint } from '@/types/securitization';

export default function FractionsPortfolioPage() {
  const [views, setViews] = useState<FractionalPositionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Map fractionalization_id → price history
  const [historyMap, setHistoryMap] = useState<Map<string, PriceHistoryPoint[]>>(new Map());
  // Which card is expanded for dividends
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const positions = await fetchFractionalPositions(user.id);
      const built = await buildPositionViews(positions);
      setViews(built);

      // Fetch price history for each unique fractionalization
      const ids = [...new Set(positions.map(p => p.fractionalization_id))];
      const entries = await Promise.all(
        ids.map(async id => [id, await fetchPriceHistory(id)] as [string, PriceHistoryPoint[]]),
      );
      setHistoryMap(new Map(entries));

      setLoading(false);
    })();
  }, []);

  // Aggregate stats
  const totalCurrentValue = views.reduce((s, v) => s + parseFloat(v.currentValue), 0);
  const totalDividends = views.reduce((s, v) => s + parseFloat(v.totalDividendsEarned), 0);
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
            href="/marketplace/positions"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Browse fractional marketplace →
          </Link>
        </div>

        {/* Summary stats */}
        {!loading && views.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Total est. value</p>
              <p className="text-2xl font-bold font-mono text-foreground">
                {totalCurrentValue.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">{views[0]?.position.purchase_currency}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Dividends earned</p>
              <p className="text-2xl font-bold font-mono text-green-700 dark:text-green-400">
                {totalDividends.toFixed(4)}
              </p>
              <p className="text-xs text-muted-foreground">across all positions</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Fractions held</p>
              <p className="text-2xl font-bold font-mono text-foreground">
                {totalFractions.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{views.length} position{views.length !== 1 ? 's' : ''}</p>
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
        {!loading && views.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No fractional positions yet.</p>
            <Link
              href="/marketplace/positions"
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
                <FractionalPositionCard view={view} />

                {/* Price chart for this fractionalization */}
                {historyMap.has(view.position.fractionalization_id) && (
                  <PriceHistoryChart
                    data={historyMap.get(view.position.fractionalization_id)!}
                    currency={view.position.purchase_currency}
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
