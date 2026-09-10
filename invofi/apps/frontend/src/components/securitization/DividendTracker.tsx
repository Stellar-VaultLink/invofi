'use client';

/**
 * DividendTracker
 *
 * Shows dividend distribution history for a fractionalization, including:
 *  - Per-event table (amount, per-fraction, status, date)
 *  - Summary: total distributed, total earned by this investor (if positionFractions provided)
 *  - Create dividend form for the originator
 */

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  Loader2,
  PlusCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { fetchDividends, createDividend } from '@/lib/securitization';
import { toStroopsBigInt } from '@/lib/utils';
import type { DividendRecord, FractionalizationRecord } from '@/types/securitization';
import type { Currency } from '@/types';

// ── Schema ────────────────────────────────────────────────────────────────────

const dividendSchema = z.object({
  totalAmount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 100.00)')
    .refine(v => toStroopsBigInt(v) > 0n, 'Amount must be greater than zero'),
  currency: z.enum(['XLM', 'USDC']),
  note: z.string().max(200, 'Max 200 characters'),
});

type DividendFormValues = z.infer<typeof dividendSchema>;

// ── Status badge colours ──────────────────────────────────────────────────────

const STATUS_STYLES: Record<DividendRecord['status'], string> = {
  pending:     'bg-yellow-50 text-yellow-700 border-yellow-200',
  distributed: 'bg-green-50 text-green-700 border-green-200',
  cancelled:   'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
};

// ── Create dividend form (originator only) ────────────────────────────────────

interface CreateDividendFormProps {
  record: FractionalizationRecord;
  originatorId: string;
  onCreated: (d: DividendRecord) => void;
}

function CreateDividendForm({ record, originatorId, onCreated }: CreateDividendFormProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DividendFormValues>({
    resolver: zodResolver(dividendSchema),
    defaultValues: { totalAmount: '', currency: record.price_currency, note: '' },
  });

  const totalAmount = watch('totalAmount') || '0';
  const currency = watch('currency');

  let perFraction = '0';
  try {
    const stroops = Number(toStroopsBigInt(totalAmount));
    perFraction = (stroops / record.total_fractions / 1e7).toFixed(7);
  } catch { /* ignore */ }

  const onSubmit = async (values: DividendFormValues) => {
    setSubmitting(true);
    try {
      const div = await createDividend(
        record.id,
        originatorId,
        values.totalAmount,
        values.currency as Currency,
        record.total_fractions,
        values.note,
      );
      toast({
        title: 'Dividend distributed',
        description: `${values.totalAmount} ${values.currency} distributed to ${record.total_fractions.toLocaleString()} fraction holders.`,
      });
      reset({ totalAmount: '', currency: record.price_currency, note: '' });
      setOpen(false);
      onCreated(div);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create dividend';
      toast({ title: 'Distribution failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(v => !v)}
        className="w-full justify-between"
      >
        <span className="flex items-center gap-1.5">
          <PlusCircle className="h-3.5 w-3.5" />
          Distribute dividend
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {open && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-3 border rounded-lg p-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="div-amount">Total amount</Label>
              <Input id="div-amount" placeholder="100.00" {...register('totalAmount')} />
              {errors.totalAmount && (
                <p className="text-xs text-destructive">{errors.totalAmount.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="div-currency">Currency</Label>
              <select
                id="div-currency"
                {...register('currency')}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
              </select>
            </div>
          </div>

          {Number(perFraction) > 0 && (
            <p className="text-xs text-muted-foreground">
              Per fraction:{' '}
              <span className="font-mono font-medium text-foreground">
                {perFraction} {currency}
              </span>{' '}
              × {record.total_fractions.toLocaleString()} holders
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="div-note">Note (optional)</Label>
            <Input
              id="div-note"
              placeholder="e.g. Q2 yield payment"
              maxLength={200}
              {...register('note')}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Distribute
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DividendTrackerProps {
  record: FractionalizationRecord;
  /** If provided, shows this investor's pro-rata earnings. */
  positionFractions?: number;
  /** If the current user is the originator, show the create-dividend form. */
  isOriginator?: boolean;
  originatorId?: string;
  className?: string;
}

export function DividendTracker({
  record,
  positionFractions,
  isOriginator = false,
  originatorId,
  className,
}: DividendTrackerProps) {
  const [dividends, setDividends] = useState<DividendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDividends(await fetchDividends(record.id));
    } catch {
      setError('Could not load dividend history');
    } finally {
      setLoading(false);
    }
  }, [record.id]);

  useEffect(() => { load(); }, [load]);

  const distributed = dividends.filter(d => d.status === 'distributed');

  // Total distributed in stroops (simple sum)
  const totalDistributedStroops = distributed.reduce(
    (sum, d) => sum + Number(toStroopsBigInt(d.total_amount)),
    0,
  );

  // Investor's total earned
  const myEarnedStroops = positionFractions
    ? distributed.reduce(
        (sum, d) => sum + Number(toStroopsBigInt(d.per_fraction_amount)) * positionFractions,
        0,
      )
    : null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <BadgeDollarSign className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Dividend history</h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total distributed</p>
          <p className="text-lg font-bold font-mono text-foreground">
            {(totalDistributedStroops / 1e7).toFixed(2)}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {dividends[0]?.currency ?? record.price_currency}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{distributed.length} event{distributed.length !== 1 ? 's' : ''}</p>
        </div>
        {myEarnedStroops !== null && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 p-3">
            <p className="text-xs text-muted-foreground">Your earnings</p>
            <p className="text-lg font-bold font-mono text-green-700 dark:text-green-400">
              {(myEarnedStroops / 1e7).toFixed(4)}{' '}
              <span className="text-xs font-normal">{dividends[0]?.currency ?? record.price_currency}</span>
            </p>
            <p className="text-xs text-muted-foreground">{positionFractions} fraction{positionFractions !== 1 ? 's' : ''} held</p>
          </div>
        )}
      </div>

      {/* Table */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading dividend history…
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {!loading && !error && dividends.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No dividends distributed yet.</p>
      )}

      {!loading && dividends.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs" aria-label="Dividend distributions">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Per fraction</th>
                {positionFractions && (
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Your share</th>
                )}
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {dividends.map(d => {
                const myShare = positionFractions
                  ? (Number(toStroopsBigInt(d.per_fraction_amount)) * positionFractions) / 1e7
                  : null;
                return (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">
                      {d.distributed_at
                        ? new Date(d.distributed_at).toLocaleDateString()
                        : new Date(d.created_at).toLocaleDateString()}
                      {d.note && (
                        <span className="ml-1 text-muted-foreground/70" title={d.note}>· {d.note.slice(0, 20)}{d.note.length > 20 ? '…' : ''}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {d.total_amount} {d.currency}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {d.per_fraction_amount}
                    </td>
                    {myShare !== null && (
                      <td className="px-3 py-2 text-right font-mono font-medium text-green-700 dark:text-green-400">
                        {myShare.toFixed(4)}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_STYLES[d.status]}`}
                      >
                        {d.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Originator: create new dividend */}
      {isOriginator && originatorId && (
        <CreateDividendForm
          record={record}
          originatorId={originatorId}
          onCreated={div => setDividends(prev => [div, ...prev])}
        />
      )}
    </div>
  );
}
