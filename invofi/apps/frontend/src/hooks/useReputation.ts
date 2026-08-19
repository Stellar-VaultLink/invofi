import { useCallback, useEffect, useRef, useState } from 'react';
import { listenToEvents, Networks } from '@invofi/sdk';
import type { InvoiceRepaidData, OfferDefaultedData, ReputationRecordedData } from '@invofi/sdk';
import { getReputationScore } from '@/lib/contract';
import { useToast } from '@/components/ui/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RepaymentOutcome {
  type: 'repaid' | 'defaulted';
  subjectId: string; // invoice or offer ID
  txHash: string;
  ledger: number;
  /** Amount in stroops (only for repayments). */
  amount?: bigint;
  fullyRepaid?: boolean;
}

// ── useReputationScore ───────────────────────────────────────────────────────
/**
 * Fetches the on-chain reputation score for an address.
 *
 * Returns:
 *  - `score`   — 0..100 (null while loading or contract not configured)
 *  - `loading` — true during the fetch
 *  - `error`   — error message if the fetch failed
 *  - `refresh` — manual refresh trigger
 */
export function useReputationScore(address: string | null) {
  const [score, setScore]     = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) { setScore(null); return; }
    setLoading(true);
    setError(null);
    try {
      const s = await getReputationScore(address);
      setScore(s);
    } catch (err) {
      // Reputation contract may not be configured — treat as no score
      setScore(null);
      if (err instanceof Error && !err.message.includes('not set')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { score, loading, error, refresh };
}

// ── useRepaymentHistory ──────────────────────────────────────────────────────
/**
 * Subscribes to the live event stream and filters repayment + default events
 * for the given originator address. Used on the dashboard and profile pages
 * to show the last 20 repayment outcomes.
 */
export function useRepaymentHistory(address: string | null) {
  const { toast } = useToast();
  const [outcomes, setOutcomes] = useState<RepaymentOutcome[]>([]);
  const [loading, setLoading]   = useState(true);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
    const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
    const networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    const contractIds = [
      process.env.NEXT_PUBLIC_REPAYMENT_CONTRACT_ID,
      process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID,
      process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ID,
    ].filter(Boolean) as string[];

    if (contractIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const stop = listenToEvents({
        rpcUrl,
        networkPassphrase,
        contractIds,
        eventTypes: ['inv_rep', 'off_def', 'reputn'],
        onEvent(ev) {
          setLoading(false);
          if (ev.type === 'inv_rep') {
            const d = ev.data as InvoiceRepaidData;
            const outcome: RepaymentOutcome = {
              type: 'repaid' as const,
              subjectId: ev.subjectId,
              txHash: ev.txHash,
              ledger: ev.ledger,
              amount: d.amount,
              fullyRepaid: d.fullyRepaid,
            };
            setOutcomes(prev => [outcome, ...prev].slice(0, 20));
          } else if (ev.type === 'off_def') {
            const d = ev.data as OfferDefaultedData;
            // Only include if this address is involved
            if (d.lender !== address) {
              const outcome: RepaymentOutcome = {
                type: 'defaulted' as const,
                subjectId: ev.subjectId,
                txHash: ev.txHash,
                ledger: ev.ledger,
              };
              setOutcomes(prev => [outcome, ...prev].slice(0, 20));
            }
          }
        },
        onError(err) {
          toast({ title: 'Event stream error', description: err.message, variant: 'destructive' });
          setLoading(false);
        },
      });
      stopRef.current = stop;
    } catch {
      setLoading(false);
    }

    const t = setTimeout(() => setLoading(false), 7_000);
    return () => {
      clearTimeout(t);
      if (stopRef.current) stopRef.current();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return { outcomes, loading };
}
