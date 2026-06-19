'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useWallet } from '@/components/auth/WalletProvider';
import { registerInvoice } from '@/lib/contract';
import { supabase } from '@/lib/supabase';
import { amountToStroops, generateInvoiceId } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { Currency } from '@/types';

const schema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 1000.00)'),
  currency: z.enum(['XLM', 'USDC']),
  dueDate: z.string().min(1, 'Select a due date'),
});

type FormValues = z.infer<typeof schema>;

interface InvoiceFormProps {
  onSuccess: (invoiceId: string) => void;
}

export function InvoiceForm({ onSuccess }: InvoiceFormProps) {
  const { publicKey, isConnected } = useWallet();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'USDC' },
  });

  const onSubmit = async (values: FormValues) => {
    if (!isConnected || !publicKey) {
      toast({
        title: 'Wallet not connected',
        description: 'Connect your Freighter wallet to create an invoice.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const invoiceId = generateInvoiceId();

    try {
      const dueDateUnix = Math.floor(new Date(values.dueDate).getTime() / 1000);
      const stroops = amountToStroops(values.amount);

      // Register on-chain
      await registerInvoice(
        { id: invoiceId, amount: stroops, currency: values.currency as Currency, dueDate: dueDateUnix },
        publicKey,
      );

      // Mirror to Supabase for indexing / display
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('invoices').insert({
          id: invoiceId,
          originator: publicKey,
          originator_id: user.id,
          amount: values.amount,
          currency: values.currency,
          due_date: new Date(values.dueDate).toISOString(),
          status: 'Pending',
        });
      }

      toast({ title: 'Invoice registered!', description: 'Your invoice is now on-chain.' });
      onSuccess(invoiceId);
    } catch (err: unknown) {
      toast({
        title: 'Failed to register invoice',
        description: err instanceof Error ? err.message : 'Transaction failed',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" placeholder="10000.00" {...register('amount')} />
              {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                {...register('currency')}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
              </select>
              {errors.currency && <p className="text-xs text-red-500">{errors.currency.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              type="date"
              min={new Date().toISOString().split('T')[0]}
              {...register('dueDate')}
            />
            {errors.dueDate && <p className="text-xs text-red-500">{errors.dueDate.message}</p>}
          </div>

          {!isConnected && (
            <p className="text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              Connect your Freighter wallet before submitting.
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting || !isConnected}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Registering on-chain…' : 'Register Invoice'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
