'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLocale, useTranslations } from 'next-intl';
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Download, Copy, Check, Send, RefreshCw, Tag, DollarSign, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useWallet } from '@/components/auth/WalletProvider';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { addPositionTrustline, getPositionTokenId, getTokenBalance, getTokenDecimals, hasPositionTrustline, transferPositionToken } from '@/lib/contract';
import { OFFER_STATUS_COLORS } from '@/lib/utils';
import { useFormat } from '@/hooks/useFormat';
import { STROOPS_PER_XLM } from '@/lib/constants';
import { toCsv, downloadCsv } from '@/lib/csv';
import { getXlmUsdInfo, stroopsToUsd } from '@/lib/live/prices';
import { useLivePortfolio } from '@/components/portfolio/LivePortfolioProvider';
import { ConnectionStatus } from '@/components/portfolio/ConnectionStatus';
import { RepaymentProgress } from '@/components/portfolio/RepaymentProgress';
import { PaginationControls } from '@/components/portfolio/PaginationControls';
import { PositionTokensPanel } from '@/components/portfolio/PositionTokensPanel';
import { paginate } from '@/lib/pagination';
import type { LivePosition } from '@/lib/live/types';


const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

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

/** Parse a decimal string (e.g. "12.5") into base units for `decimals` places. */
function toBaseUnits(amount: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(amount)) return null;
  const [whole, frac = ''] = amount.split('.');
  if (frac.length > decimals) return null;
  const padded = frac.padEnd(decimals, '0');
  try {
    return BigInt(whole + padded);
  } catch {
    return null;
  }
}

function isStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
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

/**
 * Task 8: transfer a financed-invoice position token to another wallet.
 * The token is a standard SEP-41 Stellar asset contract minted to the lender
 * on offer acceptance (1 token = 1 base unit of principal — ADR-0002).
 *
 * This is also where a secondary-market sale settles: a listing on the
 * position board (ADR-0004) links here with `?amount=` prefilled, and the
 * seller signs the transfer themselves. The board never mediates it.
 */
