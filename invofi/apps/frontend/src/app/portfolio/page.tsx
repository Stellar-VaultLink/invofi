'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Download, Copy, Check, Send, RefreshCw, Tag, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useWallet } from '@/components/auth/WalletProvider';
import { TableSkeleton } from '@/components/common/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { addPositionTrustline, getPositionTokenId, getTokenBalance, getTokenDecimals, hasPositionTrustline, transferPositionToken } from '@/lib/contract';
import { formatAmount, formatDate, interestRateLabel, durationLabel, toStroopsBigInt, OFFER_STATUS_COLORS } from '@/lib/utils';
import { STROOPS_PER_XLM } from '@/lib/constants';
import { toCsv, downloadCsv } from '@/lib/csv';
import { fetchFractionalPositions } from '@/lib/securitization';
import type { FinancingOffer } from '@/types';
import { SupabaseUser } from '@/lib/types/supabase-auth';


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
      const msg = err instanceof Error ? err.message : 'Trustline setup failed';
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
      const msg = err instanceof Error ? err.message : 'Transaction failed';
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

export default function PortfolioPage() {
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  // null = not yet fetched (loading), number = fetched result, 'error' = failed
  const [fractionalCount, setFractionalCount] = useState<number | null>(null);

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
            <h1 className="text-2xl font-bold text-foreground">Your Portfolio</h1>
            <p className="text-muted-foreground text-sm mt-1">Track your financing offers and returns</p>
          </div>
          {offers.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportOffersCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          )}
        </div>

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
              <TrendingUp className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-lg font-bold text-foreground font-mono">{totalDeployed.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total Deployed</p>
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
                <p className="text-sm font-semibold text-foreground">
                  {fractionalCount} fractional position{fractionalCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">Invoice fraction tokens you hold</p>
              </div>
            </div>
            <Link href="/portfolio/fractions" className="text-sm text-blue-600 hover:underline font-medium shrink-0">
              View fractions →
            </Link>
          </div>
        )}

        {/* Extra earned stat */}
        {repaid.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                Est. yield earned: {totalEarned.toFixed(4)} (across {repaid.length} repaid offer{repaid.length !== 1 ? 's' : ''})
              </p>
              <p className="text-xs text-green-600 dark:text-green-500">Based on agreed interest rates</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <TableSkeleton rows={4} />}

        {/* Empty state */}
        {!loading && offers.length === 0 && (
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
      </div>
    </AuthGuard>
  );
}
