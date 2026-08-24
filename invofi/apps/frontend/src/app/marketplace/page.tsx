'use client';

import { useMemo } from 'react';
import { Search, LayoutGrid } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Input } from '@/components/ui/input';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceTabs } from '@/components/marketplace/MarketplaceTabs';
import { SuggestedMatches } from '@/components/marketplace/SuggestedMatches';
import { LenderPreferencesForm } from '@/components/marketplace/LenderPreferencesForm';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { useLenderPreferences } from '@/hooks/useLenderPreferences';
import { useMatchedInvoices } from '@/hooks/useMatchedInvoices';
import { useMarketplace } from '@/hooks/useMarketplace';
import type { Currency, Invoice, InvoiceStatus } from '@/types';

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
  const [filters, setFilters] = useLocalStorage<Filters>('marketplace-filters', { currency: 'ALL', status: 'ALL' });
  const [sort, setSort]       = useLocalStorage<SortKey>('marketplace-sort', 'newest');

  /**
   * View mode:
   *  'suggested' — show the AI-ranked matching results
   *  'all'       — show the traditional filtered/sorted list (override)
   */
  const [viewMode, setViewMode] = useState<'suggested' | 'all'>('suggested');

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
  const allInvoicesQuery = useMarketplace({
    currency: filters.currency !== 'ALL' ? filters.currency : undefined,
    search: search || undefined,
  });

  const allInvoices = allInvoicesQuery.data ?? [];

  const sortedAll = useMemo(() => {
    let list = allInvoices.filter(inv => {
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
  }, [allInvoices, filters.status, sort]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
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
        <div className="flex items-center gap-2 mb-5">
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
            onBrowseAll={() => setViewMode('all')}
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
                  placeholder="Search by invoice ID or originator…"
                  className="pl-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value as InvoiceStatus | 'ALL' }))}
              >
                <option value="ALL">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Financed">Financed</option>
                <option value="Overdue">Overdue</option>
              </select>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.currency}
                onChange={e => setFilters(f => ({ ...f, currency: e.target.value as Currency | 'ALL' }))}
              >
                <option value="ALL">All currencies</option>
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
                <p className="text-sm mt-1">Try adjusting the search or filters.</p>
              </div>
            )}

            {!allInvoicesQuery.isLoading && sortedAll.length > 0 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAll.map(inv => (
                  <MarketplaceCard key={inv.id} invoice={inv} />
                ))}
              </div>
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
