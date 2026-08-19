'use client';

import { useState } from 'react';
import { Shield, RefreshCw, Coins, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInsurancePool } from '@/hooks/useInsurance';

// ── Helpers ─────────────────────────────────────────────────────────────────

const STROOPS = 10_000_000;

function formatStroops(v: bigint | null): string {
  if (v === null) return '—';
  return (Number(v) / STROOPS).toFixed(7).replace(/\.?0+$/, '');
}

/** Parse human-unit decimal into stroops bigint. Returns null on invalid input. */
function parseToStroops(v: string): bigint | null {
  if (!/^\d+(\.\d{1,7})?$/.test(v.trim())) return null;
  const [whole, frac = ''] = v.trim().split('.');
  const padded = frac.padEnd(7, '0').slice(0, 7);
  try {
    return BigInt(whole + padded);
  } catch {
    return null;
  }
}

// ── InsurancePanel ───────────────────────────────────────────────────────────

interface InsurancePanelProps {
  /** Connected wallet address (null = wallet not connected). */
  walletAddress: string | null;
}

/**
 * Full insurance-pool section for the portfolio page.
 *
 * Displays:
 *  - Pool total (from the on-chain insurance contract)
 *  - Connected wallet's staked balance (on-chain read, refreshed after mutations)
 *  - Stake / unstake form
 */
export function InsurancePanel({ walletAddress }: InsurancePanelProps) {
  const { poolTotal, stakedBalance, loading, staking, unstaking, stake, unstake, refresh } =
    useInsurancePool(walletAddress);

  const [amount, setAmount] = useState('');

  const parsedAmount = parseToStroops(amount);
  const hasSufficientStake =
    parsedAmount !== null && stakedBalance !== null && parsedAmount <= stakedBalance;

  const handleStake = async () => {
    if (!parsedAmount || parsedAmount <= 0n) return;
    await stake(parsedAmount);
    setAmount('');
  };

  const handleUnstake = async () => {
    if (!parsedAmount || parsedAmount <= 0n) return;
    await unstake(parsedAmount);
    setAmount('');
  };

  return (
    <Card className="mt-6" id="insurance">
      <CardContent className="pt-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-500" />
            <h2 className="text-lg font-semibold text-foreground">Insurance Pool</h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh insurance data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Stake tokens into the protocol insurance pool to back payouts when invoices default.
          Your staked balance earns exposure to protocol yield and can be withdrawn at any time.
        </p>

        {/* Pool stats */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Coins className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Pool Total</span>
            </div>
            {loading ? (
              <Skeleton className="h-5 w-28 mt-1" />
            ) : (
              <p className="text-base font-semibold font-mono text-foreground tabular-nums">
                {formatStroops(poolTotal)}
              </p>
            )}
          </div>

          <div className="rounded-xl bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Your Staked</span>
            </div>
            {loading ? (
              <Skeleton className="h-5 w-28 mt-1" />
            ) : !walletAddress ? (
              <p className="text-sm text-muted-foreground mt-0.5">—</p>
            ) : (
              <p className="text-base font-semibold font-mono text-foreground tabular-nums">
                {formatStroops(stakedBalance)}
              </p>
            )}
          </div>
        </div>

        {/* Stake / unstake form */}
        {!walletAddress ? (
          <p className="text-sm text-muted-foreground">Connect a wallet to stake or unstake.</p>
        ) : (
          <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label
                htmlFor="insurance-amount"
                className="text-xs font-medium text-muted-foreground mb-1 block"
              >
                Amount
                {stakedBalance !== null && (
                  <span className="ml-1 text-muted-foreground/70">
                    (staked: {formatStroops(stakedBalance)})
                  </span>
                )}
              </label>
              <input
                id="insurance-amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleUnstake}
                disabled={
                  unstaking ||
                  staking ||
                  !parsedAmount ||
                  parsedAmount <= 0n ||
                  !hasSufficientStake
                }
                title={
                  !hasSufficientStake && parsedAmount
                    ? 'Insufficient staked balance'
                    : undefined
                }
              >
                <ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" />
                {unstaking ? 'Unstaking…' : 'Unstake'}
              </Button>
              <Button
                onClick={handleStake}
                disabled={staking || unstaking || !parsedAmount || parsedAmount <= 0n}
              >
                <ArrowUpFromLine className="h-3.5 w-3.5 mr-1.5" />
                {staking ? 'Staking…' : 'Stake'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
