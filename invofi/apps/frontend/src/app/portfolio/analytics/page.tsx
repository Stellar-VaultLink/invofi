'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Percent,
  Clock,
  AlertTriangle,
  Download,
  Share2,
  BarChart3,
  PieChart as PieIcon,
  Copy,
  Globe,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { StatsCard } from '@/components/common/StatsCard';
import { PageSkeleton } from '@/components/common/LoadingSkeleton';
import { usePortfolioAnalytics, type TimeRange } from '@/hooks/usePortfolioAnalytics';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useToast } from '@/components/ui/use-toast';
import { STROOPS_PER_XLM } from '@/lib/constants';
import type { FinancingOffer } from '@/types';

const RANGE_LABELS: Record<TimeRange, string> = {
  '30d': '30 Days',
  '90d': '90 Days',
  '1y': '1 Year',
  all: 'All Time',
};

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const STATUS_COLORS: Record<string, string> = {
  Financed: 'hsl(var(--chart-1))',
  Repaid: 'hsl(var(--chart-3))',
  Defaulted: 'hsl(var(--chart-5))',
  Accepted: 'hsl(var(--chart-2))',
};

/** Format a number for compact display (e.g. 1.2M, 3.4K). */
function formatNumber(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

/** Convert a duration in seconds to a human-friendly string (e.g. 7d, 3mo). */
function formatDuration(seconds: number): string {
  const days = Math.round(seconds / 86400);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  return `${months}mo`;
}

/** Export the full portfolio as a downloadable CSV file. */
function exportPortfolioCsv(offers: FinancingOffer[]) {
  const rows = offers.map(o => ({
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
  downloadCsv(`invofi-portfolio-analytics-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

/** Build a snapshot URL that encodes the current range and timestamp.
 * The recipient sees the same time-range view at a fixed point in time.
 * TODO: persist an immutable portfolio snapshot server-side for full
 * fidelity (currently shows the recipient's own data after auth).
 */
function buildShareableUrl(range: TimeRange): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set('snapshot', Date.now().toString(36));
  url.searchParams.set('range', range);
  return url.toString();
}

/** Render the top-row KPI metric cards. */
function MetricCards({ metrics }: { metrics: ReturnType<typeof usePortfolioAnalytics>['metrics'] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        title="Total Deployed"
        value={`${formatNumber(metrics.totalDeployed)}`}
        description="XLM actively financed"
        icon={DollarSign}
      />
      <StatsCard
        title="Yield Earned"
        value={`${formatNumber(metrics.totalYieldEarned)}`}
        description="From repaid invoices"
        icon={TrendingUp}
        trend={
          metrics.totalDeployed > 0
            ? {
                value: Number(((metrics.totalYieldEarned / metrics.totalDeployed) * 100).toFixed(1)),
                label: 'avg return',
              }
            : undefined
        }
      />
      <StatsCard
        title="Avg Interest Rate"
        value={`${(metrics.avgInterestRate / 100).toFixed(1)}%`}
        description={`Across ${metrics.diversification.invoiceCount} invoices`}
        icon={Percent}
      />
      <StatsCard
        title="Avg Duration"
        value={formatDuration(metrics.avgDuration)}
        description={`${metrics.diversification.originators} originator${metrics.diversification.originators !== 1 ? 's' : ''}`}
        icon={Clock}
      />
    </div>
  );
}

/** Render the cumulative-yield area chart. */
function YieldChart({ data }: { data: ReturnType<typeof usePortfolioAnalytics>['yieldHistory'] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No yield data yet — yields accrue as invoices are repaid.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={v => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={v => formatNumber(v)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          labelFormatter={v => new Date(v).toLocaleDateString()}
          formatter={(value: number) => [`${value.toFixed(4)} XLM`]}
        />
        <Area
          type="monotone"
          dataKey="yield"
          stroke="hsl(var(--chart-3))"
          fill="url(#yieldGradient)"
          strokeWidth={2}
          name="Cumulative Yield"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Render the risk-exposure pie chart by invoice status. */
function RiskChart({ data }: { data: ReturnType<typeof usePortfolioAnalytics>['riskExposure'] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No risk data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="status"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.status}
              fill={STATUS_COLORS[entry.status] ?? CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value: number) => [`${formatNumber(value)} XLM`]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Render the currency-breakdown bar chart. */
function CurrencyChart({ data }: { data: ReturnType<typeof usePortfolioAnalytics>['currencyBreakdown'] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No currency data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="currency"
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={v => formatNumber(v)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value: number, name: string) => [
            name === 'amount' ? `${formatNumber(value)} XLM` : value,
          ]}
        />
        <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Amount" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Render the diversification metrics card. */
function DiversificationCard({
  metrics,
}: {
  metrics: ReturnType<typeof usePortfolioAnalytics>['metrics'];
}) {
  const { diversification } = metrics;
  const entries = Object.entries(diversification.currencies).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Copy className="h-4 w-4 text-muted-foreground" />
          Diversification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Invoices financed</span>
          <span className="font-medium">{diversification.invoiceCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Unique originators</span>
          <span className="font-medium">{diversification.originators}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Currencies</span>
          <span className="font-medium">{entries.length}</span>
        </div>
        {entries.length > 0 && (
          <div className="pt-2 border-t space-y-1.5">
            {entries.map(([currency, count]) => (
              <div key={currency} className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {currency}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Render the portfolio summary statistics. */
function SummaryStats({
  metrics,
}: {
  metrics: ReturnType<typeof usePortfolioAnalytics>['metrics'];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Portfolio Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Active investments</span>
          <span className="font-medium text-blue-500">{metrics.activeCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Repaid</span>
          <span className="font-medium text-green-500">{metrics.repaidCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Defaulted</span>
          <span className="font-medium text-red-500">{metrics.defaultedCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Pending offers</span>
          <span className="font-medium text-yellow-500">{metrics.pendingCount}</span>
        </div>
        <div className="pt-2 border-t flex justify-between text-sm">
          <span className="text-muted-foreground">Total repaid</span>
          <span className="font-medium">{formatNumber(metrics.totalRepaid)} XLM</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Portfolio analytics dashboard showing performance metrics, yield history,
 * risk exposure, and currency breakdown for authenticated lenders.
 */
export default function PortfolioAnalyticsPage() {
  const [range, setRange] = useState<TimeRange>('all');
  const { toast } = useToast();

  const { offers, metrics, yieldHistory, riskExposure, currencyBreakdown, isLoading, isError, refetch } =
    usePortfolioAnalytics(range);

  const handleExportCsv = useCallback(() => {
    if (offers.length === 0) return;
    exportPortfolioCsv(offers);
    toast({ title: 'CSV exported', description: 'Your portfolio data has been downloaded.' });
  }, [offers, toast]);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(async () => {
    const url = buildShareableUrl(range);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Shareable snapshot link copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: url, variant: 'destructive' });
    }
  }, [range, toast]);

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <PageSkeleton />
        </div>
      </AuthGuard>
    );
  }

  if (isError) {
    return (
      <AuthGuard>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Failed to load portfolio data.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/portfolio" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <h1 className="text-2xl font-bold text-foreground">Portfolio Analytics</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Performance metrics, yield history, and risk analysis
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={offers.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
            </Button>
          </div>
        </div>

        {/* Time range selector */}
        <div className="mb-6 no-print">
          <Tabs value={range} onValueChange={v => setRange(v as TimeRange)}>
            <TabsList>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="90d">90d</TabsTrigger>
              <TabsTrigger value="1y">1y</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* KPI cards */}
        <div className="mb-8">
          <MetricCards metrics={metrics} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Yield History ({RANGE_LABELS[range]})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <YieldChart data={yieldHistory} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-muted-foreground" />
                Risk Exposure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RiskChart data={riskExposure} />
            </CardContent>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Currency Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CurrencyChart data={currencyBreakdown} />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <DiversificationCard metrics={metrics} />
            <SummaryStats metrics={metrics} />
          </div>
        </div>

        {/* Empty state */}
        {offers.length === 0 && (
          <div className="mt-12 text-center py-16 border-2 border-dashed border-border rounded-xl">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No portfolio data to analyze yet.</p>
            <Link
              href="/marketplace"
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              Browse the marketplace to start investing →
            </Link>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