function TransferPositionCard() {
  const t = useTranslations('Portfolio.transfer');
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  // Amount handed over by a position listing; ignored unless well-formed.
  const [prefilledAmount] = useState(() => {
    const raw = searchParams.get('amount') ?? '';
    return /^\d+(\.\d{1,7})?$/.test(raw) ? raw : '';
  });
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [decimals, setDecimals] = useState(7);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null);
  const [addingTrustline, setAddingTrustline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState(prefilledAmount);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const id = await getPositionTokenId();
      setTokenId(id);
      if (id) {
        setDecimals(await getTokenDecimals(id));
        setBalance(await getTokenBalance(id, publicKey));
        setHasTrustline(await hasPositionTrustline(publicKey));
      } else {
        setBalance(null);
        setHasTrustline(null);
      }
    } catch {
      // RPC/horizon hiccup — keep the previous state; the user can refresh.
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  const setupTrustline = async () => {
    if (!publicKey) return;
    setAddingTrustline(true);
    try {
      await addPositionTrustline(publicKey);
      toast({ title: t('trustlineAdded'), description: t('trustlineAddedHint') });
      await refresh();
    } catch (err) {
      const msg = toErrorMessage(err, t('trustlineFailedHint'));
      toast({ title: t('trustlineFailed'), description: msg, variant: 'destructive' });
    } finally {
      setAddingTrustline(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async () => {
    if (!tokenId || !publicKey) return;
    const to = recipient.trim();
    if (!isStellarAddress(to)) {
      toast({ title: t('invalidAddress'), description: t('invalidAddressHint'), variant: 'destructive' });
      return;
    }
    const units = toBaseUnits(amount, decimals);
    if (units === null || units <= 0n) {
      toast({ title: t('invalidAmount'), description: t('invalidAmountHint', { decimals }), variant: 'destructive' });
      return;
    }
    if (balance !== null && units > balance) {
      toast({ title: t('insufficient'), description: t('insufficientHint'), variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      // POS is a Stellar asset: the recipient must hold a trustline before a
      // transfer can credit them. Pre-check so the failure is friendly.
      if (!(await hasPositionTrustline(to))) {
        toast({
          title: t('recipientTrustline'),
          description: t('recipientTrustlineHint'),
          variant: 'destructive',
        });
        setBusy(false);
        return;
      }
      await transferPositionToken(tokenId, publicKey, to, units);
      toast({
        title: t('transferred'),
        description: t('transferredHint', { amount, recipient: `${to.slice(0, 6)}…${to.slice(-4)}` }),
      });
      setRecipient('');
      setAmount('');
      await refresh();
    } catch (err) {
      const msg = toErrorMessage(err, t('transferFailedHint'));
      toast({ title: t('transferFailed'), description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const balanceLabel =
    balance === null ? '—' : (Number(balance) / 10 ** decimals).toFixed(decimals > 7 ? 7 : decimals);

  return (
    <Card className="mt-8" id="transfer">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-500" />
            <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading} aria-label={t('refreshBalance')}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{t('description')}</p>
        <p className="text-xs text-muted-foreground mb-4">
          <Tag className="inline h-3 w-3 me-1" />
          {t.rich('secondaryBoard', {
            link: chunks => (
              <Link href="/marketplace/positions" className="text-blue-600 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        {prefilledAmount && (
          <p className="text-xs text-blue-600 mb-4" role="status">
            {t('prefilled', { amount: prefilledAmount })}
          </p>
        )}

        {!publicKey ? (
          <p className="text-sm text-muted-foreground">{t('connectWallet')}</p>
        ) : tokenId === null && !loading ? (
          <p className="text-sm text-muted-foreground">{t('notConfigured')}</p>
        ) : hasTrustline === false ? (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">{t('needsTrustline')}</p>
            <Button size="sm" onClick={setupTrustline} disabled={addingTrustline}>
              {addingTrustline ? t('adding') : t('addTrustline')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('recipientLabel')}</label>
                <input
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="G…"
                  aria-label={t('recipientLabel')}
                  dir="ltr"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t('amountLabel')}{' '}
                  <span className="text-muted-foreground/70">{t('available', { balance: balanceLabel })}</span>
                </label>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.0"
                  aria-label={t('amountLabel')}
                  dir="ltr"
                  inputMode="decimal"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
            <Button onClick={submit} disabled={busy || loading || balance === null || hasTrustline !== true}>
              {busy ? t('transferring') : t('transfer')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CopyId({ id }: { id: string }) {
  const t = useTranslations('Common');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button
      onClick={copy}
      title={copied ? t('copied') : t('copy')}
      className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground group"
    >
      {/* Contract IDs are base32 identifiers — force LTR so they are not
          visually reversed inside an RTL layout. */}
      <span className="truncate max-w-[140px]" dir="ltr">{id}</span>
      {copied
        ? <Check className="h-3 w-3 text-green-500 shrink-0" />
        : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
      }
    </button>
  );
}

/** Live position row: value + yields + streaming repayment progress. */
function PositionCard({ offer }: { offer: LivePosition }) {
  const t = useTranslations('Portfolio.position');
  const tStatus = useTranslations('Status');
  const format = useFormat();
  const relativeUpdate = useRelativeUpdate();
  const Icon = STATUS_ICONS[offer.status] ?? Clock;
  const active = offer.status === 'Accepted' || offer.status === 'Financed';

  return (
    <Card key={offer.id}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CopyId id={offer.invoice_id} />
                <a
                  href={`https://stellar.expert/explorer/${NETWORK}/contract/${offer.invoice_id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-blue-500 hover:underline"
                >
                  ↗
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                {format.percent(offer.interest_rate)} · {t('days', { count: Math.round(offer.duration / 86_400) })}
                {offer.funded_at > 0 && ` · ${t('funded', { date: format.date(offer.funded_at) })}`}
              </p>
            </div>
          </div>
          <div className="text-end flex items-center gap-3 shrink-0">
            <div>
              <p className="text-sm font-semibold font-mono text-foreground">
                {format.currency(offer.amount, offer.currency)}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                ≈ {format.number(offer.liveValueUsd, { style: 'currency', currency: 'USD' })}
              </p>
            </div>
            <Badge className={OFFER_STATUS_COLORS[offer.status]}>{tStatus(offer.status)}</Badge>
          </div>
        </div>

        {active && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t('apy')}</p>
                <p className="text-sm font-semibold font-mono text-foreground">
                  {format.number(offer.apy / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t('earnedToDate')}</p>
                <p className="text-sm font-semibold font-mono text-foreground">
                  {format.currency(offer.earnedToDate, offer.currency)}
                  <span className="text-xs text-muted-foreground font-normal">
                    {' '}≈ {format.number(stroopsToUsd(offer.earnedToDate, offer.currency), { style: 'currency', currency: 'USD' })}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t('repayment')}</p>
                <p className="text-sm font-semibold font-mono text-foreground">
                  {t('percentRepaid', { percent: format.number(offer.repaymentProgress, { style: 'percent' }) })}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <RepaymentProgress
                value={offer.repaymentProgress}
                label={t('progressLabel', { percent: format.number(offer.repaymentProgress, { style: 'percent' }) })}
              />
              <p className="text-xs mt-1 text-muted-foreground">
                {t('repaidRemaining', {
                  repaid: format.currency(offer.amount_repaid, offer.currency),
                  remaining: format.currency(offer.remaining, offer.currency),
                })}{' '}
                ·{' '}
                <span className="text-muted-foreground/70">
                  {t('updated', { when: relativeUpdate(offer.updatedAt) })}
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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

  useEffect(() => {
  supabase.auth.getUser().then(async ({ data }: { data: { user: SupabaseUser | null } }) => {
    const { user } = data;
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: offersData } = await supabase
      .from('financing_offers')
      .select('*, invoice:invoices(*)')
      .eq('lender_id', user.id)
      .order('created_at', { ascending: false });
    const rows = (offersData as unknown as FinancingOffer[]) ?? [];
    setOffers(rows.map(o => ({
      ...o,
      amount: toStroopsBigInt(o.amount),
      amount_repaid: toStroopsBigInt(o.amount_repaid),
    })));
    // Fractional positions count — set to 0 on success, leave null on error
    try {
      const fp = await fetchFractionalPositions(user.id);
      setFractionalCount(fp.length);
    } catch { /* non-fatal — panel stays hidden while null */ }
    setLoading(false);
  });
}, []);

  // An offer is active while it is financing an invoice: from acceptance until
  // it is fully repaid. Partial repayments flip offers to Financed on-chain,
  // so both statuses count as deployed capital.
  const active = offers.filter(o => o.status === 'Accepted' || o.status === 'Financed');
  const repaid = offers.filter(o => o.status === 'Repaid');
  const pending = offers.filter(o => o.status === 'Pending');

  const totalDeployed = active.reduce((sum, o) => sum + Number(o.amount) / STROOPS_PER_XLM, 0);
  const totalEarned = repaid.reduce((sum, o) => {
    const principal = Number(o.amount) / STROOPS_PER_XLM;
    const yield_ = principal * (o.interest_rate / 10000);
    return sum + yield_;
  }, 0);

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
                        <a
                          href={`https://stellar.expert/explorer/${NETWORK}/contract/${offer.invoice_id}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs text-blue-500 hover:underline"
                        >
                          ↗
                        </a>
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
