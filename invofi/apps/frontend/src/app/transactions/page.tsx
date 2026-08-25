'use client';

import { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useWallet } from '@/components/auth/WalletProvider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { toErrorMessage } from '@/lib/errors';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { InitiateTransactionForm } from '@/components/multisig/InitiateTransactionForm';
import { PendingTransactionCard } from '@/components/multisig/PendingTransactionCard';
import {
  useApproveTransaction,
  useExecuteTransaction,
  usePendingTransactions,
  useRejectTransaction,
} from '@/hooks/useMultisig';
import { effectiveStatus } from '@/lib/multisig';
import { supabase } from '@/lib/supabase';
import type { PendingTransaction, PendingTransactionWithApprovals } from '@/types';

/**
 * The multi-signature approval queue (issue #219). High-value operations land
 * here and collect M-of-N wallet approvals before they can be submitted; any
 * co-signer can approve, execute once the threshold is met, or reject. Requests
 * auto-expire after the approval window closes.
 */
export default function TransactionsPage() {
  const { publicKey } = useWallet();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch } = usePendingTransactions();
  const approve = useApproveTransaction();
  const execute = useExecuteTransaction();
  const reject = useRejectTransaction();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, []);

  const onApprove = async (tx: PendingTransaction) => {
    if (!publicKey) return;
    setBusyId(tx.id);
    try {
      await approve.mutateAsync({ tx, approverAddress: publicKey, approverId: userId });
      toast({ title: 'Approval recorded', description: 'Your signature was added to the transaction.' });
    } catch (err) {
      const msg = toErrorMessage(err, 'Could not record your approval');
      toast({ title: 'Approval failed', description: msg, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const onExecute = async (tx: PendingTransactionWithApprovals) => {
    setBusyId(tx.id);
    try {
      const result = await execute.mutateAsync(tx);
      toast({
        title: 'Transaction submitted',
        description: result.tx_hash
          ? `Submitted to the network (${result.tx_hash.slice(0, 8)}…).`
          : 'Submitted to the network.',
      });
    } catch (err) {
      const msg = toErrorMessage(err, 'Could not submit the transaction');
      toast({ title: 'Execution failed', description: msg, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (tx: PendingTransaction) => {
    if (!publicKey) return;
    setBusyId(tx.id);
    try {
      await reject.mutateAsync(tx.id);
      toast({ title: 'Transaction rejected', description: 'The request was removed from the queue.' });
    } catch (err) {
      const msg = toErrorMessage(err, 'Could not reject the transaction');
      toast({ title: 'Rejection failed', description: msg, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const rows = data ?? [];
  const pending = rows.filter(t => effectiveStatus(t) === 'Pending');
  const resolved = rows.filter(t => effectiveStatus(t) !== 'Pending');

  return (
    <AuthGuard>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <ShieldCheck className="h-6 w-6 text-blue-600" />
              Approval Queue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              High-value operations require multiple wallet approvals before they settle. Approve,
              execute, or reject pending requests below.
            </p>
          </div>
          {publicKey && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {showForm ? 'Close' : 'New transaction'}
            </Button>
          )}
        </div>

        {showForm && publicKey && (
          <div className="mb-8">
            <InitiateTransactionForm
              source={publicKey}
              initiatorId={userId}
              onCreated={() => {
                setShowForm(false);
                void refetch();
              }}
            />
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map(i => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border py-16 text-center text-muted-foreground">
            <p className="text-lg font-medium">No transactions awaiting approval</p>
            <p className="mt-1 text-sm">
              {publicKey
                ? 'Queue a high-value transaction to require co-signer approval before it settles.'
                : 'Connect a wallet to queue a high-value transaction.'}
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-foreground">Awaiting approval</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {pending.map(tx => (
                <PendingTransactionCard
                  key={tx.id}
                  tx={tx}
                  viewerAddress={publicKey}
                  busy={busyId === tx.id}
                  onApprove={onApprove}
                  onExecute={onExecute}
                  onReject={onReject}
                />
              ))}
            </div>
          </section>
        )}

        {resolved.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Resolved</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {resolved.map(tx => (
                <PendingTransactionCard
                  key={tx.id}
                  tx={tx}
                  viewerAddress={publicKey}
                  busy={busyId === tx.id}
                  onApprove={onApprove}
                  onExecute={onExecute}
                  onReject={onReject}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </AuthGuard>
  );
}
