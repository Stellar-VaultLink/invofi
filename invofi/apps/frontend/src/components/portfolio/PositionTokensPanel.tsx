'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Send, Tag } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

  // Virtualize the transfer history list (issue #180): with hundreds of
  // transfers the DOM would balloon and scrolling would jank. Each row is
  // measured with `measureElement` so variable-height (wrapped) content
  // sizes correctly, mirroring the portfolio table.
  const listRef = useRef<HTMLUListElement>(null);
  const transferCount = transfers?.length ?? 0;
  const virtualizer = useVirtualizer({
    count: transferCount,
    getScrollElement: () => listRef.current,
    estimateSize: () => 56,
    overscan: 6,
  });

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
              <ul
                ref={listRef}
                className="max-h-[50vh] overflow-y-auto divide-y divide-border rounded-xl border border-border"
                data-testid="position-token-transfer-list"
                aria-label="Position token transfer history"
              >
                <div
                  style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
                >
                  {virtualizer.getVirtualItems().map(vi => {
                    const t = transfers[vi.index];
                    return (
                      <li
                        key={t.id}
                        ref={virtualizer.measureElement}
                        data-index={vi.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${vi.start}px)`,
                        }}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
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
                    );
                  })}
                </div>
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
