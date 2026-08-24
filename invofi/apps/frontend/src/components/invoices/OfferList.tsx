'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
import { SimulateConfirm } from '@/components/common/SimulateConfirm';
import { useWallet } from '@/components/auth/WalletProvider';
import { createOffer, acceptOffer, rejectOffer, repayInvoice, markOverdue, reclaimInvoice } from '@/lib/contract';
import {
  simulateContractCall,
  encodeSymbol,
  encodeAddress,
  encodeI128,
} from '@/lib/simulate';
import { supabase } from '@/lib/supabase';
import { formatAmount as formatUnits, generateOfferId, amountToStroops, toStroopsBigInt, OFFER_STATUS_COLORS } from '@/lib/utils';
import { toCsv, downloadCsv } from '@/lib/csv';
import {
  FINANCING_CONTRACT_ID as FINANCING_ID,
  REPAYMENT_CONTRACT_ID as REPAYMENT_ID,
  GRACE_PERIOD_SECS,
  STROOPS_PER_XLM,
} from '@/lib/constants';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useFormat } from '@/hooks/useFormat';
import { toErrorMessage } from '@/lib/errors';
import { OfferTermsPreview } from './OfferTermsPreview';
import type { Currency, FinancingOffer, Invoice } from '@/types';
import type { SimulationResult } from '@/lib/simulate';

/** The state-changing actions a lender/originator can take on an offer. */
type SimKind = 'accept' | 'reject' | 'repay' | 'reclaim';

interface SimTarget {
  offer: FinancingOffer;
  kind: SimKind;
  /** Stroops, for `repay` only. */
  amount?: bigint;
}

/** Dialog copy per action — the only thing that differs between previews. */
/**
 * Per-action dialog behaviour. The *copy* lives in the `Offers.preview`
 * namespace and is looked up by kind, so a preview reads in the reader's
 * language; only the presentation flags stay in code.
 */
const SIM_ACTIONS: Record<SimKind, {
  variant?: 'default' | 'destructive';
  /** Irreversible actions require a press-and-hold, not a single click. */
  holdToConfirm?: boolean;
}> = {
  accept: {},
  reject: {},
  repay: {},
  reclaim: { variant: 'destructive', holdToConfirm: true },
};

