import { useCallback, useEffect, useRef, useState } from 'react';
import { listenToEvents, Networks } from '@invofi/sdk';
import type { PoolPayoutData, PoolStakedData, PoolUnstakedData, ProtocolEvent } from '@invofi/sdk';
import { getInsurancePoolTotal, getStakedBalance, stakeIntoPool, unstakeFromPool } from '@/lib/contract';
import { useToast } from '@/components/ui/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────

/** A decoded payout-history entry sourced from `pool_pay` events. */
export interface PayoutEvent {
  txHash: string;
  ledger: number;
  recipient: string;
  amount: bigint;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getRpcConfig() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
  const networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  const contractIds = [
    process.env.NEXT_PUBLIC_INSURANCE_CONTRACT_ID,
  ].filter(Boolean) as string[];
  return { rpcUrl, networkPassphrase, contractIds };
}

// ── useInsurancePool ─────────────────────────────────────────────────────────
/**
 * Reads insurance pool state (total and the connected wallet's staked balance)
 * and exposes stake/unstake mutations.
 *
 * Returns:
 *  - `poolTotal`   — aggregate pool in stroops (bigint | null while loading)
 *  - `stakedBalance` — caller's staked stroops (bigint | null while loading)
 *  - `loading`     — initial data fetch in progress
 *  - `staking` / `unstaking` — mutation in progress
 *  - `stake(amount)` / `unstake(amount)` — mutate and auto-refresh
 *  - `refresh()`   — manual refresh
 */
export function useInsurancePool(walletAddress: string | null) {
  const { toast } = useToast();
  const [poolTotal, setPoolTotal]     = useState<bigint | null>(null);
  const [stakedBalance, setStakedBalance] = useState<bigint | null>(null);
  const [loading, setLoading]         = useState(true);
  const [staking, setStaking]         = useState(false);
  const [unstaking, setUnstaking]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [total, staked] = await Promise.all([
        getInsurancePoolTotal().catch(() => null),
        walletAddress ? getStakedBalance(walletAddress).catch(() => null) : Promise.resolve(null),
      ]);
      setPoolTotal(total ?? null);
      setStakedBalance(staked ?? null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stake = useCallback(async (amount: bigint) => {
    if (!walletAddress) {
      toast({ title: 'Connect wallet', description: 'Connect your wallet to stake.', variant: 'destructive' });
      return;
    }
    setStaking(true);
    try {
      await stakeIntoPool(amount, walletAddress);
      toast({ title: 'Staked', description: 'Your stake was submitted to the insurance pool.' });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stake failed';
      toast({ title: 'Stake failed', description: msg, variant: 'destructive' });
    } finally {
      setStaking(false);
    }
  }, [walletAddress, toast, refresh]);

  const unstake = useCallback(async (amount: bigint) => {
    if (!walletAddress) {
      toast({ title: 'Connect wallet', description: 'Connect your wallet to unstake.', variant: 'destructive' });
      return;
    }
    setUnstaking(true);
    try {
      await unstakeFromPool(amount, walletAddress);
      toast({ title: 'Unstaked', description: 'Your stake was withdrawn from the insurance pool.' });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unstake failed';
      toast({ title: 'Unstake failed', description: msg, variant: 'destructive' });
    } finally {
      setUnstaking(false);
    }
  }, [walletAddress, toast, refresh]);

  return { poolTotal, stakedBalance, loading, staking, unstaking, stake, unstake, refresh };
}

// ── usePayoutHistory ─────────────────────────────────────────────────────────
/**
 * Subscribes to the live on-chain event stream for insurance-related events
 * (`pool_pay`, `pool_stk`, `pool_un`) and accumulates the last 50 events.
 *
 * The hook stops the stream on unmount. `loadingEvents` is true only during
 * the brief initial setup; once the first poll completes it flips to false.
 */
export function usePayoutHistory() {
  const { toast } = useToast();
  const [payouts, setPayouts]         = useState<PayoutEvent[]>([]);
  const [allEvents, setAllEvents]     = useState<ProtocolEvent[]>([]);
  const [loadingEvents, setLoading]   = useState(true);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const { rpcUrl, networkPassphrase, contractIds } = getRpcConfig();
    if (contractIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const stop = listenToEvents({
        rpcUrl,
        networkPassphrase,
        contractIds,
        eventTypes: ['pool_pay', 'pool_stk', 'pool_un'],
        onEvent(ev) {
          setAllEvents(prev => [ev, ...prev].slice(0, 50));
          if (ev.type === 'pool_pay') {
            const d = ev.data as PoolPayoutData;
            setPayouts(prev => [
              { txHash: ev.txHash, ledger: ev.ledger, recipient: d.recipient, amount: d.amount },
              ...prev,
            ].slice(0, 50));
          }
          setLoading(false);
        },
        onError(err) {
          toast({ title: 'Event stream error', description: err.message, variant: 'destructive' });
          setLoading(false);
        },
      });
      stopRef.current = stop;
    } catch (err) {
      toast({ title: 'Events failed', description: String(err), variant: 'destructive' });
      setLoading(false);
    }

    // Mark initial loading done after first poll interval
    const t = setTimeout(() => setLoading(false), 7_000);
    return () => {
      clearTimeout(t);
      if (stopRef.current) stopRef.current();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { payouts, allEvents, loadingEvents };
}
