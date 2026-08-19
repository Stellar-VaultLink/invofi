'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toStroopsBigInt } from '@/lib/utils';
import { STROOPS_PER_XLM } from '@/lib/constants';
import type { FinancingOffer, Invoice } from '@/types';
import type { SupabaseUser } from '@/lib/types/supabase-auth';

export type TimeRange = '30d' | '90d' | '1y' | 'all';

export interface PortfolioMetrics {
  totalDeployed: number;
  totalYieldEarned: number;
  totalRepaid: number;
  activeCount: number;
  repaidCount: number;
  defaultedCount: number;
  pendingCount: number;
  avgInterestRate: number;
  avgDuration: number;
  diversification: {
    currencies: Record<string, number>;
    originators: number;
    invoiceCount: number;
  };
}

export interface YieldPoint {
  date: string;
  yield: number;
  deployed: number;
}

export interface RiskExposure {
  status: string;
  count: number;
  amount: number;
}

export interface CurrencyBreakdown {
  currency: string;
  amount: number;
  count: number;
}

function calculateMetrics(offers: FinancingOffer[]): PortfolioMetrics {
  const active = offers.filter(o => o.status === 'Accepted' || o.status === 'Financed');
  const repaid = offers.filter(o => o.status === 'Repaid');
  const defaulted = offers.filter(o => o.status === 'Defaulted');
  const pending = offers.filter(o => o.status === 'Pending');

  const totalDeployed = active.reduce(
    (sum, o) => sum + Number(toStroopsBigInt(o.amount)) / STROOPS_PER_XLM,
    0,
  );

  const totalRepaid = repaid.reduce(
    (sum, o) => sum + Number(toStroopsBigInt(o.amount)) / STROOPS_PER_XLM,
    0,
  );

  const totalYieldEarned = repaid.reduce((sum, o) => {
    const principal = Number(toStroopsBigInt(o.amount)) / STROOPS_PER_XLM;
    return sum + principal * (o.interest_rate / 10000);
  }, 0);

  const allFinanced = [...active, ...repaid, ...defaulted];
  const avgInterestRate =
    allFinanced.length > 0
      ? allFinanced.reduce((sum, o) => sum + o.interest_rate, 0) / allFinanced.length
      : 0;

  const avgDuration =
    allFinanced.length > 0
      ? allFinanced.reduce((sum, o) => sum + o.duration, 0) / allFinanced.length
      : 0;

  const currencies: Record<string, number> = {};
  const originatorSet = new Set<string>();
  for (const o of allFinanced) {
    currencies[o.currency] = (currencies[o.currency] ?? 0) + 1;
    if (o.invoice && typeof o.invoice === 'object' && 'originator_id' in o.invoice) {
      originatorSet.add((o.invoice as Invoice).originator_id);
    }
  }

  return {
    totalDeployed,
    totalYieldEarned,
    totalRepaid,
    activeCount: active.length,
    repaidCount: repaid.length,
    defaultedCount: defaulted.length,
    pendingCount: pending.length,
    avgInterestRate,
    avgDuration,
    diversification: {
      currencies,
      originators: originatorSet.size,
      invoiceCount: allFinanced.length,
    },
  };
}

function calculateYieldHistory(offers: FinancingOffer[], _range: TimeRange): YieldPoint[] {
  const repaid = offers.filter(o => o.status === 'Repaid' && o.funded_at > 0);
  if (repaid.length === 0) return [];

  const sorted = [...repaid].sort((a, b) => a.funded_at - b.funded_at);
  const points: YieldPoint[] = [];
  let cumulativeYield = 0;
  let cumulativeDeployed = 0;

  for (const o of sorted) {
    const principal = Number(toStroopsBigInt(o.amount)) / STROOPS_PER_XLM;
    const yield_ = principal * (o.interest_rate / 10000);
    cumulativeYield += yield_;
    cumulativeDeployed += principal;

    const date = new Date(o.funded_at * 1000).toISOString().slice(0, 10);
    points.push({ date, yield: cumulativeYield, deployed: cumulativeDeployed });
  }

  return points;
}

function calculateRiskExposure(offers: FinancingOffer[]): RiskExposure[] {
  const groups: Record<string, { count: number; amount: number }> = {};
  for (const o of offers) {
    if (o.status === 'Pending' || o.status === 'Rejected') continue;
    if (!groups[o.status]) groups[o.status] = { count: 0, amount: 0 };
    groups[o.status].count += 1;
    groups[o.status].amount += Number(toStroopsBigInt(o.amount)) / STROOPS_PER_XLM;
  }
  return Object.entries(groups).map(([status, data]) => ({
    status,
    ...data,
  }));
}

function calculateCurrencyBreakdown(offers: FinancingOffer[]): CurrencyBreakdown[] {
  const groups: Record<string, { amount: number; count: number }> = {};
  for (const o of offers) {
    if (o.status === 'Pending' || o.status === 'Rejected') continue;
    if (!groups[o.currency]) groups[o.currency] = { amount: 0, count: 0 };
    groups[o.currency].amount += Number(toStroopsBigInt(o.amount)) / STROOPS_PER_XLM;
    groups[o.currency].count += 1;
  }
  return Object.entries(groups)
    .map(([currency, data]) => ({ currency, ...data }))
    .sort((a, b) => b.amount - a.amount);
}

export function usePortfolioAnalytics(range: TimeRange = 'all') {
  const { data: user } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return (data.user as SupabaseUser) ?? null;
    },
    staleTime: 60_000,
  });

  const offersQuery = useQuery({
    queryKey: ['portfolio-offers', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('financing_offers')
        .select('*, invoice:invoices(*)')
        .eq('lender_id', user.id)
        .order('created_at', { ascending: false });
      return ((data as unknown as FinancingOffer[]) ?? []).map(o => ({
        ...o,
        amount: toStroopsBigInt(o.amount),
        amount_repaid: toStroopsBigInt(o.amount_repaid),
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const offers = offersQuery.data ?? [];

  const metrics = useMemo(() => calculateMetrics(offers), [offers]);
  const yieldHistory = useMemo(() => calculateYieldHistory(offers, range), [offers, range]);
  const riskExposure = useMemo(() => calculateRiskExposure(offers), [offers]);
  const currencyBreakdown = useMemo(() => calculateCurrencyBreakdown(offers), [offers]);

  return {
    offers,
    metrics,
    yieldHistory,
    riskExposure,
    currencyBreakdown,
    isLoading: offersQuery.isLoading,
    isError: offersQuery.isError,
    refetch: offersQuery.refetch,
  };
}