/** A blocked result — the dialog renders it as a failure and disables submit. */
function emptySimulation(error: string): SimulationResult {
  return {
    success: false,
    error,
    tokenMovements: [],
    stateChanges: [],
    events: [],
    resourceFee: '0',
    latestLedger: 0,
  };
}

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
  const t = useTranslations('Offers');
  const tStatus = useTranslations('Status');
  const tCommon = useTranslations('Common');
  const format = useFormat();
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  /** IDs of offers currently being submitted/accepted on-chain (optimistic UI). */
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});

  // ── Simulation state: non-null while a preview dialog is open ───────────
  const [simTarget, setSimTarget] = useState<SimTarget | null>(null);

  const { register, watch, handleSubmit, formState: { errors }, reset } = useForm<OfferFormValues>({
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
    const durationSecs = values.durationDays * 86_400;

    // Optimistic: add the offer to local state immediately so the UI reflects
    // the pending offer while the on-chain transaction confirms.
    const optimisticOffer: FinancingOffer & { pending?: boolean } = {
      id: offerId,
      invoice_id: invoiceId,
      lender: publicKey,
      amount: amountToStroops(values.amount),
      currency: values.currency as Currency,
      interest_rate: values.interestRate,
      duration: durationSecs,
      amount_repaid: 0n,
      status: 'Pending',
      funded_at: 0,
      pending: true,
    };
    setOffers(prev => [optimisticOffer, ...prev]);
    setPendingIds(prev => new Set(prev).add(offerId));
    reset();
    setShowForm(false);

    try {
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
      // Replace the optimistic offer with the real one from the contract.
      setOffers(prev => prev.map(o => o.id === offerId ? offer : o));
      toast({ title: t('toast.submitted'), description: t('toast.submittedHint') });
    } catch (err: unknown) {
      // Rollback: remove the optimistic offer on failure.
      setOffers(prev => prev.filter(o => o.id !== offerId));
      toast({ title: t('toast.submitFailed'), description: toErrorMessage(err, t('toast.submitFailed')), variant: 'destructive' });
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(offerId);
        return next;
      });
      setLoading(false);
    }
  };

  // One simulation entry point for every action: which contract and method a
  // preview targets is derived from `simTarget`, so adding an action means
  // adding a case here and a row in SIM_ACTIONS — not a fifth near-identical
  // callback/dialog pair.
  const simulateAction = useCallback(async (): Promise<SimulationResult> => {
    if (!simTarget || !publicKey) return emptySimulation('No action selected');
    const { offer, kind, amount } = simTarget;
    const source = encodeAddress(publicKey);

    switch (kind) {
      case 'accept':
        return simulateContractCall(FINANCING_ID, 'accept_offer', [encodeSymbol(offer.id), source], publicKey);
      case 'reject':
        return simulateContractCall(FINANCING_ID, 'reject_offer', [encodeSymbol(offer.id), source], publicKey);
      case 'repay':
        if (!amount) return emptySimulation('No repayment amount entered');
        return simulateContractCall(
          REPAYMENT_ID,
          'repay_invoice',
          [encodeSymbol(invoiceId), encodeSymbol(offer.id), source, encodeI128(amount)],
          publicKey,
        );
      case 'reclaim':
        return simulateContractCall(
          REPAYMENT_ID,
          'reclaim_invoice',
          [encodeSymbol(invoiceId), encodeSymbol(offer.id), source],
          publicKey,
        );
    }
  }, [simTarget, publicKey, invoiceId]);

  const handleAccept = async (offer: FinancingOffer) => {
    if (!publicKey) return;
    setActionId(offer.id);
    setPendingIds(prev => new Set(prev).add(offer.id));

    // Optimistic: immediately flip the offer and invoice to their expected
    // post-acceptance states so the UI reflects the action instantly.
    const previousOfferStatus = offer.status;
    const previousInvoiceStatus = invoice.status;
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: 'Accepted' as const } : o));
    onUpdate({ ...invoice, status: 'Financed' as const });

    try {
      const updatedOffer = await acceptOffer(offer.id, publicKey);
      // Reconcile with the authoritative on-chain response.
      setOffers(prev => prev.map(o => o.id === offer.id ? updatedOffer : o));
      await supabase.from('financing_offers').update({ status: 'Accepted', funded_at: Math.floor(Date.now() / 1000) }).eq('id', offer.id);
      const updatedInvoice = { ...invoice, status: 'Financed' as const };
      await supabase.from('invoices').update({ status: 'Financed' }).eq('id', invoiceId);
      onUpdate(updatedInvoice);
      toast({ title: t('toast.accepted'), description: t('toast.acceptedHint') });
    } catch (err: unknown) {
      // Rollback: revert to the previous states on failure.
      setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: previousOfferStatus } : o));
      onUpdate({ ...invoice, status: previousInvoiceStatus });
      toast({ title: t('toast.acceptFailed'), description: toErrorMessage(err, t('toast.acceptFailed')), variant: 'destructive' });
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(offer.id);
        return next;
      });
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
      toast({
        title: t('toast.rejected'),
        action: (
          <ToastAction
            altText={t('toast.undoRejectAlt')}
            onClick={async () => {
              try {
                await supabase.from('financing_offers').update({ status: 'Pending' }).eq('id', offer.id);
                setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: 'Pending' as const } : o));
                toast({ title: t('toast.rejectUndone'), description: t('toast.rejectUndoneHint') });
              } catch (undoErr: unknown) {
                toast({
                  title: t('toast.undoRejectFailed'),
                  description: toErrorMessage(undoErr, t('toast.undoRejectFailed')),
                  variant: 'destructive',
                });
              }
            }}
          >
            {t('toast.undo')}
          </ToastAction>
        ),
      });
    } catch (err: unknown) {
      toast({ title: t('toast.rejectFailed'), description: toErrorMessage(err, t('toast.rejectFailed')), variant: 'destructive' });
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
        toast({ title: t('toast.invalidAmount'), variant: 'destructive' });
        return;
      }
      const amountStroops = amountToStroops(raw);
      if (amountStroops <= 0n) {
        toast({ title: t('toast.amountTooSmall'), variant: 'destructive' });
        return;
      }


      // ── Optimistic (issue #178): apply the expected post-payment state
      //    immediately so the UI reflects the repayment while the wallet/RPC
      //    round-trip confirms — no offline queueing, so a failed tx rolls back.
      const previousOfferStatus = offer.status;
      const previousInvoiceStatus = invoice.status;
      const previousRepaid = toStroopsBigInt(offer.amount_repaid);
      const optimisticRepaid = previousRepaid + amountStroops;
      const optimisticFullyRepaid = optimisticRepaid >= totalDue(offer);
      const optimisticOfferStatus: FinancingOffer['status'] = optimisticFullyRepaid ? 'Repaid' : 'Financed';
      const optimisticInvoiceStatus: Invoice['status'] = optimisticFullyRepaid ? 'Repaid' : 'Financed';
      setPendingIds(prev => new Set(prev).add(offer.id));
      setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: optimisticOfferStatus, amount_repaid: optimisticRepaid } : o));
      onUpdate({ ...invoice, status: optimisticInvoiceStatus });

      try {
        const updatedInvoice = await repayInvoice(invoiceId, offer.id, publicKey, amountStroops);
        // A repayment that clears the full balance flips the invoice to Repaid;
        // anything less keeps it Financed (offer → Financed for the remainder).
        const fullyRepaid = updatedInvoice.status === 'Repaid';
        const nextOfferStatus: FinancingOffer['status'] = fullyRepaid ? 'Repaid' : 'Financed';
        const nextInvoiceStatus: Invoice['status'] = fullyRepaid ? 'Repaid' : 'Financed';
        const newRepaid = previousRepaid + amountStroops;
        setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: nextOfferStatus, amount_repaid: newRepaid } : o));
        // Mirror stores human-decimal strings (same format as its amount column).
        await supabase.from('financing_offers').update({ status: nextOfferStatus, amount_repaid: formatUnits(newRepaid) }).eq('id', offer.id);
        await supabase.from('invoices').update({ status: nextInvoiceStatus }).eq('id', invoiceId);
        onUpdate(updatedInvoice);
        toast({
          title: fullyRepaid ? t('toast.repaidFull') : t('toast.repaidPartial'),
          description: fullyRepaid ? t('toast.repaidFullHint') : t('toast.repaidPartialHint'),
        });
      } catch (err: unknown) {
        // Rollback: revert the optimistic state on failure.
        setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: previousOfferStatus, amount_repaid: previousRepaid } : o));
        onUpdate({ ...invoice, status: previousInvoiceStatus });
        toast({ title: t('toast.repayFailed'), description: toErrorMessage(err, t('toast.repayFailed')), variant: 'destructive' });
      } finally {
        setPendingIds(prev => {
          const next = new Set(prev);
          next.delete(offer.id);
          return next;
        });
      }
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
      toast({ title: t('toast.markedOverdue') });
    } catch (err: unknown) {
      toast({ title: t('toast.overdueFailed'), description: toErrorMessage(err, t('toast.overdueFailed')), variant: 'destructive' });
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
      toast({ title: t('toast.reclaimed'), description: t('toast.reclaimedHint') });
    } catch (err: unknown) {
      toast({ title: t('toast.reclaimFailed'), description: toErrorMessage(err, t('toast.reclaimFailed')), variant: 'destructive' });
    } finally {
      setActionId(null);
    }
  };

  const isOriginator = publicKey === invoice.originator;
  /** Submits the previewed action once the user confirms a clean simulation. */
  const runSimulatedAction = () => {
    if (!simTarget) return;
    const { offer, kind } = simTarget;
    setSimTarget(null);
    if (kind === 'accept') return handleAccept(offer);
    if (kind === 'reject') return handleReject(offer);
    if (kind === 'repay') return handleRepay(offer);
    return handleReclaim(offer);
  };

  // `accept` is an inert placeholder while closed, since Radix unmounts the
  // dialog body when `open` is false.
  const simKind: SimKind = simTarget?.kind ?? 'accept';
  const simAction = {
    ...SIM_ACTIONS[simKind],
    title: t(`preview.${simKind}.title`),
    description: t(`preview.${simKind}.description`),
    confirmLabel: t(`preview.${simKind}.confirm`),
  };

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

  // Live form values for the repayment preview — re-renders on every keystroke.
  const liveValues = watch();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('title', { count: offers.length })}</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={exportOffersCsv}
            disabled={offers.length === 0}
            title={offers.length === 0 ? t('exportEmpty') : t('exportHint')}
          >
            <Download className="h-3 w-3 me-1" /> {tCommon('export')}
          </Button>
          {canMarkOverdue && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkOverdue}
              disabled={actionId === '__overdue__'}
            >
              {actionId === '__overdue__' && <Loader2 className="h-3 w-3 me-1 animate-spin" />}
              {t('markOverdue')}
            </Button>
          )}
          {canMakeOffer && (
            <Button size="sm" onClick={() => setShowForm(v => !v)}>
              <Plus className="h-4 w-4 me-1" /> {t('makeOffer')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Offer form */}
        {showForm && (
          <form onSubmit={handleSubmit(submitOffer)} className="border rounded-lg p-4 space-y-3 bg-gray-50">
            <p className="text-sm font-medium text-gray-700">{t('form.title')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="o-amount">{t('form.amount')}</Label>
                <Input id="o-amount" placeholder="10000.00" {...register('amount')} />
                {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-currency">{t('form.currency')}</Label>
                <select id="o-currency" {...register('currency')} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
                  <option value="USDC">USDC</option>
                  <option value="XLM">XLM</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-rate">{t('form.interest')}</Label>
                <Input id="o-rate" type="number" placeholder="500" {...register('interestRate')} />
                <p className="text-xs text-gray-400">{t('form.interestHint', { example: format.percent(500) })}</p>
                {errors.interestRate && <p className="text-xs text-red-500">{errors.interestRate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-days">{t('form.duration')}</Label>
                <Input id="o-days" type="number" placeholder="30" {...register('durationDays')} />
                {errors.durationDays && <p className="text-xs text-red-500">{errors.durationDays.message}</p>}
              </div>
            </div>
            <OfferTermsPreview
              amount={liveValues.amount ?? ''}
              rateBps={Number(liveValues.interestRate)}
              durationDays={Number(liveValues.durationDays)}
              currency={liveValues.currency ?? 'USDC'}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="h-3 w-3 me-1 animate-spin" />}
                {t('form.submit')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                {tCommon('cancel')}
              </Button>
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
          <p className="text-sm text-gray-400 text-center py-6">{t('empty')}</p>
        ) : null}

        {offers.map(offer => {
          const repaid = toStroopsBigInt(offer.amount_repaid);
          const remaining = totalDue(offer) - repaid;
          return (
          <div key={offer.id} className={`flex items-center justify-between border rounded-lg p-3 ${pendingIds.has(offer.id) ? 'opacity-60' : ''}`}>
            <div>
              {/* Strkeys are ASCII identifiers — pinned LTR inside RTL text. */}
              <p className="text-sm font-mono text-gray-600" dir="ltr">{formatAddress(offer.lender)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {format.currency(offer.amount, offer.currency)} ·{' '}
                {format.percent(offer.interest_rate)} ·{' '}
                {t('days', { count: Math.round(offer.duration / 86_400) })}
              </p>
              {(offer.status === 'Accepted' || offer.status === 'Financed') && repaid > 0n && (
                <p className="text-xs mt-1">
                  <span className="text-green-600">
                    {t('repaid', { amount: format.currency(repaid, offer.currency) })}
                  </span>
                  {' · '}
                  <span className="text-gray-500">
                    {t('remaining', { amount: format.currency(remaining, offer.currency) })}
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={pendingIds.has(offer.id) ? 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse' : OFFER_STATUS_COLORS[offer.status]}>
                {pendingIds.has(offer.id) && <Loader2 className="h-3 w-3 me-1 animate-spin" />}
                {tStatus(offer.status)}
              </Badge>
              {isOriginator && offer.status === 'Pending' && (
                <>
                  <Button
                    size="sm"
                    onClick={() => setSimTarget({ offer, kind: 'accept' })}
                    disabled={actionId === offer.id}
                  >
                    {actionId === offer.id && <Loader2 className="h-3 w-3 me-1 animate-spin" />}
                    {t('accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSimTarget({ offer, kind: 'reject' })}
                    disabled={actionId === offer.id}
                  >
                    {t('reject')}
                  </Button>
                </>
              )}
              {isOriginator && (offer.status === 'Accepted' || offer.status === 'Financed') && invoice.status === 'Financed' && (
                <div className="flex items-center gap-1.5">
                  <Input
                    className="h-8 w-28 text-xs"
                    placeholder={formatUnits(remainingBalance(offer))}
                    aria-label={t('repayAmount')}
                    dir="ltr"
                    title={t('remainingBalance', {
                      remaining: format.currency(remainingBalance(offer), offer.currency),
                      total: format.currency(totalDue(offer), offer.currency),
                      repaid: format.currency(repaid, offer.currency),
                    })}
                    value={repayAmounts[offer.id] ?? ''}
                    onChange={e => setRepayAmounts(prev => ({ ...prev, [offer.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
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
                      setSimTarget({ offer, kind: 'repay', amount: amountStroops });
                    }}
                    disabled={actionId === offer.id}
                  >
                    {actionId === offer.id && <Loader2 className="h-3 w-3 me-1 animate-spin" />}
                    {t('repay')}
                  </Button>
                </div>
              )}
              {canReclaim(offer) && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setSimTarget({ offer, kind: 'reclaim' })}
                  disabled={actionId === offer.id}
                >
                  {actionId === offer.id && <Loader2 className="h-3 w-3 me-1 animate-spin" />}
                  {t('reclaim')}
                </Button>
              )}
            </div>
          </div>
          );
        })}
      </CardContent>

      {/* ── Simulation gate: every state-changing action passes through here ── */}
      <SimulateConfirm
        open={simTarget !== null}
        onOpenChange={open => { if (!open) setSimTarget(null); }}
        title={simAction.title}
        description={simAction.description}
        onSimulate={simulateAction}
        onConfirm={runSimulatedAction}
        confirmLabel={simAction.confirmLabel}
        variant={simAction.variant}
        holdToConfirm={simAction.holdToConfirm}
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
