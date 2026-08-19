'use client';

import { ShieldCheck, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReputationScore, useRepaymentHistory } from '@/hooks/useReputation';
import { formatAddress, formatAmount } from '@/lib/utils';

// ── Helpers ─────────────────────────────────────────────────────────────────

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const EXPLORER = `https://stellar.expert/explorer/${NETWORK}`;

/**
 * Derive a label and Tailwind colour from the 0–100 score.
 *
 * Score bands match the three protocol risk tiers (A/B/C):
 *  80–100 → A (Green / Low Risk)
 *  50–79  → B (Amber / Medium Risk)
 *  0–49   → C (Red / High Risk)
 */
function scoreStyle(score: number): { label: string; barColor: string; badgeClass: string } {
  if (score >= 80) {
    return {
      label: 'Excellent',
      barColor: 'bg-emerald-500',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
    };
  }
  if (score >= 50) {
    return {
      label: 'Good',
      barColor: 'bg-amber-400',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
    };
  }
  return {
    label: 'Poor',
    barColor: 'bg-red-500',
    badgeClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
  };
}

// ── ReputationCard ───────────────────────────────────────────────────────────

interface ReputationCardProps {
  /** Stellar address whose reputation to display. */
  address: string | null;
  /**
   * Whether to show the repayment history event stream.
   * Set false on the marketplace card to keep it compact.
   */
  showHistory?: boolean;
  className?: string;
}

/**
 * Displays the on-chain reputation score for an originator address,
 * optionally with their recent repayment/default history.
 *
 * Used on:
 *  - `/dashboard` — full card for the connected business account
 *  - Marketplace invoice detail — compact badge form (showHistory=false)
 */
export function ReputationCard({ address, showHistory = true, className }: ReputationCardProps) {
  const { score, loading: scoreLoading } = useReputationScore(address);
  const { outcomes, loading: histLoading } = useRepaymentHistory(showHistory ? address : null);

  const hasReputationContract = Boolean(process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ID);

  if (!hasReputationContract) {
    return null; // silently hide when not deployed
  }

  const style = score !== null ? scoreStyle(score) : null;

  return (
    <Card className={className}>
      <CardContent className="pt-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          <h2 className="text-lg font-semibold text-foreground">Reputation</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          On-chain trust score computed from repayment history (0 = worst, 100 = best).
          One default outweighs two repayments.
        </p>

        {/* Score display */}
        {scoreLoading ? (
          <div className="space-y-2 mb-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ) : score === null ? (
          <p className="text-sm text-muted-foreground mb-4">No score recorded yet.</p>
        ) : (
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-foreground">
                {score}
              </span>
              <span className="text-sm text-muted-foreground">/&nbsp;100</span>
              {style && (
                <Badge className={style.badgeClass}>{style.label}</Badge>
              )}
            </div>

            {/* Score bar */}
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden" aria-hidden>
              <div
                className={`h-2 rounded-full transition-all ${style?.barColor ?? 'bg-blue-500'}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {score >= 80
                ? 'This originator has a strong repayment track record.'
                : score >= 50
                ? 'Mixed repayment history — review offers carefully.'
                : 'High-risk originator. Proceed with caution.'}
            </p>
          </div>
        )}

        {/* Repayment history (event stream) */}
        {showHistory && (
          <>
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent outcomes</p>

              {histLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
                </div>
              ) : outcomes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No repayment events yet. Events appear here live.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {outcomes.map((ev, i) => (
                    <div
                      key={`${ev.txHash}-${i}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {ev.type === 'repaid' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="font-mono text-muted-foreground truncate max-w-[120px]">
                          {ev.subjectId}
                        </span>
                        {ev.type === 'repaid' && ev.amount !== undefined && (
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {formatAmount(ev.amount)}
                            {ev.fullyRepaid ? ' ✓' : ' (partial)'}
                          </span>
                        )}
                        {ev.type === 'defaulted' && (
                          <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                      </div>
                      <a
                        href={`${EXPLORER}/tx/${ev.txHash}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-blue-500 hover:text-blue-600 shrink-0 ml-2"
                        title="View on Stellar Expert"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Inline compact badge for marketplace cards ───────────────────────────────

interface ReputationScoreBadgeProps {
  address: string;
}

/**
 * Compact inline score badge for the marketplace card.
 * Shows score/100 with colour coding; renders nothing when not configured.
 */
export function ReputationScoreBadge({ address }: ReputationScoreBadgeProps) {
  const { score, loading } = useReputationScore(address);

  if (!process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ID) return null;

  if (loading) {
    return <Skeleton className="inline-block h-4 w-10 rounded-md" />;
  }

  if (score === null) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        —
      </span>
    );
  }

  const { label, badgeClass } = scoreStyle(score);

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeClass}`}
      title={`Reputation: ${score}/100 — ${label}`}
    >
      <ShieldCheck className="h-2.5 w-2.5" />
      {score}
    </span>
  );
}
