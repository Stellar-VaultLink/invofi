'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { toErrorMessage } from '@/lib/errors';
import { useCreatePendingTransaction } from '@/hooks/useMultisig';
import { buildPaymentTransaction, formatThreshold, requiresMultisig } from '@/lib/multisig';
import { formatAddress, toStroopsBigInt } from '@/lib/utils';
import type { PendingTransactionWithApprovals } from '@/types';
import { HighValueBanner } from './HighValueBanner';

/** True for a positive human-unit amount; never throws on malformed input. */
function isPositiveAmount(v: string): boolean {
  try {
    return toStroopsBigInt(v) > 0n;
  } catch {
    return false;
  }
}

const initiateSchema = z.object({
  destination: z
    .string()
    .refine(v => StrKey.isValidEd25519PublicKey(v), 'Enter a valid Stellar address (starts with G)'),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 12000.00)')
    .refine(isPositiveAmount, 'Amount must be greater than zero'),
  currency: z.enum(['XLM', 'USDC']),
});

type InitiateDraft = z.infer<typeof initiateSchema>;

const DEFAULTS: InitiateDraft = { destination: '', amount: '', currency: 'XLM' };

interface InitiateTransactionFormProps {
  /** Connected wallet — the multi-sig source account and initiator. */
  source: string;
  initiatorId: string | null;
  onCreated: (tx: PendingTransactionWithApprovals) => void;
}

/**
 * Queues a high-value treasury payment for M-of-N approval (issue #219). Builds
 * the unsigned base envelope from the connected wallet, then stores it in the
 * queue — no signature is collected here; co-signers approve from the queue.
 * Only amounts above the per-currency threshold are accepted: smaller payments
 * don't need multi-sig and should be sent directly.
 */
export function InitiateTransactionForm({
  source,
  initiatorId,
  onCreated,
}: InitiateTransactionFormProps) {
  const { toast } = useToast();
  const createTx = useCreatePendingTransaction();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<InitiateDraft>({
    resolver: zodResolver(initiateSchema),
    defaultValues: DEFAULTS,
  });

  const amount = watch('amount');
  const currency = watch('currency');

  const onSubmit = async (draft: InitiateDraft) => {
    if (!requiresMultisig(draft.amount, draft.currency)) {
      setError('amount', {
        message: `Below the ${formatThreshold(draft.currency)} threshold — only high-value operations need multi-sig approval.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const xdr = await buildPaymentTransaction({
        source,
        destination: draft.destination,
        amount: draft.amount,
        currency: draft.currency,
      });
      const title = `Treasury payment — ${draft.amount} ${draft.currency}`;
      const tx = await createTx.mutateAsync({
        title,
        operation: 'payment',
        xdr,
        amount: draft.amount,
        currency: draft.currency,
        initiator: source,
        initiatorId,
      });
      toast({
        title: 'Queued for approval',
        description: `${title} needs ${tx.required_signatures} approvals to execute.`,
      });
      reset(DEFAULTS);
      onCreated(tx);
    } catch (err) {
      const msg = toErrorMessage(err, 'Could not queue the transaction');
      toast({ title: 'Could not queue transaction', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-label="Initiate a high-value transaction">
          <div>
            <Label htmlFor="destination">Destination address</Label>
            <Input
              id="destination"
              placeholder="G…"
              spellCheck={false}
              {...register('destination')}
              className="mt-1 font-mono"
            />
            {errors.destination && (
              <p className="mt-1 text-xs text-red-600">{errors.destination.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" placeholder="12000.00" {...register('amount')} className="mt-1" />
              {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                {...register('currency')}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
          </div>

          <HighValueBanner amount={amount || '0'} currency={currency} action="queue" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Queuing…
                </>
              ) : (
                'Queue for approval'
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Source <span className="font-mono">{formatAddress(source)}</span> must be a funded
              multi-sig account with the co-signers configured (see docs).
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
