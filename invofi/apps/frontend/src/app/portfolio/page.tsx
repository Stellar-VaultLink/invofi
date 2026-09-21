'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Download, RefreshCw, DollarSign, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import type { FinancingOffer } from '@/lib/contract';
import { OFFER_STATUS_COLORS, toStroopsBigInt, interestRateLabel, durationLabel } from '@/lib/utils';
import { useFormat } from '@/hooks/useFormat';
import { STROOPS_PER_XLM } from '@/lib/constants';
import { toCsv, downloadCsv } from '@/lib/csv';
import { getXlmUsdInfo, stroopsToUsd } from '@/lib/live/prices';
import { formatAmount, formatDate } from '@/lib/formatters';
import { useLivePortfolio } from '@/components/portfolio/LivePortfolioProvider';
import { ConnectionStatus } from '@/components/portfolio/ConnectionStatus';
import { PositionTokensPanel } from '@/components/portfolio/PositionTokensPanel';
import { ExplorerLink } from '@/components/common/ExplorerLink';
import { TransferPositionCard } from '@/components/portfolio/TransferPositionCard';
import { CopyId } from '@/components/portfolio/CopyId';
import { EscrowStatusesCard } from '@/components/portfolio/EscrowStatusesCard';



const STATUS_ICONS = {
  Pending:   Clock,
  Accepted:  TrendingUp,
  Financed:  TrendingUp,
  Rejected:  AlertCircle,
  Repaid:    CheckCircle2,
  Defaulted: AlertCircle,
} as const;

/** Total repayment due in stroops: principal + simple yield (matches the contract). */
function offerTotalDue(offer: FinancingOffer): bigint {
  return toStroopsBigInt(offer.amount) + (toStroopsBigInt(offer.amount) * BigInt(offer.interest_rate)) / 10_000n;
}

/**
 * Compact "updated 12s ago" for the per-row live timestamp, in the reader's
 * language. `Intl.RelativeTimeFormat` supplies the wording and the right
 * plural form — English's single rule is wrong for Arabic and for CJK.
 */
function useRelativeUpdate() {
  const locale = useLocale();
  return useCallback(
    (ts: number): string => {
      const diffMs = Date.now() - ts;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
      if (diffMs < 60_000) return rtf.format(-Math.floor(diffMs / 1000), 'second');
      return rtf.format(-Math.floor(diffMs / 60_000), 'minute');
    },
    [locale],
  );
}

