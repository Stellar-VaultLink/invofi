'use client';

/**
 * SuggestedMatches
 *
 * Renders a section of invoice cards ranked by the matching algorithm.
 * Each card extends MarketplaceCard with a MatchQualityBadge and an optional
 * score breakdown tooltip.
 *
 * The component manages:
 *   - Loading / empty / error states
 *   - "Show all" toggle (override to browse all invoices)
 *   - Score breakdown popover on hover/focus
 */

import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  DollarSign,
  ExternalLink,
  Info,
  Clock,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatAmount, formatDate, formatAddress, INVOICE_STATUS_COLORS } from '@/lib/utils';
import { MatchQualityBadge } from '@/components/marketplace/MatchQualityBadge';
import type { MatchResult, ScoreBreakdown } from '@/types/matching';
import type { Invoice } from '@/types';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const STELLAR_EXPERT = `https://stellar.expert/explorer/${NETWORK}`;

// ── Due label (extracted from MarketplaceCard, kept consistent) ───────────────

function DueLabel({ dueDateUnix }: { dueDateUnix: number }) {
  const now = Date.now() / 1000;
  const diffDays = Math.round((dueDateUnix - now) / 86400);

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {Math.abs(diffDays)}d overdue
      </span>
    );
  }
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
        <Clock className="h-3 w-3 shrink-0" />
        Due in {diffDays}d
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Due {formatDate(dueDateUnix)}
    </span>
  );
}

// ── Score breakdown popover ───────────────────────────────────────────────────

interface ScoreBarProps {
  label: string;
  value: number;
}

function ScoreBar({ label, value }: ScoreBarProps) {
  const color =
    value >= 75 ? 'bg-emerald-500' :
    value >= 50 ? 'bg-blue-500' :
    value >= 25 ? 'bg-amber-500' :
    'bg-red-400';

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${value}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

interface ScoreBreakdownPanelProps {
  breakdown: ScoreBreakdown;
  score: number;
}

function ScoreBreakdownPanel({ breakdown, score }: ScoreBreakdownPanelProps) {
  return (
    <div className="absolute z-10 top-full mt-1 right-0 w-56 rounded-lg border bg-popover p-3 shadow-lg text-popover-foreground space-y-2">
      <p className="text-xs font-semibold">Score breakdown ({score}/100)</p>
      <ScoreBar label="Risk"     value={breakdown.riskScore} />
      <ScoreBar label="Currency" value={breakdown.currencyScore} />
      <ScoreBar label="Yield"    value={breakdown.yieldScore} />
      <ScoreBar label="History"  value={breakdown.historyScore} />
      <ScoreBar label="Duration" value={breakdown.durationScore} />
    </div>
  );
}

// ── Matched invoice card ──────────────────────────────────────────────────────

interface MatchedInvoiceCardProps {
  result: MatchResult;
}

function MatchedInvoiceCard({ result }: MatchedInvoiceCardProps) {
  const { invoice, score, quality, breakdown } = result;
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <Card
      className={cn(
        'flex flex-col transition-all hover:shadow-md',
        quality === 'excellent' && 'ring-1 ring-emerald-300 dark:ring-emerald-700',
        quality === 'good'      && 'hover:border-blue-200 dark:hover:border-blue-800',
      )}
    >
      <CardContent className="pt-5 flex-1 flex flex-col">
        {/* Header: ID + quality badge */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-xs font-mono text-muted-foreground truncate max-w-[90px]">{invoice.id}</p>
            <a
              href={`${STELLAR_EXPERT}/contract/${invoice.originator}`}
              target="_blank"
              rel="noreferrer noopener"
              title="View on Stellar Expert"
              onClick={e => e.stopPropagation()}
              className="text-muted-foreground hover:text-blue-500 transition-colors shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <MatchQualityBadge quality={quality} score={score} />

            {/* Score breakdown trigger */}
            <div className="relative">
              <button
                type="button"
                aria-label="Show score breakdown"
                onMouseEnter={() => setShowBreakdown(true)}
                onMouseLeave={() => setShowBreakdown(false)}
                onFocus={() => setShowBreakdown(true)}
                onBlur={() => setShowBreakdown(false)}
                className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {showBreakdown && (
                <ScoreBreakdownPanel breakdown={breakdown} score={score} />
              )}
            </div>
          </div>
        </div>

        {/* Status + amount */}
        <div className="space-y-2 flex-1 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-foreground">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-lg">
                {formatAmount(invoice.amount)} {invoice.currency}
              </span>
            </div>
            <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <DueLabel dueDateUnix={invoice.due_date} />
          </div>

          <p className="text-xs text-muted-foreground font-mono">
            Originator:{' '}
            <a
              href={`${STELLAR_EXPERT}/account/${invoice.originator}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-blue-500 hover:underline transition-colors"
            >
              {formatAddress(invoice.originator)}
            </a>
          </p>
        </div>

        <Button asChild size="sm" className="w-full">
          <Link href={`/invoices/${invoice.id}`}>
            Make Offer <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function MatchCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-full rounded-md mt-4" />
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SuggestedMatchesProps {
  matches: MatchResult[];
  isLoading: boolean;
  isError: boolean;
  /** Total invoices in the marketplace (for "or browse all N" link). */
  totalInvoices?: number;
  /** Callback when the user wants to see all invoices (override mode). */
  onBrowseAll?: () => void;
  /** Pass-through invoices for the "all invoices" view (rendered externally). */
  allInvoices?: Invoice[];
  className?: string;
}

export function SuggestedMatches({
  matches,
  isLoading,
  isError,
  totalInvoices,
  onBrowseAll,
  className,
}: SuggestedMatchesProps) {
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load matched invoices. Please refresh the page.
      </div>
    );
  }

  return (
    <section className={cn('space-y-4', className)} aria-label="Suggested matches">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            Suggested for you
            {!isLoading && matches.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">
                ({matches.length} match{matches.length !== 1 ? 'es' : ''})
              </span>
            )}
          </h2>
        </div>

        {onBrowseAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBrowseAll}
            className="text-xs text-muted-foreground h-7 px-2"
          >
            Browse all{totalInvoices ? ` ${totalInvoices}` : ''} invoices →
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <MatchCardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && matches.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">No strong matches found</p>
          <p className="text-xs text-muted-foreground">
            Try adjusting your preferences or browse all available invoices.
          </p>
          {onBrowseAll && (
            <Button variant="outline" size="sm" onClick={onBrowseAll} className="mt-2">
              Browse all invoices
            </Button>
          )}
        </div>
      )}

      {/* Results grid */}
      {!isLoading && matches.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map(result => (
            <MatchedInvoiceCard key={result.invoice.id} result={result} />
          ))}
        </div>
      )}
    </section>
  );
}
