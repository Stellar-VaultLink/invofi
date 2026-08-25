'use client';

import { useEffect, useState } from 'react';
import {
  fetchInvoiceEvents,
  invoiceEventsEnabled,
  type InvoiceTimelineEntry,
} from '@/lib/invoiceEvents';

interface UseInvoiceEventsReturn {
  entries: InvoiceTimelineEntry[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the on-chain lifecycle events of one invoice for the detail-page
 * timeline. Fails soft: errors surface as a flag, entries stay empty.
 */
export function useInvoiceEvents(invoiceId: string | undefined): UseInvoiceEventsReturn {
  const [entries, setEntries] = useState<InvoiceTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId || !invoiceEventsEnabled()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchInvoiceEvents(invoiceId)
      .then(result => {
        if (!cancelled) setEntries(result);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  return { entries, loading, error };
}
