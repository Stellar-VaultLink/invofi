'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useWallet } from '@/components/auth/WalletProvider';
import { OfferList } from '@/components/invoices/OfferList';
import { InvoiceDocuments } from '@/components/invoices/documents/InvoiceDocuments';
import { MessagingPanel } from '@/components/invoices/MessagingPanel';
import { EventTimeline } from '@/components/invoices/EventTimeline';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getInvoice, cancelInvoice } from '@/lib/contract';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { formatAmount, formatDate, formatAddress, INVOICE_STATUS_COLORS } from '@/lib/utils';
import type { Invoice, FinancingOffer } from '@/types';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  // Counterparty address for the messaging panel.  Derived from the accepted
  // offer once offers are loaded: originator ↔ accepted lender.
  const [counterpartyAddress, setCounterpartyAddress] = useState<string>('');

  const handleCancel = async () => {
    if (!invoice || !publicKey) return;
    setCancelling(true);
    try {
      const updated = await cancelInvoice(invoice.id, publicKey);
      await supabase.from('invoices').update({ status: 'Cancelled' }).eq('id', invoice.id);
      setInvoice(updated);
      toast({ title: 'Invoice cancelled', description: 'The invoice is now cancelled on-chain.' });
    } catch (err: unknown) {
      toast({
        title: 'Failed to cancel invoice',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getInvoice(id)
      .then(setInvoice)
      .catch(e => {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (/403|unauthorized|forbidden|not authorized|access denied/i.test(errMsg)) {
          setIsUnauthorized(true);
        } else {
          setError(errMsg || 'Invoice not found');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Derive the counterparty address for messaging.
  // - If current user is the originator → counterparty is the lender from the accepted/financed offer.
  // - If current user is a lender → counterparty is the invoice originator.
  useEffect(() => {
    if (!id || !publicKey || !invoice) return;

    const isOriginator = publicKey === invoice.originator;

    if (!isOriginator) {
      // Current user is a lender; counterparty is always the originator.
      setCounterpartyAddress(invoice.originator);
      return;
    }

    // Current user is the originator; find the accepted/financed offer to get
    // the lender address.  Only invoices in Financed/Repaid/Overdue/Defaulted
    // states have an accepted offer.
    const financedStatuses = ['Financed', 'Repaid', 'Overdue', 'Defaulted', 'Disputed'];
    if (!financedStatuses.includes(invoice.status)) {
      setCounterpartyAddress('');
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from('financing_offers')
          .select('lender, status')
          .eq('invoice_id', id)
          .in('status', ['Accepted', 'Financed', 'Repaid', 'Defaulted'])
          .order('created_at', { ascending: false })
          .limit(1);
        const offer = (data as Pick<FinancingOffer, 'lender' | 'status'>[] | null)?.[0];
        setCounterpartyAddress(offer?.lender ?? '');
      } catch {
        setCounterpartyAddress('');
      }
    })();
  }, [id, publicKey, invoice]);

  return (
    <AuthGuard isUnauthorized={isUnauthorized}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* ── Nav bar ── */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>

          {invoice && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => window.open(`/invoices/${id}/print`, '_blank')}
            >
              <Printer className="h-4 w-4" />
              Print / Export PDF
            </Button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-red-500 font-medium">{error}</p>
          </div>
        )}

        {invoice && (
          <div className="space-y-6">
            {/* Invoice details */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <p className="text-xs font-mono text-gray-400 mb-1">{invoice.id}</p>
                  <CardTitle className="text-xl">Invoice</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
                    {invoice.status}
                  </Badge>
                  {invoice.status === 'Pending' && publicKey === invoice.originator && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmCancel(true)}
                      disabled={cancelling}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                      {cancelling && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      Cancel
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Amount" value={`${formatAmount(invoice.amount)} ${invoice.currency}`} mono />
                <Field label="Currency" value={invoice.currency} />
                <Field label="Due Date" value={formatDate(invoice.due_date)} />
                <Field
                  label="Originator"
                  value={formatAddress(invoice.originator)}
                  mono
                  link={`https://stellar.expert/explorer/testnet/account/${invoice.originator}`}
                />
              </CardContent>
            </Card>

            {/* Invoice proof documents */}
            <InvoiceDocuments invoice={invoice} />

            {/* Financing offers */}
            <OfferList invoiceId={id} invoice={invoice} onUpdate={setInvoice} />

            {/* On-chain lifecycle events (audit trail, reverse-chronological) */}
            <EventTimeline invoiceId={id} />

            {/* Private messaging — only shown when both parties are known */}
            {publicKey && counterpartyAddress && (
              <MessagingPanel
                invoiceId={id}
                currentAddress={publicKey}
                counterpartyAddress={counterpartyAddress}
                counterpartyLabel={
                  publicKey === invoice.originator ? 'Lender' : 'Business'
                }
              />
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={open => { if (!open) setConfirmCancel(false); }}
          title="Cancel this invoice?"
          description="The invoice will be cancelled on-chain and can no longer receive financing offers. This cannot be undone."
          confirmLabel="Cancel Invoice"
          variant="destructive"
          onConfirm={() => {
            setConfirmCancel(false);
            handleCancel();
          }}
        />
      </div>
    </AuthGuard>
  );
}

function Field({
  label,
  value,
  mono = false,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div>
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-mono"
        >
          {value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className={mono ? 'font-mono text-gray-800' : 'text-gray-800'}>{value}</p>
      )}
    </div>
  );
}
