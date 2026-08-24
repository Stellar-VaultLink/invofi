'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, FileText, Send, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LISTING_STATUS_COLORS, unitPrice } from '@/lib/listings';
import { ExplorerLink } from '@/components/common/ExplorerLink';
import { formatAddress } from '@/lib/utils';
import type { PositionListing, PositionListingStatus } from '@/types';


interface PositionListingCardProps {
  listing: PositionListing;
  /** True when the signed-in lender published this listing. */
  isOwn: boolean;
  /** Seller-only lifecycle actions (ADR-0004: invalidation is explicit). */
  onStatusChange?: (listing: PositionListing, status: PositionListingStatus) => void;
  busy?: boolean;
}

export function PositionListingCard({ listing, isOwn, onStatusChange, busy }: PositionListingCardProps) {
  const [copied, setCopied] = useState(false);
  const perToken = unitPrice(listing);

  const copySeller = async () => {
    try {
      await navigator.clipboard.writeText(listing.seller);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Card className="flex flex-col" data-testid="position-listing">
      <CardContent className="pt-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-3">
          <Link
            href={`/invoices/${listing.invoice_id}`}
            className="flex items-center gap-1.5 min-w-0 text-xs font-mono text-muted-foreground hover:text-blue-500 transition-colors"
            title={`Invoice ${listing.invoice_id}`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{listing.invoice_id}</span>
          </Link>
          <Badge className={LISTING_STATUS_COLORS[listing.status]}>{listing.status}</Badge>
        </div>

        <div className="space-y-2 flex-1 mb-4">
          <div className="flex items-center gap-1.5 text-foreground">
            <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-lg">
              {listing.asking_price} {listing.price_currency}
            </span>
            <span className="text-xs text-muted-foreground">asking</span>
          </div>

          <p className="text-sm text-foreground">
            {listing.token_amount} position tokens
            {perToken && (
              <span className="text-xs text-muted-foreground">
                {' '}· {perToken} {listing.price_currency}/token
              </span>
            )}
          </p>

          <p className="text-xs text-muted-foreground font-mono">
            Seller:{' '}
            <ExplorerLink
              type="account"
              value={listing.seller}
              className="hover:text-blue-500 hover:underline transition-colors"
            >
              {formatAddress(listing.seller)} <ExternalLink className="inline h-3 w-3" />
            </ExplorerLink>
          </p>

          {listing.note && (
            <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">{listing.note}</p>
          )}
        </div>

        {isOwn ? (
          <div className="flex flex-wrap gap-2">
            {listing.status === 'Open' && (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/portfolio?amount=${encodeURIComponent(listing.token_amount)}#transfer`}>
                    <Send className="mr-1.5 h-3.5 w-3.5" /> Settle: transfer
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onStatusChange?.(listing, 'Settled')}
                >
                  Mark settled
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onStatusChange?.(listing, 'Withdrawn')}
                >
                  Withdraw
                </Button>
              </>
            )}
            {listing.status !== 'Open' && (
              <p className="text-xs text-muted-foreground">
                Closed listing — publish a new one to offer this position again.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="w-full" onClick={copySeller}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> Address copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy seller address
                </>
              )}
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Agree terms with the seller directly. Settlement is a plain SEP-41 transfer they
              sign — InvoFi never holds the token or your payment. Verify their balance on-chain
              before you pay.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