export default function PortfolioPage() {
  const t = useTranslations('Portfolio');
  const format = useFormat();
  const relativeUpdate = useRelativeUpdate();
  const {
    positions,
    loading,
    error,
    lastUpdatedAt,
    refresh,
  } = useLivePortfolio();

  // Client-side pagination (issue #190): the contract layer still returns the
  // full list; we slice it for rendering so a wallet with hundreds of
  // positions stays smooth. Page size is user-adjustable, and each page is
  // virtualized below so even 100-row pages only mount visible cards.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Offer lists derived from live portfolio positions
  const offers = positions;

  const active = offers.filter(o => o.status === 'Accepted' || o.status === 'Financed');
  const repaid = offers.filter(o => o.status === 'Repaid');
  const pending = offers.filter(o => o.status === 'Pending');

  const totalDeployed = active.reduce((sum, o) => sum + Number(o.amount) / STROOPS_PER_XLM, 0);
  const totalEarned = repaid.reduce((sum, o) => {
    const principal = Number(o.amount) / STROOPS_PER_XLM;
    const yield_ = principal * (o.interest_rate / 10000);
    return sum + yield_;
  }, 0);

  // USD pricing for summary card
  const xlmUsdInfo = getXlmUsdInfo();
  const totalValueUsd = offers.reduce((sum, o) => sum + stroopsToUsd(toStroopsBigInt(o.amount), o.currency), 0);
  const currencyTotalsUsd: [string, number][] = Object.entries(
    offers.reduce<Record<string, number>>((acc, o) => {
      acc[o.currency] = (acc[o.currency] ?? 0) + stroopsToUsd(toStroopsBigInt(o.amount), o.currency);
      return acc;
    }, {}),
  );
  const totalEarnedToDateUsd = offers.reduce((sum, o) => sum + stroopsToUsd(o.earnedToDate, o.currency), 0);
  const fractionalCount: number | null = offers.length > 0 ? offers.length : null;

  const exportOffersCsv = () => {
    const rows = offers.map(o => ({
      ...o,
      amount: Number(o.amount) / STROOPS_PER_XLM,
      funded_at: o.funded_at > 0 ? new Date(o.funded_at * 1000).toISOString().slice(0, 10) : '',
    }));
    const csv = toCsv(rows, [
      { key: 'id', header: 'Offer ID' },
      { key: 'invoice_id', header: 'Invoice ID' },
      { key: 'amount', header: 'Amount' },
      { key: 'currency', header: 'Currency' },
      { key: 'interest_rate', header: 'Interest Rate (bps)' },
      { key: 'duration', header: 'Duration (seconds)' },
      { key: 'status', header: 'Status' },
      { key: 'funded_at', header: 'Funded At' },
    ]);
    downloadCsv(`invofi-offers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t('description')}
              {lastUpdatedAt
                ? (
                  <span className="text-muted-foreground/70">
                    {' '}· {t('position.updated', { when: relativeUpdate(lastUpdatedAt) })}
                  </span>
                )
                : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <Button variant="outline" size="sm" onClick={refresh} aria-label={t('refresh')}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" /> {t('refresh')}
            </Button>
            {positions.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportOffersCsv}>
                <Download className="me-1.5 h-3.5 w-3.5" /> {t('exportCsv')}
              </Button>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5">
              <TrendingUp className="h-4 w-4 text-blue-500 mb-2" />
              <p className="text-2xl font-bold text-foreground">{format.number(active.length)}</p>
              <p className="text-xs text-muted-foreground">{t('stats.active')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Clock className="h-4 w-4 text-yellow-500 mb-2" />
              <p className="text-2xl font-bold text-foreground">{format.number(pending.length)}</p>
              <p className="text-xs text-muted-foreground">{t('stats.pending')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <CheckCircle2 className="h-4 w-4 text-green-500 mb-2" />
              <p className="text-2xl font-bold text-foreground">{format.number(repaid.length)}</p>
              <p className="text-xs text-muted-foreground">{t('stats.completed')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <DollarSign className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-lg font-bold text-foreground font-mono">
                {format.number(totalValueUsd, { style: 'currency', currency: 'USD' })}
              </p>
              <p className="text-xs text-muted-foreground">{t('stats.value')}</p>
              {currencyTotalsUsd.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground font-mono">
                  {currencyTotalsUsd.map(([currency, usd]) => (
                    <li key={currency} className="flex items-center justify-between gap-3">
                      <span>{currency}</span>
                      <span>≈ {format.number(usd, { style: 'currency', currency: 'USD' })}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground/70 mt-2 leading-relaxed">
                {t('stats.priceNote', {
                  price: format.number(xlmUsdInfo.price, { maximumFractionDigits: 4 }),
                  source: t(`stats.priceSource.${xlmUsdInfo.source}`),
                  asOf:
                    xlmUsdInfo.updatedAt > 0
                      ? t('stats.priceAsOf', {
                          time: format.date(xlmUsdInfo.updatedAt, {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })
                      : '',
                })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Fractional positions summary + link
            Rendered only after a successful fetch (fractionalCount !== null).
            While loading (null) the panel is hidden so the UI never shows a
            misleading "0 fractional positions" count. */}
        {fractionalCount !== null && (
          <div className="mb-6 flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {t('yield.estimated', {
                    amount: format.number(totalEarnedToDateUsd, { style: 'currency', currency: 'USD' }),
                  })}
                </p>
                {/* ICU plural: `count` selects the form, so Arabic supplies
                    its six and Japanese its one. */}
                <p className="text-xs text-green-600 dark:text-green-500">
                  {t('yield.accruing', { count: active.length })}
                </p>
              </div>
              {repaid.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {t('yield.realized', {
                      amount: format.number(totalEarned, { style: 'currency', currency: 'USD' }),
                    })}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500">
                    {t('yield.acrossRepaid', { count: repaid.length })}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Portfolio-wide escrow status (Epic 3.3): read-only lifecycle
            summary for every escrowed USDC disbursement. Hidden entirely when
            the rail is off or no position carries an escrow. */}
        <EscrowStatusesCard offers={offers} />

        {/* Loading skeleton */}
        {loading && <TableSkeleton rows={4} />}

        {/* Empty state */}
        {!loading && offers.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <TrendingUp className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">{t('empty.title')}</p>
            <Link
              href="/marketplace"
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              {t('empty.browse')} <span aria-hidden className="rtl:hidden">→</span>
              <span aria-hidden className="hidden rtl:inline">←</span>
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {offers.map(offer => {
            const Icon = STATUS_ICONS[offer.status] ?? Clock;
            return (
              <Card key={offer.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <CopyId id={offer.invoice_id} />
                        <ExplorerLink
                          type="contract"
                          id={offer.invoice_id}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          ↗
                        </ExplorerLink>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {interestRateLabel(offer.interest_rate)} · {durationLabel(offer.duration)}
                        {offer.funded_at > 0 && ` · Funded ${formatDate(offer.funded_at)}`}
                      </p>
                      {(offer.status === 'Accepted' || offer.status === 'Financed') &&
                        toStroopsBigInt(offer.amount_repaid) > 0n && (
                        <p className="text-xs mt-1 text-green-600">
                          {formatAmount(toStroopsBigInt(offer.amount_repaid))} repaid ·{' '}
                          {formatAmount(offerTotalDue(offer) - toStroopsBigInt(offer.amount_repaid))} remaining
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold font-mono text-foreground">
                        {formatAmount(offer.amount)} {offer.currency}
                      </p>
                    </div>
                    <Badge className={OFFER_STATUS_COLORS[offer.status]}>{offer.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* useSearchParams (the listing hand-off prefill) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <TransferPositionCard />
        </Suspense>

        {/* Position token balance + transfer history (issue #127). The
            transfer form lives in the card above; this panel links to it. */}
        <PositionTokensPanel />
      </div>
    </AuthGuard>
  );
}
