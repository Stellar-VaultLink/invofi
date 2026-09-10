'use client';

import { CheckCircle2, Clock, ExternalLink, Loader2, Send, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { explorerTxUrl } from '@/lib/constants';
import { formatAddress } from '@/lib/utils';
import {
  approvalProgress,
  effectiveStatus,
  secondsUntilExpiry,
} from '@/lib/multisig';
import type {
  PendingTransaction,
  PendingTransactionStatus,
  PendingTransactionWithApprovals,
} from '@/types';
import { ApprovalProgress } from './ApprovalProgress';

const STATUS_STYLES: Record<PendingTransactionStatus, string> = {
  Pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  Executed: 'bg-green-100 text-green-800 border-green-200',
  Rejected: 'bg-red-100 text-red-800 border-red-200',
  Expired:  'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

function formatCountdown(secs: number): string {
  if (secs <= 0) return 'Expired';
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${secs}s left`;
}

interface PendingTransactionCardProps {
  tx: PendingTransactionWithApprovals;
  /** Connected wallet address, or null when no wallet is connected. */
  viewerAddress: string | null;
  busy: boolean;
  onApprove: (tx: PendingTransaction) => void;
  onExecute: (tx: PendingTransactionWithApprovals) => void;
  onReject: (tx: PendingTransaction) => void;
}

/**
 * One row of the approval queue: what the transaction does, how many approvals
 * it has, when it expires, and the actions available to the connected wallet
 * (issue #219). Purely presentational — the page owns the mutations and passes
 * a per-row `busy` flag, mirroring PositionListingCard.
 */
export function PendingTransactionCard({
  tx,
  viewerAddress,
  busy,
  onApprove,
  onExecute,
  onReject,
}: PendingTransactionCardProps) {
  const status = effectiveStatus(tx);
  const progress = approvalProgress(tx, tx.transaction_approvals);
  const viewerApproved =
    !!viewerAddress && tx.transaction_approvals.some(a => a.approver_address === viewerAddress);

  const isPending = status === 'Pending';
  const canApprove = isPending && !!viewerAddress && !viewerApproved && !progress.thresholdMet;
  const canExecute = isPending && progress.thresholdMet;
  // Rejection mutates shared state, so it needs a connected wallet just like
  // approve/execute — the page also gates the handler on the connected key.
  const canReject = isPending && !!viewerAddress;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{tx.title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tx.operation} · initiated by{' '}
              <span className="font-mono">{formatAddress(tx.initiator)}</span>
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              STATUS_STYLES[status],
            )}
          >
            {status}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-semibold text-foreground">
            {tx.amount} {tx.currency}
          </span>
          {isPending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatCountdown(secondsUntilExpiry(tx))}
            </span>
          )}
        </div>

        <ApprovalProgress received={progress.received} required={progress.required} />

        {progress.approvers.length > 0 && (
          <ul className="space-y-1">
            {progress.approvers.map(addr => (
              <li key={addr} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="font-mono">{formatAddress(addr)}</span>
                {addr === viewerAddress && <span className="text-foreground">(you)</span>}
              </li>
            ))}
          </ul>
        )}

        {tx.status === 'Executed' && tx.tx_hash && (
          <a
            href={explorerTxUrl(tx.tx_hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            View transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {(canApprove || canExecute || canReject) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canApprove && (
              <Button size="sm" onClick={() => onApprove(tx)} disabled={busy}>
                {busy ? (
                  <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />
                )}
                Approve
              </Button>
            )}
            {canExecute && (
              <Button size="sm" onClick={() => onExecute(tx)} disabled={busy}>
                {busy ? (
                  <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="me-1.5 h-3.5 w-3.5" />
                )}
                Execute
              </Button>
            )}
            {canReject && (
              <Button size="sm" variant="outline" onClick={() => onReject(tx)} disabled={busy}>
                <XCircle className="me-1.5 h-3.5 w-3.5" />
                Reject
              </Button>
            )}
          </div>
        )}

        {isPending && !viewerAddress && (
          <p className="text-xs text-muted-foreground">Connect a wallet to approve or reject.</p>
        )}
        {isPending && viewerApproved && !canExecute && (
          <p className="text-xs text-green-600">You have approved. Waiting for co-signers.</p>
        )}
      </CardContent>
    </Card>
  );
}
