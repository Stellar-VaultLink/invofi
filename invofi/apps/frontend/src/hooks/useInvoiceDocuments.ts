import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { InvoiceDocument } from '@/types';

/**
 * Loads the access-controlled invoice documents for an invoice. RLS on
 * `invoice_documents` limits the result to invoice parties, so non-parties get
 * an empty list.
 */
export function useInvoiceDocuments(invoiceId: string) {
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('invoice_documents')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });
    if (queryError) {
      setError(queryError.message);
    } else {
      setDocuments((data as unknown as InvoiceDocument[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { documents, loading, error, refresh };
}