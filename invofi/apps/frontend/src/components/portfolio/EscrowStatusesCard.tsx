'use client';

// ── Portfolio-wide escrow status card (Epic 3.3) ─────────────────────────────
// Read-only summary of every Trustless Work disbursement escrow backing the
// lender's positions. The interactive milestone flow (confirm delivery /
// approve / release) stays on the invoice detail page where the actor's role
// gates the buttons; this surface answers the portfolio question — "which of
// my disbursements are still in escrow, and where are they in the lifecycle?"
//
// Rendered only when the escrow rail is enabled AND at least one position has
// an escrow id, so portfolios of XLM offers (which never escrow) stay clean.

import { useTranslations } from 'next-intl';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEscrowStatuses } from '@/hooks/useEscrowStatuses';
import { useFormat } from '@/hooks/useFormat';
import {
  ESCROW_VIEWER_URL_TEMPLATE,
  escrowStepOf,
  escrowViewerUrl,
  isEscrowEnabled,
  type EscrowStep,
} from '@/lib/escrow';
import type { FinancingOffer } from '@invofi/sdk';

/** Mirror-backed offer row (financing_offers carries the escrow mapping). */
type EscrowOfferRow = FinancingOffer & { escrow_contract_id?: string | null };

/** Tailwind classes per lifecycle step — mirrors Badge usage on the page. */
const STEP_BADGE: Record<EscrowStep, string> = {
  awaitingDelivery: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  awaitingApproval: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  releasable: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  released: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
  disputed: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
};

const STEP_ORDER: EscrowStep[] = ['awaitingDelivery', 'awaitingApproval', 'releasable', 'released', 'disputed'];

export function EscrowStatusesCard({ offers }: { offers: readonly FinancingOffer[] }) {
  const t = useTranslations('Portfolio.escrow');
  const format = useFormat();

  // Positions that actually carry an escrow mapping (USDC + escrow id).
  // Defined before the hook so the enable check stays a plain condition.
  const escrowed = offers.filter(o => {
    if (o.currency !== 'USDC') return false;
    return Boolean((o as EscrowOfferRow).escrow_contract_id);
  });

  const { byOffer, refresh } = useEscrowStatuses(offers);

  // The rail is off (or mock mode): the whole concept is hidden, not "empty".
  if (!isEscrowEnabled() || escrowed.length === 0) return null;

  // Count positions per lifecycle step. Unavailable rows (read-model miss)
  // and still-loading rows are counted separately so the summary never lies.
  const counts: Record<EscrowStep, number> = {
    awaitingDelivery: 0,
    awaitingApproval: 0,
    releasable: 0,
    released: 0,
    disputed: 0,
  };
  let unavailable = 0;
  let loading = 0;
  for (const o of escrowed) {
    const s = byOffer[o.id];
    if (s === undefined) {
      loading++;
      continue;
    }
    if (s === null) {
      unavailable++;
      continue;
    }
    counts[escrowStepOf(s)]++;
  }
  const actionable = counts.awaitingApproval + counts.releasable + counts.disputed;

  return (
    <Card className="mb-8" data-testid="escrow-statuses">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          </div>
          <button
            onClick={refresh}
            aria-label={t('refresh')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t('description')}</p>

        {/* Summary strip: one pill per lifecycle step, zero-count steps dimmed. */}
        <div className="flex flex-wrap gap-2 mb-4">
          {STEP_ORDER.map(step => (
            <Badge
              key={step}
              className={`${STEP_BADGE[step]} ${counts[step] === 0 ? 'opacity-50' : ''}`}
              data-testid={`escrow-count-${step}`}
            >
              {t(`label.${step}`)}: {counts[step]}
            </Badge>
          ))}
        </div>

        {/* Nudge when something needs the lender/platform's attention. */}
        {actionable > 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-4" role="status">
            {t('actionNeeded', { count: actionable })}
          </p>
        )}

        {/* Per-position rows — read-only; actions live on the invoice page. */}
        <div className="space-y-2">
          {escrowed.map(o => {
            const contractId = (o as EscrowOfferRow).escrow_contract_id as string;
            const s = byOffer[o.id];
            const step = s ? escrowStepOf(s) : null;
            const viewerHref = escrowViewerUrl(contractId, ESCROW_VIEWER_URL_TEMPLATE);
            return (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2"
                data-testid={`escrow-row-${o.id}`}
              >
                <div className="min-w-0">
                  {/* Contract IDs are base32 identifiers — pinned LTR inside
                      RTL text, same as the page's CopyId rows. */}
                  <p className="text-xs font-mono text-muted-foreground truncate max-w-[220px]" dir="ltr">
                    {contractId}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {t('amount', { amount: format.currency(o.amount, o.currency) })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s === undefined ? (
                    <span className="text-xs text-muted-foreground animate-pulse">{t('loading')}</span>
                  ) : s === null ? (
                    <span className="text-xs text-muted-foreground/70">{t('unavailable')}</span>
                  ) : (
                    <Badge className={STEP_BADGE[step as EscrowStep]}>{t(`label.${step}`)}</Badge>
                  )}
                  <a
                    href={viewerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('viewer')}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {unavailable > 0 && (
          <p className="text-[11px] text-muted-foreground/70 mt-3">{t('unavailableHint')}</p>
        )}
      </CardContent>
    </Card>
  );
}
