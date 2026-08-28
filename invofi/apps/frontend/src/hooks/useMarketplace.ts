import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import type { Invoice } from '@/types';

const supabase = createClient();

interface MarketplaceFilters {
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

const PAGE_SIZE = 12;

export interface MarketplacePage {
  invoices: Invoice[];
  nextOffset: number | null;
}

export function useMarketplace(filters: MarketplaceFilters = {}) {
  return useInfiniteQuery<MarketplacePage>({
    queryKey: ['marketplace', filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;

      let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filters.currency) query = query.eq('currency', filters.currency);
      if (filters.search) query = query.ilike('id', `%${filters.search}%`);

      const { data, error, count } = await query;
      if (error) throw error;

      let results = data as Invoice[];
      if (filters.minAmount) results = results.filter(i => Number(i.amount) >= filters.minAmount!);
      if (filters.maxAmount) results = results.filter(i => Number(i.amount) <= filters.maxAmount!);

      const hasMoreDbRows = data.length === PAGE_SIZE;
      const reachedEnd =
        !hasMoreDbRows || (count !== null && offset + PAGE_SIZE >= count);

      return {
        invoices: results,
        nextOffset: reachedEnd ? null : offset + PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}
