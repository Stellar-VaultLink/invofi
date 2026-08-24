'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useWallet } from '@/components/auth/WalletProvider';
import { createOffer, acceptOffer, rejectOffer, repayInvoice, markOverdue, reclaimInvoice } from '@/lib/contract';
import { supabase } from '@/lib/supabase';
import { formatAmount, interestRateLabel, durationLabel, generateOfferId, amountToStroops, toStroopsBigInt, OFFER_STATUS_COLORS } from '@/lib/utils';
import { toCsv, downloadCsv } from '@/lib/csv';
import { GRACE_PERIOD_SECS, STROOPS_PER_XLM } from '@/lib/constants';
import { useToast } from '@/components/ui/use-toast';
import type { Currency, FinancingOffer, Invoice } from '@/types';

const offerSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount'),
  currency: z.enum(['XLM', 'USDC']),
  interestRate: z.coerce.number().min(1).max(5000),
  durationDays: z.coerce.number().int().min(1).max(365),
});

type OfferFormValues = z.infer<typeof offerSchema>;

interface OfferListProps {
  invoiceId: string;
  invoice: Invoice;
  onUpdate: (invoice: Invoice) => void;
}

export function OfferList({ invoiceId, invoice, onUpdate }: OfferListProps) {
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<
    { offer: FinancingOffer; kind: 'reject' | 'reclaim' } | null
  >(null);
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});

  const { register, handleSubmit, formState: { errors }, reset } = useForm<OfferFormValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: { currency: 'USDC', interestRate: 500, durationDays: 30 },
  });

  useEffect(() => {
    supabase
      .from('financing_offers')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data as unknown as FinancingOffer[]) ?? [];
        // Normalize mirror strings (and contract i128s) to bigint stroops so
        // amount/amount_repaid math is consistent regardless of source.
        setOffers(rows.map(o => ({
          ...o,
          amount: toStroopsBigInt(o.amount),
          amount_repaid: toStroopsBigInt(o.amount_repaid),
        })));
        setLoadingOffers(false);
      });
  }, [invoiceId]);

  const submitOffer = async (values: OfferFormValues) => {
    if (!publicKey) return;
    setLoading(true);
    const offerId = generateOfferId();
    try {
      const durationSecs = values.durationDays * 86_400;
      const offer = await createOffer(
        {
          offerId,
          invoiceId,
          amount: amountToStroops(values.amount),
          currency: values.currency as Currency,
          interestRate: values.interestRate,
          duration: durationSecs,
        },
        publicKey,
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('financing_offers').insert({
          id: offerId, invoice_id: invoiceId, lender_id: user.id, lender: publicKey,
          amount: values.amount, currency: values.currency,
          interest_rate: values.interestRate, duration: durationSecs,
          status: 'Pending', funded_at: 0,
        });
      }
      setOffers(prev => [offer, ...prev]);
      reset();
      setShowForm(false);
      toast({ title: 'Offer submitted!', description: 'The invoice originator will be notified.' });
    } catch (err: unknown) {
      toast({ title: 'Failed to submit offer', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (offer: FinancingOffer) => {
    if (!publicKey) return;
    setActionId(offer.id);
    try {
      const updatedOffer = await acceptOffer(offer.id, publicKey);
      setOffers(prev => prev.map(o => o.id === offer.id ? updatedOffer : o));
      await supabase.from('financing_offers').update({ status: 'Accepted', funded_at: Math.floor(Date.now() / 1000) }).eq('id', offer.id);
      const updatedInvoice = { ...invoice, status: 'Financed' as const };
      await supabase.from('invoices').update({ status: 'Financed' }).eq('id', invoiceId);
      onUpdate(updatedInvoice);
      toast({ title: 'Offer accepted!', description: 'Invoice is now marked as Financed.' });
    } catch (err: unknown) {
      toast({ title: 'Failed to accept offer', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (offer: FinancingOffer) => {
    if (!publicKey) return;
    setActionId(offer.id);
    try {
      const updatedOffer = await rejectOffer(offer.id, publicKey);
      setOffers(prev => prev.map(o => o.id === offer.id ? updatedOffer : o));
      await supabase.from('financing_offers').update({ status: 'Rejected' }).eq('id', offer.id);
      toast({ title: 'Offer rejected.' });
    } catch (err: unknown) {
      toast({ title: 'Failed to reject offer', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const handleRepay = async (offer: FinancingOffer) => {
    if (!publicKey) return;
    setActionId(offer.id);
    try {
      const raw = (repayAmounts[offer.id] ?? '').trim();
      if (!/^\d+(\.\d{1,7})?$/.test(raw)) {
        toast({ title: 'Enter a valid amount', variant: 'destructive' });
        return;
      }
      const amountStroops = amountToStroops(raw);
      if (amountStroops <= 0n) {
        toast({ title: 'Amount must be greater than zero', variant: 'destructive' });
        return;
      }
      const updatedInvoice = await repayInvoice(invoiceId, offer.id, publicKey, amountStroops);
      // A repayment that clears the full balance flips the invoice to Repaid;
      // anything less keeps it Financed (offer → Financed for the remainder).
      const fullyRepaid = updatedInvoice.status === 'Repaid';
      const nextOfferStatus: FinancingOffer['status'] = fullyRepaid ? 'Repaid' : 'Financed';
      const nextInvoiceStatus: Invoice['status'] = fullyRepaid ? 'Repaid' : 'Financed';
      const newRepaid = toStroopsBigInt(offer.amount_repaid) + amountStroops;
      setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: nextOfferStatus, amount_repaid: newRepaid } : o));
      // Mirror stores human-decimal strings (same format as its amount column).
      await supabase.from('financing_offers').update({ status: nextOfferStatus, amount_repaid: formatAmount(newRepaid) }).eq('id', offer.id);
      await supabase.from('invoices').update({ status: nextInvoiceStatus }).eq('id', invoiceId);
      onUpdate(updatedInvoice);
      toast({
        title: fullyRepaid ? 'Invoice fully repaid' : 'Repayment sent',
        description: fullyRepaid
          ? 'Principal + yield transferred to the lender. The invoice is now Repaid.'
          : 'Partial repayment recorded on-chain. Continue repaying until the balance clears.',
      });
    } catch (err: unknown) {
      toast({ title: 'Failed to repay', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const handleMarkOverdue = async () => {
    if (!publicKey) return;
    setActionId('__overdue__');
    try {
      const updatedInvoice = await markOverdue(invoiceId, publicKey);
      await supabase.from('invoices').update({ status: 'Overdue' }).eq('id', invoiceId);
      onUpdate(updatedInvoice);
      toast({ title: 'Invoice marked overdue.' });
    } catch (err: unknown) {
      toast({ title: 'Failed to mark overdue', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const handleReclaim = async (offer: FinancingOffer) => {
    if (!publicKey) return;
    setActionId(offer.id);
    try {
      const updatedOffer = await reclaimInvoice(invoiceId, offer.id, publicKey);
      setOffers(prev => prev.map(o => o.id === offer.id ? updatedOffer : o));
      await supabase.from('financing_offers').update({ status: 'Defaulted' }).eq('id', offer.id);
      toast({ title: 'Offer marked defaulted.', description: 'This is an on-chain record — pursue recovery off-chain.' });
    } catch (err: unknown) {
      toast({ title: 'Failed to reclaim', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const isOriginator = publicKey === invoice.originator;
  const canMakeOffer = invoice.status === 'Pending' && publicKey && !isOriginator;
  const nowSecs = Math.floor(Date.now() / 1000);
  const canMarkOverdue = invoice.status === 'Financed' && publicKey && nowSecs > invoice.due_date;
  const canReclaim = (offer: FinancingOffer) =>
    invoice.status === 'Overdue' && (offer.status === 'Accepted' || offer.status === 'Financed') && publicKey === offer.lender &&
    nowSecs >= invoice.due_date + GRACE_PERIOD_SECS;

  const exportOffersCsv = () => {
    if (offers.length === 0) return;
    const rows = offers.map(o => ({
      id: o.id,
      lender: o.lender,
      amount: `${Number(o.amount) / STROOPS_PER_XLM} ${o.currency}`,
      interest_rate: o.interest_rate,
      term_days: Math.round(o.duration / 86_400),
      status: o.status,
      created_at: (o as unknown as { created_at?: string }).created_at ?? '',
    }));
    const csv = toCsv(rows, [
      { key: 'id', header: 'Offer ID' },
      { key: 'lender', header: 'Lender' },
      { key: 'amount', header: 'Amount' },
      { key: 'interest_rate', header: 'Interest (bps)' },
      { key: 'term_days', header: 'Term (days)' },
      { key: 'status', header: 'Status' },
      { key: 'created_at', header: 'Created Date' },
    ]);
    downloadCsv(`invofi-offers-${invoiceId}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Financing Offers ({offers.length})</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={exportOffersCsv}
            disabled={offers.length === 0}
            title={offers.length === 0 ? 'No offers to export' : 'Export offers as CSV'}
          >
            <Download className="h-3 w-3 mr-1" /> Export
          </Button>
          {canMarkOverdue && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkOverdue}
              disabled={actionId === '__overdue__'}
            >
              {actionId === '__overdue__' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Mark Overdue
            </Button>
          )}
          {canMakeOffer && (
            <Button size="sm" onClick={() => setShowForm(v => !v)}>
              <Plus className="h-4 w-4 mr-1" /> Make Offer
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Offer form */}
        {showForm && (
          <form onSubmit={handleSubmit(submitOffer)} className="border rounded-lg p-4 space-y-3 bg-gray-50">
            <p className="text-sm font-medium text-gray-700">New Financing Offer</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="o-amount">Amount</Label>
                <Input id="o-amount" placeholder="10000.00" {...register('amount')} />
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-currency">Currency</Label>
                <select id="o-currency" {...register('currency')} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
                  <option value="USDC">USDC</option>
                  <option value="XLM">XLM</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-rate">Interest (basis pts)</Label>
                <Input id="o-rate" type="number" placeholder="500" {...register('interestRate')} />
                <p className="text-xs text-gray-400">500 = 5.00%</p>
                {errors.interestRate && <p className="text-xs text-red-500">{errors.interestRate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-days">Duration (days)</Label>
                <Input id="o-days" type="number" placeholder="30" {...register('durationDays')} />
                {errors.durationDays && <p className="text-xs text-red-500">{errors.durationDays.message}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Submit Offer
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {/* Offers list */}
        {loadingOffers ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : offers.length === 0 && !showForm ? (
          <p className="text-sm text-gray-400 text-center py-6">No offers yet.</p>
        ) : null}

        {offers.map(offer => {
          const repaid = toStroopsBigInt(offer.amount_repaid);
          const remaining = totalDue(offer) - repaid;
          return (
          <div key={offer.id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <p className="text-sm font-mono text-gray-600">{formatAddress(offer.lender)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatAmount(offer.amount)} {offer.currency} ·{' '}
                {interestRateLabel(offer.interest_rate)} · {durationLabel(offer.duration)}
              </p>
              {(offer.status === 'Accepted' || offer.status === 'Financed') && repaid > 0n && (
                <p className="text-xs mt-1">
                  <span className="text-green-600">{formatAmount(repaid)} repaid</span>
                  {' · '}
                  <span className="text-gray-500">{formatAmount(remaining)} remaining</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={OFFER_STATUS_COLORS[offer.status]}>{offer.status}</Badge>
              {isOriginator && offer.status === 'Pending' && (
                <>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(offer)}
                    disabled={actionId === offer.id}
                  >
                    {actionId === offer.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmTarget({ offer, kind: 'reject' })}
                    disabled={actionId === offer.id}
                  >
                    Reject
                  </Button>
                </>
              )}
              {isOriginator && (offer.status === 'Accepted' || offer.status === 'Financed') && invoice.status === 'Financed' && (
                <div className="flex items-center gap-1.5">
                  <Input
                    className="h-8 w-28 text-xs"
                    placeholder={formatAmount(remainingBalance(offer))}
                    title={`Remaining balance: ${formatAmount(remainingBalance(offer))} ${offer.currency} (total due ${formatAmount(totalDue(offer))} minus ${formatAmount(repaid)})`}
                    value={repayAmounts[offer.id] ?? ''}
                    onChange={e => setRepayAmounts(prev => ({ ...prev, [offer.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleRepay(offer)}
                    disabled={actionId === offer.id}
                  >
                    {actionId === offer.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Repay
                  </Button>
                </div>
              )}
              {canReclaim(offer) && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmTarget({ offer, kind: 'reclaim' })}
                  disabled={actionId === offer.id}
                >
                  {actionId === offer.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Reclaim
                </Button>
              )}
            </div>
          </div>
          );
        })}
      </CardContent>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={open => { if (!open) setConfirmTarget(null); }}
        title={confirmTarget?.kind === 'reclaim' ? 'Reclaim this offer?' : 'Reject this offer?'}
        description={
          confirmTarget?.kind === 'reclaim'
            ? 'This marks the offer Defaulted on-chain. Principal was already paid to the business at acceptance — this does not return funds, and cannot be undone.'
            : 'The lender will be notified their offer was rejected. This cannot be undone.'
        }
        confirmLabel={confirmTarget?.kind === 'reclaim' ? 'Reclaim' : 'Reject'}
        variant={confirmTarget?.kind === 'reclaim' ? 'destructive' : 'default'}
        holdToConfirm={confirmTarget?.kind === 'reclaim'}
        onConfirm={() => {
          if (!confirmTarget) return;
          const { offer, kind } = confirmTarget;
          setConfirmTarget(null);
          if (kind === 'reclaim') handleReclaim(offer);
          else handleReject(offer);
        }}
      />
    </Card>
  );
}

function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Total repayment due in stroops: principal + simple yield (matches the contract's calculate_total_due). */
function totalDue(offer: FinancingOffer): bigint {
  return offer.amount + (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
}

/** Outstanding balance in stroops: total due minus what has been repaid so far. */
function remainingBalance(offer: FinancingOffer): bigint {
  const remaining = totalDue(offer) - toStroopsBigInt(offer.amount_repaid);
  return remaining < 0n ? 0n : remaining;
}
