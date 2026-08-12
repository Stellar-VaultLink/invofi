'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, AlertTriangle, Zap, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useWallet } from '@/components/auth/WalletProvider';
import { registerInvoice, isContractConfigured } from '@/lib/contract';
import { supabase } from '@/lib/supabase';
import { accountExists, fundAccountViaFriendbot } from '@/lib/horizon';
import { amountToStroops, generateInvoiceId } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { Currency } from '@/types';

const schema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount (e.g. 1000.00)'),
  currency: z.enum(['XLM', 'USDC']),
  dueDate: z.string().min(1, 'Select a due date'),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_FORM_VALUES: FormValues = { amount: '', currency: 'USDC', dueDate: '' };

const DRAFT_KEY_PREFIX = 'invofi:invoice-draft:';
const DRAFT_SAVE_DELAY_MS = 500;

interface InvoiceFormProps {
  onSuccess: (invoiceId: string) => void;
}

const IS_TESTNET =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') !== 'mainnet' &&
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') !== 'public';

const CONTRACT_OK = isContractConfigured();

/**
 * Validate and sanitize a raw storage value into a safe partial draft.
 * Unknown fields are dropped. The currency must be a valid enum value.
 * Partially typed strings are kept so a mid-typing reload still restores.
 * The form's zod resolver reports an invalid amount on submit.
 */
function sanitizeDraft(raw: unknown): Partial<FormValues> {
  if (!raw || typeof raw !== 'object') return {};
  const draft: Partial<FormValues> = {};
  const record = raw as Record<string, unknown>;
  if (record.currency === 'XLM' || record.currency === 'USDC') {
    draft.currency = record.currency;
  }
  if (typeof record.amount === 'string' && record.amount !== '') {
    draft.amount = record.amount;
  }
  if (typeof record.dueDate === 'string' && record.dueDate !== '') {
    draft.dueDate = record.dueDate;
  }
  return draft;
}

export function InvoiceForm({ onSuccess }: InvoiceFormProps) {
  const { publicKey } = useWallet();
  const draftKey = `${DRAFT_KEY_PREFIX}${publicKey ?? 'anonymous'}`;

  // Remount per user. Each wallet key gets a fresh component instance, so the
  // draft for one user never overwrites the draft for another user.
  return <InvoiceDraftForm key={draftKey} draftKey={draftKey} onSuccess={onSuccess} />;
}

function InvoiceDraftForm({ draftKey, onSuccess }: InvoiceFormProps & { draftKey: string }) {
  const { publicKey, isConnected } = useWallet();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [funding, setFunding] = useState(false);
  const [accountFunded, setAccountFunded] = useState<boolean | null>(null);
  const clearedRef = useRef(true);

  const [restoredDraft] = useState<Partial<FormValues>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(draftKey);
      return stored ? sanitizeDraft(JSON.parse(stored)) : {};
    } catch {
      return {};
    }
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...DEFAULT_FORM_VALUES, ...restoredDraft },
  });

  const [draft, setDraft] = useLocalStorage<Partial<FormValues>>(draftKey, restoredDraft);
  const values = watch();
  const debouncedValues = useDebounce(values, DRAFT_SAVE_DELAY_MS);

  // Resume saving when the user changes any field after a successful submit.
  useEffect(() => {
    if (values.amount !== '' || values.currency !== 'USDC' || values.dueDate !== '') {
      clearedRef.current = false;
    }
  }, [values]);

  // Debounced save of the form values.
  useEffect(() => {
    if (clearedRef.current) return;
    setDraft(debouncedValues);
  }, [debouncedValues, setDraft]);

  // Check if the connected wallet exists on-chain (only matters when contract is live)
  useEffect(() => {
    if (!publicKey || !CONTRACT_OK) { setAccountFunded(true); return; }
    setAccountFunded(null);
    accountExists(publicKey).then(setAccountFunded);
  }, [publicKey]);

  const handleFundAccount = async () => {
    if (!publicKey) return;
    setFunding(true);
    try {
      await fundAccountViaFriendbot(publicKey);
      setAccountFunded(true);
      toast({
        title: 'Account funded!',
        description: 'Your testnet wallet now has XLM. You can register invoices.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Funding failed',
        description: err instanceof Error ? err.message : 'Could not fund account',
        variant: 'destructive',
      });
    } finally {
      setFunding(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!isConnected || !publicKey) {
      toast({
        title: 'Wallet not connected',
        description: 'Connect your Freighter or LOBSTR wallet first.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const invoiceId = generateInvoiceId();

    try {
      const dueDateUnix = Math.floor(new Date(values.dueDate).getTime() / 1000);
      const stroops = amountToStroops(values.amount);

      if (CONTRACT_OK) {
        // On-chain registration — auto-funds via Friendbot if needed on testnet
        await registerInvoice(
          { id: invoiceId, amount: stroops, currency: values.currency as Currency, dueDate: dueDateUnix },
          publicKey,
        );
        setAccountFunded(true);
      }

      // Always mirror to Supabase for indexing / display
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from('invoices').insert({
        id: invoiceId,
        originator: publicKey,
        originator_id: user?.id ?? null,
        amount: values.amount,
        currency: values.currency,
        due_date: new Date(values.dueDate).toISOString(),
        status: 'Pending',
      });
      if (insertError) {
        throw new Error(
          CONTRACT_OK
            ? `Invoice registered on-chain, but saving to the database failed: ${insertError.message}. It won't appear in lists until this is resolved.`
            : `Saving the invoice failed: ${insertError.message}`,
        );
      }

      // Successful submission: clear the stored draft and reset the form.
      clearedRef.current = true;
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // private mode or storage unavailable — nothing to clear
      }
      setDraft({});
      reset(DEFAULT_FORM_VALUES);

      toast({
        title: CONTRACT_OK ? 'Invoice registered!' : 'Invoice saved!',
        description: CONTRACT_OK
          ? 'Your invoice is now on-chain.'
          : 'Saved off-chain — on-chain registration will happen once the contract is deployed.',
      });
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
              Connect your Freighter or LOBSTR wallet before submitting.
            </p>
          )}

          {/* Alpha mode banner — shown when contract isn't deployed yet */}
          {!CONTRACT_OK && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-3">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Alpha mode — off-chain storage
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                  The on-chain contract is being deployed. Invoices are saved to the database
                  and will be registered on Stellar once the contract is live.
                </p>
              </div>
            </div>
          )}

          {/* Unfunded testnet account banner — only shown when contract is live */}
          {CONTRACT_OK && isConnected && IS_TESTNET && accountFunded === false && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Wallet not funded on testnet
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Your Stellar testnet account needs XLM before it can transact.
                  Click below to get free testnet XLM via Friendbot.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleFundAccount}
                  disabled={funding}
                >
                  {funding
                    ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Funding…</>
                    : <><Zap className="mr-1.5 h-3.5 w-3.5" /> Fund with Friendbot</>
                  }
                </Button>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !isConnected || (CONTRACT_OK && IS_TESTNET && accountFunded === false)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? (CONTRACT_OK ? 'Registering on-chain…' : 'Saving invoice…')
              : (CONTRACT_OK ? 'Register Invoice' : 'Save Invoice')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
