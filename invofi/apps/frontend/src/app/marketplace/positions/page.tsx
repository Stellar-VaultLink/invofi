'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useWallet } from '@/components/auth/WalletProvider';
import { MarketplaceTabs } from '@/components/marketplace/MarketplaceTabs';
import { ListPositionForm } from '@/components/marketplace/ListPositionForm';
import { PositionListingCard } from '@/components/marketplace/PositionListingCard';
import { CardSkeleton } from '@/components/common/LoadingSkeleton';
import { useToast } from '@/components/ui/use-toast';
import { toErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import {
  LISTING_SORT_OPTIONS,
  fetchListings,
  filterListings,
  setListingStatus,
  sortListings,
  type ListingFilters,
  type ListingSortKey,
} from '@/lib/listings';
import type { Currency, PositionListing, PositionListingStatus } from '@/types';

/**
 * Secondary-market discovery for position tokens (ADR-0004).
 *
 * Lenders publish an ask — invoice reference, tokens offered, price — and
 * browse everyone else's. Discovery only: no matching, no custody, no fees.
 * Settlement is a bilateral SEP-41 transfer signed from /portfolio.
 */
export default function PositionListingsPage() {
  const { publicKey } = useWallet();
  const { toast } = useToast();

  const [listings, setListings] = useState<PositionListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileWallet, setProfileWallet] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListingFilters>({ search: '', currency: 'ALL' });
  const [sort, setSort] = useState<ListingSortKey>('newest');

  const loadListings = useCallback(async () => {
    try {
      setListings(await fetchListings());
    } catch {
      // Mirror unavailable — keep whatever is on screen rather than blanking it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('wallet_address')
          .eq('id', user.id)
          .maybeSingle();
        setProfileWallet((profile as { wallet_address: string | null } | null)?.wallet_address ?? null);
      }
      await loadListings();
    })();
  }, [loadListings]);

  // The connected wallet is the seller when there is one; otherwise fall back
  // to the wallet linked on the profile, so an email-signed-in lender can still
  // advertise. Either way the seller address is only ever a contact/verification
  // handle — publishing a listing signs nothing.
  const sellerAddress = publicKey ?? profileWallet;

  const onStatusChange = async (listing: PositionListing, status: PositionListingStatus) => {
    setBusyId(listing.id);
    try {
      const updated = await setListingStatus(listing.id, status);
      setListings(rows => rows.map(r => (r.id === listing.id ? { ...r, ...updated } : r)));
      toast({
        title: status === 'Settled' ? 'Listing settled' : 'Listing withdrawn',
        description:
          status === 'Settled'
            ? 'Marked as settled. Buyers verify the transfer on-chain.'
            : 'The listing is no longer on the board.',
      });
    } catch (err) {
      const msg = toErrorMessage(err, 'Could not update the listing');
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const mine = userId ? listings.filter(l => l.seller_id === userId) : [];
  const board = sortListings(
    filterListings(
      listings.filter(l => l.status === 'Open' && (!userId || l.seller_id !== userId)),
      filters,
    ),
    sort,
  );

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Position Listings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Lenders offering their financed-invoice positions for sale. Discovery only — InvoFi
            never holds the token or the payment.
          </p>
        </div>

        <MarketplaceTabs />

        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Listings are seller-attested asks, not escrowed trades. Agree terms directly with the
            seller and check their position-token balance on-chain before paying; settlement is a
            plain SEP-41 transfer they sign.
          </p>
        </div>

        {/* Publish an ask */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Sell a position</h2>
            <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {showForm ? 'Close' : 'List a position'}
            </Button>
          </div>

          {showForm &&
            (userId && sellerAddress ? (
              <ListPositionForm
                sellerAddress={sellerAddress}
                sellerId={userId}
                onCreated={listing => setListings(rows => [listing, ...rows])}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect a wallet (or link one in{' '}
                <Link href="/settings" className="text-blue-600 hover:underline">
                  settings
                </Link>
                ) to list a position — buyers need an address to verify and settle against.
              </p>
            ))}
        </div>

        {/* The seller's own listings, in every status */}
        {mine.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-foreground mb-3">Your listings</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mine.map(listing => (
                <PositionListingCard
                  key={listing.id}
                  listing={listing}
                  isOwn
                  busy={busyId === listing.id}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>
          </div>
        )}

        {/* Discovery */}
        <h2 className="text-lg font-semibold text-foreground mb-3">Open listings</h2>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice reference or seller…"
              aria-label="Search listings"
              className="ps-9"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            aria-label="Filter by asking currency"
            value={filters.currency}
            onChange={e => setFilters(f => ({ ...f, currency: e.target.value as Currency | 'ALL' }))}
          >
            <option value="ALL">All currencies</option>
            <option value="XLM">XLM</option>
            <option value="USDC">USDC</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            aria-label="Sort listings"
            value={sort}
            onChange={e => setSort(e.target.value as ListingSortKey)}
          >
            {LISTING_SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && board.length === 0 && (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
            <p className="text-lg font-medium">No positions listed right now</p>
            <p className="text-sm mt-1">
              Adjust the filters, or list one of your own positions above.
            </p>
          </div>
        )}

        {!loading && board.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {board.map(listing => (
              <PositionListingCard key={listing.id} listing={listing} isOwn={false} />
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
