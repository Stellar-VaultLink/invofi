'use client';

import { ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePayoutHistory } from '@/hooks/useInsurance';
import { formatAddress } from '@/lib/utils';

// ── Helpers ─────────────────────────────────────────────────────────────────

const STROOPS = 10_000_000;
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const EXPLORER = `https://stellar.expert/explorer/${NETWORK}`;

function fmtAmount(v: bigint): string {
  return (Number(v) / STROOPS).toFixed(7).replace(/\.?0+$/, '');
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  pool_stk: { label: 'Staked',   color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300' },
  pool_un:  { label: 'Unstaked', color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300' },
  pool_pay: { label: 'Payout',   color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300' },
};

// ── PayoutHistory ─────────────────────────────────────────────────────────────

/**
 * Displays a live feed of insurance pool events:
 *  - pool_pay  — default payout (highlighted in red)
 *  - pool_stk  — stake events
 *  - pool_un   — unstake events
 *
 * Events are sourced from the Soroban RPC event stream via `usePayoutHistory`.
 */
export function PayoutHistory() {
  const { payouts, allEvents, loadingEvents } = usePayoutHistory();

  const hasInsuranceContract = Boolean(process.env.NEXT_PUBLIC_INSURANCE_CONTRACT_ID);

  return (
    <Card className="mt-6">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-foreground">Insurance Pool Events</h2>
          <span className="text-xs text-muted-foreground">Live</span>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Live stream of stake, unstake, and payout events from the insurance contract.
          Payouts are triggered when an invoice defaults and the lender reclaims.
        </p>

        {!hasInsuranceContract ? (
          <p className="text-sm text-muted-foreground">
            Insurance contract not configured on this deployment.
          </p>
        ) : loadingEvents ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : allEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pool events yet. Events appear here in real time.</p>
        ) : (
          <div className="space-y-2">
            {allEvents.map((ev, i) => {
              const meta = EVENT_LABELS[ev.type] ?? { label: ev.type, color: 'bg-muted text-muted-foreground' };
              // Type-narrow for amount display
              const amount: bigint | undefined =
                (ev.type === 'pool_pay' || ev.type === 'pool_stk' || ev.type === 'pool_un')
                  ? (ev.data as { amount: bigint }).amount
                  : undefined;
              const party: string | undefined =
                (ev.type === 'pool_pay' || ev.type === 'pool_stk' || ev.type === 'pool_un')
                  ? ((ev.data as { recipient?: string; staker?: string }).recipient ??
                     (ev.data as { staker?: string }).staker)
                  : undefined;

              return (
                <div
                  key={`${ev.txHash}-${i}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge className={`${meta.color} shrink-0 text-[10px] px-1.5 py-0`}>
                      {meta.label}
                    </Badge>
                    {party && (
                      <span className="font-mono text-muted-foreground truncate max-w-[120px]">
                        {formatAddress(party)}
                      </span>
                    )}
                    {amount !== undefined && (
                      <span className="font-mono text-foreground tabular-nums">
                        {fmtAmount(amount)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-muted-foreground/70">ledger {ev.ledger}</span>
                    <a
                      href={`${EXPLORER}/tx/${ev.txHash}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-blue-500 hover:text-blue-600"
                      title="View on Stellar Expert"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dedicated payout summary */}
        {payouts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Default payouts ({payouts.length})
            </p>
            <div className="space-y-1.5">
              {payouts.map((p, i) => (
                <div key={`${p.txHash}-${i}`} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">{formatAddress(p.recipient)}</span>
                  <span className="font-mono text-red-600 dark:text-red-400 tabular-nums">
                    {fmtAmount(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
