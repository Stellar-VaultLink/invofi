'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/components/auth/WalletProvider';
import { createOffer, acceptOffer, rejectOffer } from '@/lib/contract';
import { supabase } from '@/lib/supabase';
import { formatAmount, interestRateLabel, durationLabel, generateOfferId, amountToStroops, OFFER_STATUS_COLORS } from '@/lib/utils';
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
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

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
      .then(({ data }) => setOffers((data as unknown as FinancingOffer[]) ?? []));
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

  const isOriginator = publicKey === invoice.originator;
  const canMakeOffer = invoice.status === 'Pending' && publicKey && !isOriginator;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Financing Offers ({offers.length})</CardTitle>
        {canMakeOffer && (
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Make Offer
          </Button>
        )}
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
        {offers.length === 0 && !showForm && (
          <p className="text-sm text-gray-400 text-center py-6">No offers yet.</p>
        )}

        {offers.map(offer => (
          <div key={offer.id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <p className="text-sm font-mono text-gray-600">{formatAddress(offer.lender)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatAmount(offer.amount)} {offer.currency} ·{' '}
                {interestRateLabel(offer.interest_rate)} · {durationLabel(offer.duration)}
              </p>
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
                    onClick={() => handleReject(offer)}
                    disabled={actionId === offer.id}
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
