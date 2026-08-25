'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Search, LayoutGrid, X } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceTabs } from '@/components/marketplace/MarketplaceTabs';
import { SuggestedMatches } from '@/components/marketplace/SuggestedMatches';
import { LenderPreferencesForm } from '@/components/marketplace/LenderPreferencesForm';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { useLenderPreferences } from '@/hooks/useLenderPreferences';
import { useMatchedInvoices } from '@/hooks/useMatchedInvoices';
import { useMarketplace } from '@/hooks/useMarketplace';
import type { Currency, Invoice, InvoiceStatus } from '@/types';

// ── Render cap ───────────────────────────────────────────────────────────────
const INITIAL_RENDER_CAP = 24;
const CAP_INCREMENT = 24;

// ── Query client for the matching hooks ──────────────────────────────────────
// The marketplace page currently uses raw useState + supabase. The matching
// engine needs TanStack Query. We mount a scoped QueryClient here so this page
// can adopt it incrementally without touching the root layout.

const queryClient = new QueryClient();

// ── Types ─────────────────────────────────────────────────────────────────────

type Filters = { currency: Currency | 'ALL'; status: InvoiceStatus | 'ALL' };
type SortKey = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc' | 'due_soonest';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',      label: 'Newest first' },
  { value: 'oldest',      label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc',  label: 'Amount: low to high' },
  { value: 'due_soonest', label: 'Due date: soonest' },
];

// ── Inner page (needs query context) ─────────────────────────────────────────

function MarketplacePageInner() {
  const [search, setSearch]   = useState('');
  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);
  const handleViewModeChange = useCallback((mode: 'suggested' | 'all') => {
    setViewMode(mode);
  }, []);
  const [filters, setFilters] = useState<Filters>({ currency: 'ALL', status: 'ALL' });
  const [sort, setSort]       = useState<SortKey>('newest');

  /**
   * View mode:
   *  'suggested' — show the AI-ranked matching results
   *  'all'       — show the traditional filtered/sorted list (override)
   */
  const [viewMode, setViewMode] = useState<'suggested' | 'all'>('suggested');
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_CAP);

  // ── Preferences ────────────────────────────────────────────────────────────
  const {
    preferences,
    save: savePreferences,
    reset: resetPreferences,
    loading: prefsLoading,
  } = useLenderPreferences();

  // ── Matching engine ────────────────────────────────────────────────────────
  const { matches, isLoading: matchesLoading, isError, totalInvoices } = useMatchedInvoices(
    preferences,
    { limit: 24 },
  );

  // ── All-invoices query (for override / "browse all" view) ─────────────────
  const debouncedSearch = useDebounce(search, 300);
  const allInvoicesQuery = useMarketplace({
    currency: filters.currency !== 'ALL' ? filters.currency : undefined,
  });

  const allInvoices = allInvoicesQuery.data ?? [];

  const filteredBySearch = useMemo(() => {
    if (!debouncedSearch) return allInvoices;
    const q = debouncedSearch.toLowerCase();
    return allInvoices.filter(inv =>
      inv.id.toLowerCase().includes(q) ||
      inv.originator.toLowerCase().includes(q) ||
      // @ts-expect-error — debtor_name may exist in the DB row even if not in the TS type
      (inv as Record<string, unknown>).debtor_name?.toString().toLowerCase().includes(q)
    );
  }, [allInvoices, debouncedSearch]);

  const sortedAll = useMemo(() => {
    let list = filteredBySearch.filter(inv => {
      if (filters.status !== 'ALL' && inv.status !== filters.status) return false;
      return true;
    });

    return [...list].sort((a: Invoice, b: Invoice) => {
      switch (sort) {
        case 'oldest':      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        case 'amount_desc': return Number(b.amount) - Number(a.amount);
        case 'amount_asc':  return Number(a.amount) - Number(b.amount);
        case 'due_soonest': return a.due_date - b.due_date;
        case 'newest':
        default:            return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
    });
  }, [filteredBySearch, filters.status, sort]);

  const visibleInvoices = useMemo(() => sortedAll.slice(0, visibleCount), [sortedAll, visibleCount]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Invoice Marketplace',
              description:
                'Browse invoices available for financing and submit offers to earn yield on the InvoFi marketplace.',
              url: 'https://invofi-five.vercel.app/marketplace',
              itemListElement: [],
              numberOfItems: 0,
            }),
          }}
        />

        {/* Page header */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoice Marketplace</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Browse invoices available for financing and submit offers to earn yield.
            </p>
          </div>

          {/* Preferences button */}
          {!prefsLoading && (
            <LenderPreferencesForm
              preferences={preferences}
              onSave={savePreferences}
              onReset={resetPreferences}
            />
          )}
        </div>

        <MarketplaceTabs />

        {/* View toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => setViewMode('suggested')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              viewMode === 'suggested'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-pressed={viewMode === 'suggested'}
          >
            ✦ Suggested for me
          </button>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              viewMode === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-pressed={viewMode === 'all'}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Browse all
          </button>
        </div>

        {/* ── Suggested matches view ─────────────────────────────────────── */}
        {viewMode === 'suggested' && (
          <SuggestedMatches
            matches={matches}
            isLoading={matchesLoading}
            isError={isError}
            totalInvoices={totalInvoices}
            onBrowseAll={() => handleViewModeChange('all')}
          />
        )}

        {/* ── Browse-all view ────────────────────────────────────────────── */}
        {viewMode === 'all' && (
          <>
            {/* Filters bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice ID, debtor name, or originator…"
                  className="pl-9 pr-9"
                  value={search}
                  onChange={handleSearchChange}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <select
                className="w-full sm:w-auto h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value as InvoiceStatus | 'ALL' }))}
              >
                <option value="ALL">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Financed">Financed</option>
                <option value="Overdue">Overdue</option>
              </select>
              <select
                className="w-full sm:w-auto h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.currency}
                onChange={e => setFilters(f => ({ ...f, currency: e.target.value as Currency | 'ALL' }))}
              >
                <option value="ALL">All currencies</option>
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
              <select
                className="w-full sm:w-auto h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                aria-label="Sort invoices"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {allInvoicesQuery.isLoading && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
              </div>
            )}

            {!allInvoicesQuery.isLoading && sortedAll.length === 0 && (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-lg font-medium">No invoices match your filters</p>
                <p className="text-sm mt-1">Try adjusting the search query or filters.</p>
              </div>
            )}

            {!allInvoicesQuery.isLoading && sortedAll.length > 0 && (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleInvoices.map(inv => (
                    <MarketplaceCard key={inv.id} invoice={inv} />
                  ))}
                </div>
                {sortedAll.length > visibleCount && (
                  <div className="mt-6 text-center">
                    <Button
                      variant="outline"
                      onClick={() => setVisibleCount(c => c + CAP_INCREMENT)}
                    >
                      Show more ({sortedAll.length - visibleCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AuthGuard>
  );
}

// ── Exported page — wraps with QueryClientProvider ───────────────────────────

export default function MarketplacePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <MarketplacePageInner />
    </QueryClientProvider>
  );
}
