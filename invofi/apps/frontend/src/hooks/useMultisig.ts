'use client';

// TanStack Query hooks for the multi-sig approval queue (issue #219). The queue
// is shared state — several co-signers act on the same rows — so it polls on an
// interval and every mutation invalidates the list to pull fresh approvals.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_GC_TIME, QUERY_STALE_TIME } from '@/lib/constants';
import {
  approvePendingTransaction,
  createPendingTransaction,
  executePendingTransaction,
  expireStale,
  fetchPendingTransactions,
  rejectPendingTransaction,
  type CreatePendingTransactionInput,
} from '@/lib/multisig';
import type { PendingTransaction, PendingTransactionWithApprovals } from '@/types';

export const PENDING_TX_QUERY_KEY = ['pending-transactions'] as const;

/**
 * The approval queue, newest first, with approvals joined. Polls so a
 * co-signer's approval surfaces without a manual refresh, and runs the
 * best-effort timeout sweep on each load.
 */
export function usePendingTransactions() {
  return useQuery({
    queryKey: PENDING_TX_QUERY_KEY,
    queryFn: async () => {
      const rows = await fetchPendingTransactions();
      const expired = await expireStale(rows);
      if (expired.length === 0) return rows;
      // Reflect the sweep locally so the list is consistent before the next poll.
      const expiredIds = new Set(expired);
      return rows.map(r =>
        expiredIds.has(r.id) ? { ...r, status: 'Expired' as const } : r,
      );
    },
    staleTime: QUERY_STALE_TIME,
    gcTime: QUERY_GC_TIME,
    refetchInterval: 20_000,
  });
}

export function useCreatePendingTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePendingTransactionInput) => createPendingTransaction(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_TX_QUERY_KEY }),
  });
}

export interface ApproveVariables {
  tx: PendingTransaction;
  approverAddress: string;
  approverId: string | null;
}

export function useApproveTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tx, approverAddress, approverId }: ApproveVariables) =>
      approvePendingTransaction(tx, approverAddress, approverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_TX_QUERY_KEY }),
  });
}

export function useExecuteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tx: PendingTransactionWithApprovals) => executePendingTransaction(tx),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_TX_QUERY_KEY }),
  });
}

export function useRejectTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectPendingTransaction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_TX_QUERY_KEY }),
  });
}
