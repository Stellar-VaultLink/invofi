'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { supabase } from '@/lib/supabase';
import type { Currency, Invoice } from '@/types';

type Filters = { currency: Currency | 'ALL'; minAmount: string; maxAmount: string };

export default function MarketplacePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ currency: 'ALL', minAmount: '', maxAmount: '' });

  useEffect(() => {
    setLoading(true);
    supabase
      .from('invoices')
      .select('*')
      .eq('status', 'Pending')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setInvoices((data as unknown as Invoice[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = invoices.filter(inv => {
    if (filters.currency !== 'ALL' && inv.currency !== filters.currency) return false;
    if (search && !inv.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Invoice Marketplace</h1>
          <p className="text-gray-500 text-sm mt-1">
            Browse invoices available for financing and submit offers to earn yield.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by invoice ID…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={filters.currency}
            onChange={e => setFilters(f => ({ ...f, currency: e.target.value as Currency | 'ALL' }))}
          >
            <option value="ALL">All currencies</option>
            <option value="XLM">XLM</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium">No invoices available right now</p>
            <p className="text-sm mt-1">Check back soon — businesses are adding new invoices.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(inv => (
            <MarketplaceCard key={inv.id} invoice={inv} />
          ))}
        </div>
      </div>
    </AuthGuard>
  );
}
