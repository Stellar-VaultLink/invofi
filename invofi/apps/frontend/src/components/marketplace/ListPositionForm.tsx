'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { toErrorMessage } from '@/lib/errors';
import {
  LISTING_NOTE_MAX,
  checkListingSize,
  createListing,
  fetchSellablePositions,
  listingDraftSchema,
  type ListingDraft,
} from '@/lib/listings';
import { formatAmount } from '@/lib/formatters';
import { formatAmount as formatUnits, formatAddress, toStroopsBigInt } from '@/lib/utils';
import type { FinancingOffer, PositionListing } from '@/types';

interface ListPositionFormProps {
  /** Stellar address holding the positions — connected wallet or linked profile wallet. */
  sellerAddress: string;
  sellerId: string;
  onCreated: (listing: PositionListing) => void;
}

/** Position tokens are minted 1:1 with principal (ADR-0002). */
function positionSize(offer: FinancingOffer): string {
  return formatUnits(toStroopsBigInt(offer.amount));
}

export function ListPositionForm({ sellerAddress, sellerId, onCreated }: ListPositionFormProps) {
  const { toast } = useToast();
  const [positions, setPositions] = useState<FinancingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ListingDraft>({
    resolver: zodResolver(listingDraftSchema),
    defaultValues: { offerId: '', tokenAmount: '', askingPrice: '', priceCurrency: 'USDC', note: '' },
  });

  useEffect(() => {
    let cancelled = false;
    fetchSellablePositions(sellerId)
      .then(rows => {
        if (cancelled) return;
        setPositions(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  // Selecting a position prefills the full size and the offer's currency; both
  // stay editable so a lender can sell part of a position at their own price.
  const onSelectPosition = (offerId: string) => {
    setValue('offerId', offerId, { shouldValidate: false });
    const offer = positions.find(p => p.id === offerId);
    if (!offer) return;
    setValue('tokenAmount', positionSize(offer));
    setValue('priceCurrency', offer.currency);
  };

  const onSubmit = async (draft: ListingDraft) => {
    const offer = positions.find(p => p.id === draft.offerId);
    if (!offer) {
      setError('offerId', { message: 'Select the position you want to list' });
      return;
    }
    const sizeError = checkListingSize(draft.tokenAmount, offer);
    if (sizeError) {
      setError('tokenAmount', { message: sizeError });
      return;
    }

    setSubmitting(true);
    try {
      const listing = await createListing({ draft, offer, seller: sellerAddress, sellerId });
      toast({
        title: 'Listing published',
        description: `${draft.tokenAmount} position tokens listed at ${draft.askingPrice} ${draft.priceCurrency}.`,
      });
      reset({ offerId: '', tokenAmount: '', askingPrice: '', priceCurrency: 'USDC', note: '' });
      onCreated(listing);
    } catch (err) {
      const msg = toErrorMessage(err, 'Could not publish the listing');
      toast({ title: 'Listing failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your positions…
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            You have no live positions to list. Fund an invoice from the marketplace first — a
            position token is minted to you when the originator accepts your offer.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-label="List a position">
          <div>
            <Label htmlFor="offerId">Position</Label>
            <select
              id="offerId"
              {...register('offerId')}
              onChange={e => onSelectPosition(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select a position…</option>
              {positions.map(p => (
                <option key={p.id} value={p.id}>
                  Invoice {p.invoice_id} — {formatAmount(toStroopsBigInt(p.amount), p.currency)} principal
                </option>
              ))}
            </select>
            {errors.offerId && <p className="mt-1 text-xs text-red-600">{errors.offerId.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="tokenAmount">Position tokens</Label>
              <Input id="tokenAmount" placeholder="1000.00" {...register('tokenAmount')} className="mt-1" />
              {errors.tokenAmount && (
                <p className="mt-1 text-xs text-red-600">{errors.tokenAmount.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="askingPrice">Asking price</Label>
              <Input id="askingPrice" placeholder="950.00" {...register('askingPrice')} className="mt-1" />
              {errors.askingPrice && (
                <p className="mt-1 text-xs text-red-600">{errors.askingPrice.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="priceCurrency">Paid in</Label>
              <select
                id="priceCurrency"
                {...register('priceCurrency')}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              placeholder="e.g. selling early, open to offers"
              maxLength={LISTING_NOTE_MAX}
              {...register('note')}
              className="mt-1"
            />
            {errors.note && <p className="mt-1 text-xs text-red-600">{errors.note.message}</p>}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> Publishing…
                </>
              ) : (
                'Publish listing'
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Listing as <span className="font-mono">{formatAddress(sellerAddress)}</span>. Nothing is
              escrowed — you settle with the buyer by signing a SEP-41 transfer yourself.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
