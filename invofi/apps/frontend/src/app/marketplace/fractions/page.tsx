'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Layers, Tag } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MarketplaceTabs } from '@/components/marketplace/MarketplaceTabs';
import { PurchaseFractionModal } from '@/components/securitization/PurchaseFractionModal';
import { PriceHistoryChart } from '@/components/securitization/PriceHistoryChart';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import {
  fetchActiveFragrationalizations,
  fetchPriceHistory,
} from '@/lib/securitization';
import type { Currency } from '@/types';
import type { FractionalizationRecord, PriceHistoryPoint } from '@/types/securitization';

type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'available_desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',         label: 'Newest first' },
  { value: 'available_desc', label: 'Most available' },
  { value: 'price_asc',      label: 'Price: low to high' },
  { value: 'price_desc',     label: 'Price: high to low' },
];

// ── Single fractionalization card ─────────────────────────────────────────────

interface FracCardProps {
  record: FractionalizationRecord;
  history: PriceHistoryPoint[];
  userId: string | null;
  userAddress: string | null;
}

function FracCard({ record, history, userId, userAddress }: FracCardProps) {
  const soldPercent =
    record.total_fractions > 0
      ? Math.round(((record.total_fractions - record.available_fractions) / record.total_fractions) * 100)
      : 0;

  const isOwner = record.originator_id === userId;

  return (
    <Card className="flex flex-col hover:shadow-md transition-all">
      <CardContent className="pt-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-mono font-semibold text-sm text-foreground truncate">
                {record.token_symbol}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{record.token_name}</p>
          </div>
          <Badge
            variant="outline"
            className={
              record.status === 'active'
                ? 'bg-green-50 text-green-700 border-green-200 shrink-0'
                : 'bg-gray-50 text-gray-500 border-gray-200 shrink-0'
            }
          >
            {record.status === 'sold_out' ? 'Sold out' : record.status}
          </Badge>
        </div>

        {/* Economics */}
        <div className="space-y-2 flex-1 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price / fraction</span>
            <span className="font-semibold font-mono text-foreground">
              {record.price_per_fraction} {record.price_currency}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span className="font-mono text-foreground">
              {record.available_fractions.toLocaleString()} / {record.total_fractions.toLocaleString()}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${soldPercent}%` }}
              aria-label={`${soldPercent}% sold`}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right">{soldPercent}% sold</p>

          {/* Invoice link */}
          <p className="text-xs text-muted-foreground font-mono truncate">
            Invoice:{' '}
            <Link href={`/invoices/${record.invoice_id}`} className="text-blue-500 hover:underline">
              {record.invoice_id}
            </Link>
          </p>

          {record.description && (
            <p className="text-xs text-muted-foreground border-l-2 border-border pl-2 line-clamp-2">
              {record.description}
            </p>
          )}
        </div>

        {/* Sparkline */}
        {history.length > 0 && (
          <PriceHistoryChart
            data={history}
            currency={record.price_currency}
            height={60}
            className="mb-3"
          />
        )}

        {/* CTA */}
        <div className="flex gap-2">
          {isOwner ? (
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href={`/securitize/${record.invoice_id}`}>
                Manage
              </Link>
            </Button>
          ) : userId && userAddress ? (
            <PurchaseFractionModal
              record={record}
              lenderId={userId}
              lenderAddress={userAddress}
              onPurchased={() => {/* refetch handled by parent via key */}}
              trigger={
                <Button
                  size="sm"
                  className="w-full"
                  disabled={record.status !== 'active'}
                >
                  <Layers className="mr-1.5 h-3.5 w-3.5" />
                  {record.status === 'sold_out' ? 'Sold out' : 'Buy fractions'}
                </Button>
              }
            />
          ) : (
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/auth/login">Sign in to buy</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FractionsMarketplacePage() {
  const [records, setRecords] = useState<FractionalizationRecord[]>([]);
  const [historyMap, setHistoryMap] = useState<Map<string, PriceHistoryPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<Currency | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('newest');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: { user } }, recs] = await Promise.all([
        supabase.auth.getUser(),
        fetchActiveFragrationalizations(),
      ]);

      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('wallet_address')
          .eq('id', user.id)
          .maybeSingle();
        setUserAddress(
          (profile as { wallet_address: string | null } | null)?.wallet_address ?? null,
        );
      }

      setRecords(recs);

      // Fetch price history for all fracs in parallel
      const histEntries = await Promise.all(
        recs.map(async r => [r.id, await fetchPriceHistory(r.id, 20)] as [string, PriceHistoryPoint[]]),
      );
      setHistoryMap(new Map(histEntries));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter + sort
  const filtered = records.filter(r => {
    if (currencyFilter !== 'ALL' && r.price_currency !== currencyFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.token_symbol.toLowerCase().includes(q) ||
        r.token_name.toLowerCase().includes(q) ||
        r.invoice_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'available_desc':
        return b.available_fractions - a.available_fractions;
      case 'price_asc':
        return parseFloat(a.price_per_fraction) - parseFloat(b.price_per_fraction);
      case 'price_desc':
        return parseFloat(b.price_per_fraction) - parseFloat(a.price_per_fraction);
      case 'newest':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Fractional Invoice Tokens</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Buy fractions of financed invoices and earn a proportional share of yield and dividends.
          </p>
        </div>

        <MarketplaceTabs />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by token symbol, name, or invoice ID…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value as Currency | 'ALL')}
          >
            <option value="ALL">All currencies</option>
            <option value="XLM">XLM</option>
            <option value="USDC">USDC</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            aria-label="Sort fractions"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-lg font-medium text-muted-foreground">No fractionalized invoices yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Invoice owners can fractionalize from their dashboard.
            </p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(rec => (
              <FracCard
                key={rec.id}
                record={rec}
                history={historyMap.get(rec.id) ?? []}
                userId={userId}
                userAddress={userAddress}
              />
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
