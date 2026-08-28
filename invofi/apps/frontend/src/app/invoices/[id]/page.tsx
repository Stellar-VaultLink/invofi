'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { ReminderPanel } from '@/components/invoices/ReminderPanel';
import { MessagingPanel } from '@/components/invoices/MessagingPanel';
import { EventTimeline } from '@/components/invoices/EventTimeline';
import { SimulateConfirm } from '@/components/common/SimulateConfirm';
import { getInvoice, cancelInvoice, registerInvoice } from '@/lib/contract';
import {
  simulateContractCall,
  encodeSymbol,
  encodeAddress,
} from '@/lib/simulate';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { toErrorMessage } from '@/lib/errors';
import { formatAmount } from '@/lib/formatters';
import { formatDate, formatAddress, INVOICE_STATUS_COLORS, generateInvoiceId } from '@/lib/utils';
import { REGISTRY_CONTRACT_ID } from '@/lib/constants';
import type { Invoice, FinancingOffer } from '@/types';
import type { SimulationResult } from '@/lib/simulate';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [simCancel, setSimCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  // Counterparty address for the messaging panel.  Derived from the accepted
  // offer once offers are loaded: originator ↔ accepted lender.
  const [counterpartyAddress, setCounterpartyAddress] = useState<string>('');

  // Previews `cancel_invoice` against the current ledger. A missing invoice or
  // wallet is reported as a failed simulation so the dialog blocks submission
  // rather than silently broadcasting an unbuildable call.
  const simulateCancel = useCallback(async (): Promise<SimulationResult> => {
    if (!invoice || !publicKey) {
      return {
        success: false,
        error: 'Connect a wallet and load the invoice before cancelling.',
        tokenMovements: [],
        stateChanges: [],
        events: [],
        resourceFee: '0',
        latestLedger: 0,
      };
    }
    return simulateContractCall(
      REGISTRY_CONTRACT_ID,
      'cancel_invoice',
      [encodeSymbol(invoice.id), encodeAddress(publicKey)],
      publicKey,
    );
  }, [invoice, publicKey]);

  const handleCancel = async () => {
    if (!invoice || !publicKey) return;
    setCancelling(true);
    // Capture the invoice data before cancelling so we can re-register on undo.
    const cancelledInvoice = invoice;
    try {
      const updated = await cancelInvoice(invoice.id, publicKey);
      await supabase.from('invoices').update({ status: 'Cancelled' }).eq('id', invoice.id);
      setInvoice(updated);
      toast({
        title: 'Invoice cancelled',
        description: 'The invoice is now cancelled on-chain.',
        action: (
          <ToastAction
            altText="Undo cancel"
            onClick={async () => {
              try {
                const newId = generateInvoiceId();
                const restored = await registerInvoice(
                  {
                    id: newId,
                    amount: cancelledInvoice.amount,
                    currency: cancelledInvoice.currency,
                    dueDate: Number(cancelledInvoice.due_date),
                  },
                  publicKey,
                );
                await supabase.from('invoices').insert({
                  id: newId,
                  originator: publicKey,
                  amount: cancelledInvoice.amount,
                  currency: cancelledInvoice.currency,
                  due_date: new Date(Number(cancelledInvoice.due_date) * 1000).toISOString(),
                  status: 'Pending',
                });
                setInvoice(restored);
                toast({ title: 'Invoice restored', description: 'A new invoice with the same terms has been created.' });
              } catch (undoErr: unknown) {
                toast({
                  title: 'Failed to restore invoice',
                  description: toErrorMessage(undoErr, 'Error'),
                  variant: 'destructive',
                });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (err: unknown) {
      toast({
        title: 'Failed to cancel invoice',
        description: toErrorMessage(err, 'Error'),
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
                      onClick={() => setSimCancel(true)}
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
                <Field label="Amount" value={formatAmount(invoice.amount, invoice.currency)} mono />
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

            {/* Due-date reminder history + opt-out (originator only, via RLS) */}
            {publicKey === invoice.originator && <ReminderPanel invoice={invoice} />}

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

        {/* ── Simulation confirmation for cancel ──────────────────────── */}
        <SimulateConfirm
          open={simCancel}
          onOpenChange={open => { if (!open) setSimCancel(false); }}
          title="Preview: Cancel Invoice"
          description="Review the expected effects before cancelling this invoice on-chain."
          onSimulate={simulateCancel}
          variant="destructive"
          confirmLabel="Cancel Invoice"
          holdToConfirm
          // Returned so `SimulateConfirm` can await the submission and keep
          // its "Submitting…" state up while the wallet signs.
          onConfirm={() => {
            setSimCancel(false);
            return handleCancel();
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
