'use client';

/**
 * PurchaseFractionModal
 *
 * Dialog that lets an investor select how many fractions to buy, shows the
 * total cost, then records the purchase in Supabase and appends a price
 * history point.
 *
 * On-chain settlement: the actual token movement (SEP-41 transfer from the
 * originator's position to the buyer) must be handled separately by calling
 * transferPositionToken(). This modal records the intent first, then guides
 * the user to complete the transfer from their portfolio.
 */

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, ShoppingCart, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { purchaseSchema, purchaseFraction, computeTotalCost, type PurchaseDraft } from '@/lib/securitization';
import type { FractionalizationRecord } from '@/types/securitization';

interface PurchaseFractionModalProps {
  record: FractionalizationRecord;
  lenderId: string;
  lenderAddress: string;
  /** Called after a successful off-chain purchase record is saved. */
  onPurchased?: (fractionCount: number) => void;
  /** Custom trigger element. Defaults to a "Buy fractions" button. */
  trigger?: React.ReactNode;
}

export function PurchaseFractionModal({
  record,
  lenderId,
  lenderAddress,
  onPurchased,
  trigger,
}: PurchaseFractionModalProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [purchasedCount, setPurchasedCount] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PurchaseDraft>({
    resolver: zodResolver(
      purchaseSchema.refine(
        d => d.fractionCount <= record.available_fractions,
        d => ({
          message: `Only ${record.available_fractions} fraction${record.available_fractions !== 1 ? 's' : ''} available`,
          path: ['fractionCount'],
        }),
      ),
    ),
    defaultValues: { fractionCount: 1 },
  });

  const fractionCount = watch('fractionCount') || 0;

  let totalCost = '0';
  try {
    totalCost = computeTotalCost(record.price_per_fraction, fractionCount);
  } catch { /* invalid input */ }

  const onSubmit = useCallback(
    async (data: PurchaseDraft) => {
      setSubmitting(true);
      try {
        await purchaseFraction(
          record.id,
          data.fractionCount,
          lenderId,
          lenderAddress,
        );
        setPurchasedCount(data.fractionCount);
        setPurchased(true);
        onPurchased?.(data.fractionCount);
        toast({
          title: 'Purchase recorded',
          description: `${data.fractionCount} fraction${data.fractionCount !== 1 ? 's' : ''} of ${record.token_symbol} reserved. Complete the token transfer from your portfolio.`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Purchase failed';
        toast({ title: 'Purchase failed', description: msg, variant: 'destructive' });
      } finally {
        setSubmitting(false);
      }
    },
    [record, lenderId, lenderAddress, onPurchased, toast],
  );

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      reset({ fractionCount: 1 });
      setPurchased(false);
    }
  };

  const isDisabled = record.status !== 'active';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={isDisabled}>
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
            {isDisabled ? (record.status === 'sold_out' ? 'Sold out' : 'Unavailable') : 'Buy fractions'}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            Purchase {record.token_symbol}
          </DialogTitle>
          <DialogDescription>
            {record.token_name} · {record.price_per_fraction} {record.price_currency} per fraction ·{' '}
            {record.available_fractions.toLocaleString()} available
          </DialogDescription>
        </DialogHeader>

        {purchased ? (
          <div className="py-4 space-y-3 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {purchasedCount} fraction{purchasedCount !== 1 ? 's' : ''} reserved!
            </p>
            <p className="text-xs text-muted-foreground">
              Your purchase is recorded. To complete settlement, transfer{' '}
              <strong>{purchasedCount}</strong> {record.token_symbol} position tokens to your
              wallet from the Portfolio → Transfer section.
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fractionCount">
                Number of fractions
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (max {record.available_fractions.toLocaleString()})
                </span>
              </Label>
              <Input
                id="fractionCount"
                type="number"
                min="1"
                max={record.available_fractions}
                step="1"
                {...register('fractionCount', { valueAsNumber: true })}
              />
              {errors.fractionCount && (
                <p className="text-xs text-destructive">{errors.fractionCount.message}</p>
              )}
            </div>

            {fractionCount > 0 && Number(totalCost) > 0 && (
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fractions</span>
                  <span className="font-medium">{fractionCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price / fraction</span>
                  <span className="font-medium font-mono">
                    {record.price_per_fraction} {record.price_currency}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <span className="font-semibold">Total cost</span>
                  <span className="font-semibold font-mono text-foreground">
                    {totalCost} {record.price_currency}
                  </span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This records your purchase intent. The actual token transfer is a SEP-41
              transaction you complete separately from the Portfolio page.
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Processing…</>
                ) : (
                  <>Reserve fractions</>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
