'use client';

// ContractStateCards — KPI summary cards for the health dashboard.
//
// Displays the latest contract_state_snapshot row as a responsive grid of
// stat cards covering: invoice status distribution, repayment/overdue rates,
// insurance pool utilisation, and position token supply.
//
// Accepts a loaded snapshot (or null for a loading/empty state) and an array
// of health_metrics rows for sparkline trends.

import {
  FileText,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  Coins,
  Users,
  BarChart3,
  Ban,
} from 'lucide-react';
import type { ContractStateSnapshot, HealthMetric } from '@/lib/health/types';
import { Sparkline } from './TxRateChart';
import { STROOPS_PER_XLM } from '@/lib/constants';

// ── helpers ───────────────────────────────────────────────────────────────────

function xlm(stroops: string | undefined): string {
  if (!stroops) return '—';
  const n = Number(stroops) / STROOPS_PER_XLM;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface ContractStateCardsProps {
  /** Latest snapshot; null while loading or no data yet. */
  snapshot: ContractStateSnapshot | null;
  /** Historical snapshots for sparkline trends (oldest first). */
  snapshots: ContractStateSnapshot[];
  /** Health metrics for the tx failure sparkline. */
  metrics: HealthMetric[];
  /** Show loading skeleton instead of data. */
  loading?: boolean;
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm animate-pulse">
      <div className="h-3 bg-muted rounded w-3/4 mb-3" />
      <div className="h-7 bg-muted rounded w-1/2 mb-2" />
      <div className="h-3 bg-muted rounded w-full" />
    </div>
  );
}

// ── individual card ───────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  trend?: number[]; // sparkline values
  trendColor?: string;
  alert?: boolean;   // show amber/red styling when true
}

function KpiCard({ title, value, sub, icon, trend, trendColor = '#6366f1', alert = false }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm bg-card ${alert ? 'border-amber-400 dark:border-amber-500' : ''}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={`rounded-md p-1.5 ${alert ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'}`}>
          <span className={alert ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}>
            {icon}
          </span>
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {trend && trend.length >= 2 && (
        <div className="mt-2">
          <Sparkline values={trend} color={trendColor} fill />
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export function ContractStateCards({
  snapshot,
  snapshots,
  metrics,
  loading = false,
}: ContractStateCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No contract state snapshot yet.</p>
        <p className="text-xs mt-1 opacity-70">
          Run the health collector to populate data.
        </p>
      </div>
    );
  }

  // Sparkline series derived from historical snapshots (oldest → newest).
  const overdueRateTrend = snapshots.map(s => Number(s.overdue_rate));
  const repayRateTrend   = snapshots.map(s => Number(s.repayment_rate));
  const txFailTrend      = metrics.map(m =>
    (m.tx_success + m.tx_failure) === 0
      ? 0
      : m.tx_failure / (m.tx_success + m.tx_failure),
  );

  const overdueAlert = Number(snapshot.overdue_rate) > 0.15;
  const totalFinancedActive = snapshot.invoices_financed + snapshot.invoices_overdue;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Active invoices */}
      <KpiCard
        title="Active Invoices"
        value={totalFinancedActive.toLocaleString()}
        sub={`${snapshot.invoices_pending.toLocaleString()} pending · ${snapshot.total_invoices.toLocaleString()} total`}
        icon={<FileText className="h-4 w-4" />}
      />

      {/* Overdue rate */}
      <KpiCard
        title="Overdue Rate"
        value={pct(Number(snapshot.overdue_rate))}
        sub={`${snapshot.invoices_overdue.toLocaleString()} overdue of ${totalFinancedActive.toLocaleString()} active`}
        icon={<AlertTriangle className="h-4 w-4" />}
        trend={overdueRateTrend}
        trendColor={overdueAlert ? '#ef4444' : '#f59e0b'}
        alert={overdueAlert}
      />

      {/* Repayment rate */}
      <KpiCard
        title="Repayment Rate"
        value={pct(Number(snapshot.repayment_rate))}
        sub={`${xlm(snapshot.total_repaid)} / ${xlm(snapshot.total_volume)} XLM`}
        icon={<CheckCircle className="h-4 w-4" />}
        trend={repayRateTrend}
        trendColor="#22c55e"
      />

      {/* Repaid invoices */}
      <KpiCard
        title="Repaid Invoices"
        value={snapshot.invoices_repaid.toLocaleString()}
        sub={`${snapshot.invoices_defaulted.toLocaleString()} defaulted · ${snapshot.invoices_cancelled.toLocaleString()} cancelled`}
        icon={<CheckCircle className="h-4 w-4" />}
      />

      {/* Insurance pool */}
      <KpiCard
        title="Insurance Pool"
        value={`${xlm(snapshot.insurance_pool_total)} XLM`}
        sub={`${xlm(snapshot.insurance_pool_staked)} XLM staked`}
        icon={<ShieldCheck className="h-4 w-4" />}
      />

      {/* Position token supply */}
      <KpiCard
        title="POS Token Supply"
        value={Number(snapshot.position_token_supply).toLocaleString()}
        sub="SEP-41 position tokens in circulation"
        icon={<Coins className="h-4 w-4" />}
      />

      {/* Active lenders */}
      <KpiCard
        title="Active Lenders"
        value={snapshot.active_lenders.toLocaleString()}
        sub="Unique lenders with accepted offers"
        icon={<Users className="h-4 w-4" />}
      />

      {/* TX failure rate */}
      <KpiCard
        title="TX Failure Rate"
        value={
          metrics.length > 0
            ? pct(
                metrics.reduce((s, m) => s + m.tx_failure, 0) /
                  Math.max(1, metrics.reduce((s, m) => s + m.tx_success + m.tx_failure, 0)),
              )
            : '—'
        }
        sub={
          metrics.length > 0
            ? `${metrics.reduce((s, m) => s + m.tx_failure, 0)} failures in range`
            : 'No metric data'
        }
        icon={<Ban className="h-4 w-4" />}
        trend={txFailTrend}
        trendColor="#ef4444"
        alert={
          metrics.length > 0 &&
          metrics.reduce((s, m) => s + m.tx_failure, 0) /
            Math.max(1, metrics.reduce((s, m) => s + m.tx_success + m.tx_failure, 0)) >
            0.1
        }
      />
    </div>
  );
}
