'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { supabase } from '@/lib/supabase';
import { formatAmount, formatDate, interestRateLabel, durationLabel, OFFER_STATUS_COLORS } from '@/lib/utils';
import type { FinancingOffer } from '@/types';

const STATUS_ICONS = {
  Pending:   Clock,
  Accepted:  TrendingUp,
  Rejected:  AlertCircle,
  Repaid:    CheckCircle2,
  Defaulted: AlertCircle,
} as const;

export default function PortfolioPage() {
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('financing_offers')
        .select('*, invoice:invoices(*)')
        .eq('lender_id', user.id)
        .order('created_at', { ascending: false });
      setOffers((data as unknown as FinancingOffer[]) ?? []);
      setLoading(false);
    });
  }, []);

  const active = offers.filter(o => o.status === 'Accepted');
  const repaid = offers.filter(o => o.status === 'Repaid');
  const pending = offers.filter(o => o.status === 'Pending');

  const totalDeployed = active.reduce((sum, o) => sum + o.amount, 0n);
  const totalRepaid = repaid.reduce((sum, o) => sum + o.amount, 0n);

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Your Portfolio</h1>
          <p className="text-gray-500 text-sm mt-1">Track your financing offers and returns</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5">
              <TrendingUp className="h-4 w-4 text-blue-500 mb-2" />
              <p className="text-2xl font-bold">{active.length}</p>
              <p className="text-xs text-gray-500">Active Investments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <Clock className="h-4 w-4 text-yellow-500 mb-2" />
              <p className="text-2xl font-bold">{pending.length}</p>
              <p className="text-xs text-gray-500">Pending Offers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <CheckCircle2 className="h-4 w-4 text-green-500 mb-2" />
              <p className="text-2xl font-bold">{repaid.length}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <TrendingUp className="h-4 w-4 text-gray-400 mb-2" />
              <p className="text-2xl font-bold font-mono text-sm mt-1">{formatAmount(totalDeployed)}</p>
              <p className="text-xs text-gray-500">Total Deployed</p>
            </CardContent>
          </Card>
        </div>

        {/* Offers list */}
        {!loading && offers.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No financing offers yet.</p>
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
                    <Icon className="h-5 w-5 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm font-mono text-gray-700">{offer.invoice_id}</p>
                      <p className="text-xs text-gray-400">
                        {interestRateLabel(offer.interest_rate)} · {durationLabel(offer.duration)}
                        {offer.funded_at > 0 && ` · Funded ${formatDate(offer.funded_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold font-mono">
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
      </div>
    </AuthGuard>
  );
}
