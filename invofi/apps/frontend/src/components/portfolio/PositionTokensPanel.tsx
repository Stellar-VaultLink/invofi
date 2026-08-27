'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Send, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/components/auth/WalletProvider';
import { getPositionTokenId, getTokenBalance, getTokenDecimals } from '@/lib/contract';
import { getPositionTokenTransfers, type PositionTransfer } from '@/lib/horizon';
import { formatDate } from '@/lib/utils';
import { explorerTxUrl } from '@/lib/constants';

/**
 * Position tokens panel (issue #127).
 *
 * Lenders receive a SEP-41 position token when an offer is accepted, but the
 * portfolio page did not surface the token balance or its transfer history, so
 * a lender could not see or prove their claim. This panel shows:
 *   - the connected wallet's position-token balance,
 *   - the recent in/out position transfers for that wallet (via Horizon),
 *   - a link to the "Transfer position" form (the existing card below).
 */
export function PositionTokensPanel() {
  const { publicKey } = useWallet();
  const [decimals, setDecimals] = useState(7);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [transfers, setTransfers] = useState<PositionTransfer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setBalance(null);
      setTransfers(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const id = await getPositionTokenId();
      if (id) {
        const tokenDecimals = await getTokenDecimals(id);
        setDecimals(tokenDecimals);
        setBalance(await getTokenBalance(id, publicKey));
      } else {
        setBalance(null);
      }
      setTransfers(await getPositionTokenTransfers(publicKey));
    } catch {
      setError('Could not load position tokens. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const balanceLabel =
    balance === null
      ? '—'
      : (Number(balance) / 10 ** decimals).toFixed(decimals > 7 ? 7 : decimals);

  return (
    <Card className="mt-8" id="position-tokens">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-blue-500" />
            <h2 className="text-lg font-semibold text-foreground">Position Tokens</h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh position tokens"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Position tokens are minted to you when an offer is accepted — each token is
          your claim on a financed invoice (1 token = 1 base unit of principal).
        </p>

        {!publicKey ? (
          <p className="text-sm text-muted-foreground">
            Connect a wallet to view your position tokens.
          </p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-xl font-bold font-mono text-foreground">{balanceLabel}</p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href="#transfer">
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Transfer position
                </Link>
              </Button>
            </div>

            <h3 className="text-sm font-medium text-foreground mb-2">Transfer history</h3>
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : transfers === null ? (
              <p className="text-sm text-muted-foreground">Loading transfers…</p>
            ) : transfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No position transfers yet. When you receive or send position tokens they
                will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {transfers.map(t => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {t.direction === 'in' ? (
                        <ArrowDownLeft className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-orange-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">
                          {t.direction === 'in' ? 'Received' : 'Sent'}{' '}
                          <span className="font-mono">{t.amount}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.direction === 'in' ? 'from' : 'to'}{' '}
                          {t.counterparty.slice(0, 6)}…{t.counterparty.slice(-4)} ·{' '}
                          {formatDate(t.createdAt)}
                        </p>
                      </div>
                    </div>
                    <a
                      href={explorerTxUrl(t.hash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-blue-500 hover:underline shrink-0"
                    >
                      ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
