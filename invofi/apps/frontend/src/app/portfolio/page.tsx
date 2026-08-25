'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Download, Copy, Check, Send, RefreshCw, Tag, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useWallet } from '@/components/auth/WalletProvider';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { useToast } from '@/components/ui/use-toast';
import { toErrorMessage } from '@/lib/errors';
import { addPositionTrustline, getPositionTokenId, getTokenBalance, getTokenDecimals, hasPositionTrustline, transferPositionToken } from '@/lib/contract';
import { formatDate, interestRateLabel, durationLabel, OFFER_STATUS_COLORS } from '@/lib/utils';
import { formatAmount as formatAmountDisplay } from '@/lib/formatters';
import { STROOPS_PER_XLM } from '@/lib/constants';
import { toCsv, downloadCsv } from '@/lib/csv';
import { getXlmUsdInfo, stroopsToUsd } from '@/lib/live/prices';
import { useLivePortfolio } from '@/components/portfolio/LivePortfolioProvider';
import { ConnectionStatus } from '@/components/portfolio/ConnectionStatus';
import { RepaymentProgress } from '@/components/portfolio/RepaymentProgress';
import { PaginationControls } from '@/components/portfolio/PaginationControls';
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

/** Compact "updated Xs ago" for the per-row live timestamp. */
function relativeUpdate(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 1_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60_000)}m ago`;
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
      toast({ title: 'Trustline added', description: 'Your wallet can now hold POS position tokens.' });
      await refresh();
    } catch (err) {
      const msg = toErrorMessage(err, 'Trustline setup failed');
      toast({ title: 'Trustline failed', description: msg, variant: 'destructive' });
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
      toast({ title: 'Invalid address', description: 'Enter a valid Stellar address (G…).', variant: 'destructive' });
      return;
    }
    const units = toBaseUnits(amount, decimals);
    if (units === null || units <= 0n) {
      toast({ title: 'Invalid amount', description: `Enter an amount with at most ${decimals} decimal places.`, variant: 'destructive' });
      return;
    }
    if (balance !== null && units > balance) {
      toast({ title: 'Insufficient balance', description: 'You do not hold enough position tokens for this transfer.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      // POS is a Stellar asset: the recipient must hold a trustline before a
      // transfer can credit them. Pre-check so the failure is friendly.
      if (!(await hasPositionTrustline(to))) {
        toast({
          title: 'Recipient needs a trustline',
          description:
            'The recipient wallet has no POS trustline yet. Ask them to add one (any wallet or this app) before transferring.',
          variant: 'destructive',
        });
        setBusy(false);
        return;
      }
      await transferPositionToken(tokenId, publicKey, to, units);
      toast({ title: 'Position transferred', description: `Sent ${amount} position tokens to ${to.slice(0, 6)}…${to.slice(-4)}.` });
      setRecipient('');
      setAmount('');
      await refresh();
    } catch (err) {
      const msg = toErrorMessage(err, 'Transaction failed');
      toast({ title: 'Transfer failed', description: msg, variant: 'destructive' });
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
            <h2 className="text-lg font-semibold text-foreground">Transfer Position</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading} aria-label="Refresh balance">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Position tokens represent your claim on financed invoices (1 token = 1 base unit of
          principal). Send them to another Stellar wallet to transfer the position.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          <Tag className="inline h-3 w-3 mr-1" />
          Looking for a buyer?{' '}
          <Link href="/marketplace/positions" className="text-blue-600 hover:underline">
            List the position on the secondary board
          </Link>{' '}
          — settlement still happens here, with this transfer.
        </p>
        {prefilledAmount && (
          <p className="text-xs text-blue-600 mb-4" role="status">
            Amount prefilled from your listing ({prefilledAmount} tokens). Enter the buyer&apos;s
            address to settle.
          </p>
        )}

        {!publicKey ? (
          <p className="text-sm text-muted-foreground">Connect a wallet to view and transfer positions.</p>
        ) : tokenId === null && !loading ? (
          <p className="text-sm text-muted-foreground">
            Position tokens are not configured on this deployment yet.
          </p>
        ) : hasTrustline === false ? (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
              Position tokens are Stellar assets — add a POS trustline once to
              receive and transfer them.
            </p>
            <Button size="sm" onClick={setupTrustline} disabled={addingTrustline}>
              {addingTrustline ? 'Adding…' : 'Add POS trustline'}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Recipient address</label>
                <input
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="G…"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Amount <span className="text-muted-foreground/70">(available: {balanceLabel})</span>
                </label>
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
            <Button onClick={submit} disabled={busy || loading || balance === null || hasTrustline !== true}>
              {busy ? 'Transferring…' : 'Transfer'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CopyId({ id }: { id: string }) {
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
      title={copied ? 'Copied!' : 'Copy ID'}
      className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground group"
    >
      <span className="truncate max-w-[140px]">{id}</span>
      {copied
        ? <Check className="h-3 w-3 text-green-500 shrink-0" />
        : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
      }
    </button>
  );
}

/** Live position row: value + yields + streaming repayment progress. */
function PositionCard({ offer }: { offer: LivePosition }) {
  const Icon = STATUS_ICONS[offer.status] ?? Clock;
  const active = offer.status === 'Accepted' || offer.status === 'Financed';
  const pct = Math.round(offer.repaymentProgress * 100);

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
                {interestRateLabel(offer.interest_rate)} · {durationLabel(offer.duration)}
                {offer.funded_at > 0 && ` · Funded ${formatDate(offer.funded_at)}`}
              </p>
            </div>
          </div>
          <div className="text-right flex items-center gap-3 shrink-0">
            <div>
              <p className="text-sm font-semibold font-mono text-foreground">
                {formatAmountDisplay(offer.amount, offer.currency)}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                ≈ ${offer.liveValueUsd.toFixed(2)} USD
              </p>
            </div>
            <Badge className={OFFER_STATUS_COLORS[offer.status]}>{offer.status}</Badge>
          </div>
        </div>

        {active && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">APY</p>
                <p className="text-sm font-semibold font-mono text-foreground">{offer.apy.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Earned to date</p>
                <p className="text-sm font-semibold font-mono text-foreground">
                  {formatAmountDisplay(offer.earnedToDate, offer.currency)}
                  <span className="text-xs text-muted-foreground font-normal">
                    {' '}≈ ${stroopsToUsd(offer.earnedToDate, offer.currency).toFixed(2)}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Repayment</p>
                <p className="text-sm font-semibold font-mono text-foreground">{pct}% repaid</p>
              </div>
            </div>
            <div className="mt-3">
              <RepaymentProgress value={offer.repaymentProgress} label={`${pct}% of total due repaid`} />
              <p className="text-xs mt-1 text-muted-foreground">
                {formatAmountDisplay(offer.amount_repaid, offer.currency)} repaid · {formatAmountDisplay(offer.remaining, offer.currency)} remaining ·{' '}
                <span className="text-muted-foreground/70">updated {relativeUpdate(offer.updatedAt)}</span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortfolioPage() {
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

  // Keep the current page valid when the stream shrinks (e.g. repayments move
  // positions between buckets or the wallet changes).
  const pageCount = Math.max(1, Math.ceil(positions.length / pageSize));
  useEffect(() => {
    setPage(p => Math.min(p, pageCount));
  }, [pageCount]);

  const pageItems = useMemo(
    () => paginate(positions, page, pageSize),
    [positions, page, pageSize],
  );

  // Virtualize the current page's rows. Every card uses `measureElement` so
  // rows with different heights (active vs repaid) size correctly.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: pageItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 148,
    overscan: 4,
    // Placeholder height is overridden per-row by measureElement below.
  });

  // An offer is active while it is financing an invoice: from acceptance until
  // it is fully repaid. Partial repayments flip offers to Financed on-chain,
  // so both statuses count as deployed capital.
  const active = positions.filter(o => o.status === 'Accepted' || o.status === 'Financed');
  const repaid = positions.filter(o => o.status === 'Repaid');
  const pending = positions.filter(o => o.status === 'Pending');

  const totalValueUsd = active.reduce((sum, o) => sum + o.liveValueUsd, 0);

  // Per-currency subtotals (issue #182): portfolios mix XLM and USDC, so show
  // each currency's own total plus the USD-equivalent grand total above. All
  // conversions use the cached reference rate — never a live oracle — so the
  // card is labeled approximate with the rate source and as-of time.
  const currencyTotalsUsd = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const o of active) {
      buckets.set(o.currency, (buckets.get(o.currency) ?? 0) + o.liveValueUsd);
    }
    return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
  }, [active]);
  const xlmUsdInfo = getXlmUsdInfo();
  const totalEarnedToDateUsd = active.reduce(
    (sum, o) => sum + stroopsToUsd(o.earnedToDate, o.currency),
    0,
  );
  // Repaid positions may be in different currencies — never sum raw yields as
  // if they were the same asset. Convert each to USD first.
  const totalEarned = repaid.reduce((sum, o) => {
    const yield_ = o.totalDue - o.amount;
    return sum + stroopsToUsd(yield_, o.currency);
  }, 0);

  const exportOffersCsv = () => {
    const rows = positions.map(o => ({
      ...o,
      amount: Number(o.amount) / STROOPS_PER_XLM,
      amount_repaid: Number(o.amount_repaid) / STROOPS_PER_XLM,
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
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Your Portfolio</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track your financing offers and returns — updates stream in live
              {lastUpdatedAt
                ? <span className="text-muted-foreground/70"> · updated {relativeUpdate(lastUpdatedAt)}</span>
                : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <Button variant="outline" size="sm" onClick={refresh} aria-label="Refresh portfolio">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
            {positions.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportOffersCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5">
              <TrendingUp className="h-4 w-4 text-blue-500 mb-2" />
              <p className="text-2xl font-bold text-foreground">{active.length}</p>
              <p className="text-xs text-muted-foreground">Active Investments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Clock className="h-4 w-4 text-yellow-500 mb-2" />
              <p className="text-2xl font-bold text-foreground">{pending.length}</p>
              <p className="text-xs text-muted-foreground">Pending Offers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <CheckCircle2 className="h-4 w-4 text-green-500 mb-2" />
              <p className="text-2xl font-bold text-foreground">{repaid.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <DollarSign className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-lg font-bold text-foreground font-mono">${totalValueUsd.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">≈ Portfolio Value (USD)</p>
              {currencyTotalsUsd.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground font-mono">
                  {currencyTotalsUsd.map(([currency, usd]) => (
                    <li key={currency} className="flex items-center justify-between gap-3">
                      <span>{currency}</span>
                      <span>≈ ${usd.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground/70 mt-2 leading-relaxed">
                XLM/USD {xlmUsdInfo.price.toFixed(4)}{' '}
                {xlmUsdInfo.source === 'coingecko'
                  ? '(CoinGecko)'
                  : xlmUsdInfo.source === 'env'
                    ? '(env override)'
                    : '(default)'}
                {xlmUsdInfo.updatedAt > 0
                  ? ` · as of ${new Date(xlmUsdInfo.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ''}{' '}
                — approximate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Live earnings strip */}
        {(active.length > 0 || repaid.length > 0) && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Est. yield earned to date: ${totalEarnedToDateUsd.toFixed(2)}
                </p>
                <p className="text-xs text-green-600 dark:text-green-500">Accruing in real time across {active.length} active position{active.length !== 1 ? 's' : ''}</p>
              </div>
              {repaid.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    Realized yield: ${totalEarned.toFixed(2)} USD
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500">Across {repaid.length} repaid offer{repaid.length !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <TableSkeleton rows={4} />}

        {/* Empty state */}
        {!loading && positions.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
            <TrendingUp className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No financing offers yet.</p>
            <Link
              href="/marketplace"
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              Browse the marketplace →
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {pageItems.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No positions on this page.
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="max-h-[70vh] overflow-y-auto rounded-xl border border-border"
              data-testid="virtualized-position-list"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map(vi => (
                  <div
                    key={pageItems[vi.index].id}
                    ref={virtualizer.measureElement}
                    data-index={vi.index}
                    className="pb-3"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <PositionCard offer={pageItems[vi.index]} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pagination controls (issue #190) */}
        {!loading && positions.length > 0 && (
          <PaginationControls
            page={page}
            total={positions.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}

        {/* useSearchParams (the listing hand-off prefill) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <TransferPositionCard />
        </Suspense>
      </div>
    </AuthGuard>
  );
}