'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { FractionalizationWizard } from '@/components/securitization/FractionalizationWizard';
import { PriceHistoryChart } from '@/components/securitization/PriceHistoryChart';
import { DividendTracker } from '@/components/securitization/DividendTracker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import {
  fetchFractionalizationRecord,
  fetchPriceHistory,
  cancelFractionalization,
} from '@/lib/securitization';
import { formatAmount, INVOICE_STATUS_COLORS } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { Invoice } from '@/types';
import type { FractionalizationRecord, PriceHistoryPoint } from '@/types/securitization';

export default function SecuritizePage() {
  const params = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [record, setRecord] = useState<FractionalizationRecord | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [authError, setAuthError] = useState(false);

  const invoiceId = params?.invoiceId ?? '';

  useEffect(() => {
    if (!invoiceId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      setAuthError(false);
      try {
        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) { return; }
        setUserId(user.id);

        // Profile wallet
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('wallet_address')
          .eq('id', user.id)
          .maybeSingle();
        const wallet = (profile as { wallet_address: string | null } | null)?.wallet_address ?? null;
        if (!cancelled) setWalletAddress(wallet);

        // Fetch invoice
        const { data: invData, error: invErr } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .single();

        if (invErr || !invData) {
          if (!cancelled) setLoadError(invErr?.message ?? 'Invoice not found');
          return;
        }

        const inv = invData as Invoice;

        // Only the originator may access this page
        if ((invData as { originator_id?: string }).originator_id !== user.id) {
          if (!cancelled) setAuthError(true);
          return;
        }

        if (!cancelled) setInvoice(inv);

        // Existing fractionalization?
        const existing = await fetchFractionalizationRecord(invoiceId);
        if (cancelled) return;
        setRecord(existing);

        if (existing) {
          const ph = await fetchPriceHistory(existing.id);
          if (!cancelled) setPriceHistory(ph);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load invoice');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [invoiceId]);

  const handleComplete = async (newRecord: FractionalizationRecord) => {
    setRecord(newRecord);
    try {
      const ph = await fetchPriceHistory(newRecord.id);
      setPriceHistory(ph);
    } catch { /* price history is supplementary */ }
  };

  const handleCancel = async () => {
    if (!record) return;
    setCancelling(true);
    try {
      await cancelFractionalization(record.id);
      setRecord(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      toast({ title: 'Fractionalization cancelled', description: 'No new purchases can be made.' });
    } catch (err) {
      toast({
        title: 'Cancel failed',
        description: err instanceof Error ? err.message : 'Could not cancel',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href={invoice ? `/invoices/${invoice.id}` : '/dashboard'}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {invoice ? `Invoice ${invoice.id}` : 'Dashboard'}
        </Link>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invoice…
          </div>
        )}

        {/* Load error */}
        {!loading && loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to load invoice</p>
              <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
            </div>
          </div>
        )}

        {/* Auth error */}
        {!loading && authError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Access denied</p>
              <p className="text-xs text-muted-foreground mt-1">
                Only the invoice originator can fractionalize this invoice.
              </p>
            </div>
          </div>
        )}

        {/* Invoice not found (no error but no invoice) */}
        {!loading && !authError && !loadError && !invoice && (
          <p className="text-muted-foreground">Invoice not found.</p>
        )}

        {/* Main content */}
        {!loading && !authError && !loadError && invoice && (
          <>
            {/* Invoice summary */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Securitize Invoice</h1>
                <p className="text-muted-foreground text-sm mt-1 font-mono">{invoice.id}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold font-mono text-foreground">
                  {formatAmount(invoice.amount)} {invoice.currency}
                </p>
                <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>
              </div>
            </div>

            {/* Active fractionalization banner */}
            {record && record.status !== 'cancelled' && (
              <div className="mb-6 rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {record.token_symbol} · {record.total_fractions.toLocaleString()} fractions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {record.available_fractions.toLocaleString()} available ·{' '}
                      {record.price_per_fraction} {record.price_currency} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        record.status === 'active'
                          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800'
                          : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700'
                      }
                    >
                      {record.status}
                    </Badge>
                    {record.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="text-destructive hover:text-destructive"
                      >
                        {cancelling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Cancel'
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Price history chart */}
                {priceHistory.length > 0 && (
                  <PriceHistoryChart
                    data={priceHistory}
                    currency={record.price_currency}
                    height={100}
                  />
                )}

                {/* Dividend tracker */}
                {userId && (
                  <DividendTracker
                    record={record}
                    isOriginator
                    originatorId={userId}
                  />
                )}
              </div>
            )}

            {/* Wizard — only show if no active/sold_out fractionalization */}
            {(!record || record.status === 'cancelled') && userId && walletAddress && (
              <FractionalizationWizard
                invoice={invoice}
                originatorId={userId}
                originatorAddress={walletAddress}
                onComplete={handleComplete}
                onViewMarketplace={() => router.push('/marketplace/fractions')}
              />
            )}

            {(!record || record.status === 'cancelled') && (!userId || !walletAddress) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
                Link a Stellar wallet in{' '}
                <Link href="/settings" className="underline">settings</Link>{' '}
                before fractionalizing — buyers need your on-chain address.
              </div>
            )}
          </>
        )}
      </div>
    </AuthGuard>
  );
}
