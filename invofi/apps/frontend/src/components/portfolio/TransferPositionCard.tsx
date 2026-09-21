"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Send, RefreshCw, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/auth/WalletProvider";
import { useToast } from "@/components/ui/use-toast";
import {
  addPositionTrustline,
  getPositionTokenId,
  getTokenBalance,
  getTokenDecimals,
  hasPositionTrustline,
  transferPositionToken,
} from "@/lib/contract";
import { toErrorMessage } from "@/lib/errors";

function isStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
}

/** Parse a decimal string (e.g. "12.5") into base units for `decimals` places. */
function toBaseUnits(amount: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(amount)) return null;
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) return null;
  const padded = frac.padEnd(decimals, "0");
  try {
    return BigInt(whole + padded);
  } catch {
    return null;
  }
}

export function TransferPositionCard() {
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
