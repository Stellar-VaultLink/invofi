'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { useEventSubscription, type ConnectionStatus } from './useEventSubscription';
import type { Invoice } from '@/types';

const supabase = createClient();

/**
 * Real-time invoice status with automatic fallback to polling.
 *
 * When the event subscription is connected, React Query caches are
 * invalidated on each incoming event so the UI stays current without
 * extra polling. When disconnected, a standard refetchInterval keeps
 * data fresh.
 */
export function useRealtimeInvoices(originatorId?: string) {
  const { status: connStatus, eventCount, lastEvent } = useEventSubscription();
  const queryClient = useQueryClient();

  const isLive = connStatus === 'connected';

  // When live, disable refetchInterval (events handle cache invalidation).
  // When offline, poll every 15 seconds as fallback.
  const refetchInterval = isLive ? false : 15_000;

  const query = useQuery({
    queryKey: ['invoices', originatorId],
    queryFn: async () => {
      let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (originatorId) query = query.eq('originator_id', originatorId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Invoice[];
    },
    refetchInterval,
  });

  return {
    ...query,
    connectionStatus: connStatus,
    eventCount,
    lastEvent,
  };
}

/**
 * Single invoice with real-time updates.
 */
export function useRealtimeInvoice(id: string) {
  const { status: connStatus, eventCount, lastEvent } = useEventSubscription();

  const isLive = connStatus === 'connected';
  const refetchInterval = isLive ? false : 15_000;

  const query = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Invoice;
    },
    enabled: !!id,
    refetchInterval,
  });

  return {
    ...query,
    connectionStatus: connStatus,
    eventCount,
    lastEvent,
  };
}
