'use client';

// /dashboard/health — Protocol Health Monitoring Dashboard (admin-only).
//
// Sections:
//   1. Time-range selector (1h / 24h / 7d / 30d)
//   2. KPI cards — ContractStateCards
//   3. Transaction rate chart — TxRateChart
//   4. Alert configuration panel — AlertConfigPanel
//   5. Audit log viewer — AuditLogViewer
//
// All data is fetched from Supabase (health_metrics, contract_state_snapshots,
// alert_configs, audit_log) via lib/health/metrics.ts helpers.
// Auto-refreshes on a 60-second interval for the real-time feel.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  RefreshCw,
  Download,
  Bell,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react';
import { AdminGuard } from '@/components/health/AdminGuard';
import { TxRateChart } from '@/components/health/TxRateChart';
import { ContractStateCards } from '@/components/health/ContractStateCards';
import { AlertConfigPanel } from '@/components/health/AlertConfigPanel';
import { AuditLogViewer } from '@/components/health/AuditLogViewer';
import { Button } from '@/components/ui/button';
import { fetchHealthMetrics, fetchSnapshots, fetchLatestSnapshot } from '@/lib/health/metrics';
import type {
  HealthMetric,
  ContractStateSnapshot,
  TimeRange,
} from '@/lib/health/types';
import { toCsv, downloadCsv } from '@/lib/csv';

// ── constants ─────────────────────────────────────────────────────────────────

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h',  label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d',  label: '7 days' },
  { value: '30d', label: '30 days' },
];

const REFRESH_INTERVAL_MS = 60_000; // 60 s

// ── helpers ───────────────────────────────────────────────────────────────────

function formatRefreshed(d: Date | null): string {
  if (!d) return 'Never';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ── component ─────────────────────────────────────────────────────────────────

function HealthDashboardContent() {
  const [range, setRange] = useState<TimeRange>('24h');
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [snapshots, setSnapshots] = useState<ContractStateSnapshot[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<ContractStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── data loading ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, s, latest] = await Promise.all([
        fetchHealthMetrics(range),
        fetchSnapshots(range),
        fetchLatestSnapshot(),
      ]);
      setMetrics(m);
      setSnapshots(s);
      setLatestSnapshot(latest);
      setRefreshedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  // Initial load and re-load on range change.
  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60 s.
  useEffect(() => {
    intervalRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // ── CSV export (metrics) ────────────────────────────────────────────────

  const handleExportMetrics = async () => {
    setExporting(true);
    try {
      const csv = toCsv(metrics as unknown as Record<string, unknown>[], [
        { key: 'bucket_start',       header: 'Bucket Start' },
        { key: 'bucket_end',         header: 'Bucket End' },
        { key: 'tx_success',         header: 'TX Success' },
        { key: 'tx_failure',         header: 'TX Failure' },
        { key: 'avg_fee_stroops',    header: 'Avg Fee (stroops)' },
        { key: 'p95_fee_stroops',    header: 'P95 Fee (stroops)' },
        { key: 'avg_confirmation_ms',header: 'Avg Confirmation (ms)' },
      ]);
      downloadCsv(`health-metrics-${range}-${Date.now()}.csv`, csv);
    } finally {
      setExporting(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">Protocol Health</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Admin-only operational view — contract state, transaction metrics, alerts, and audit log.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refreshed: {formatRefreshed(refreshedAt)}
            {' · '}
            Auto-refresh every 60 s
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time-range selector */}
          <nav
            className="flex rounded-lg border overflow-hidden"
            aria-label="Time range"
            role="tablist"
          >
            {TIME_RANGES.map(({ value, label }) => (
              <button
                key={value}
                role="tab"
                aria-selected={range === value}
                onClick={() => setRange(value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Manual refresh */}
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            aria-label="Refresh dashboard"
            className="h-8 px-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          Failed to load health data: {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {/* ── Section 1: Contract State KPI cards ── */}
      <section aria-labelledby="kpi-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="kpi-heading" className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Contract State
          </h2>
          {latestSnapshot && (
            <span className="text-xs text-muted-foreground">
              Snapshot: {new Date(latestSnapshot.snapshotted_at).toLocaleString()}
              {' · '}ledger {latestSnapshot.last_ledger.toLocaleString()}
            </span>
          )}
        </div>
        <ContractStateCards
          snapshot={latestSnapshot}
          snapshots={snapshots}
          metrics={metrics}
          loading={loading}
        />
      </section>

      {/* ── Section 2: Transaction rate chart ── */}
      <section aria-labelledby="txchart-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="txchart-heading" className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Transaction Rate
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportMetrics}
            disabled={exporting || metrics.length === 0}
            aria-label="Export transaction metrics as CSV"
            className="h-7 gap-1 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <TxRateChart
            metrics={metrics}
            showDateLabels={range === '7d' || range === '30d'}
            height={200}
          />
          {metrics.length === 0 && !loading && !error && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              No metric data for this range. Run the health collector to populate.
            </p>
          )}
        </div>
      </section>

      {/* ── Section 3: Alert configuration ── */}
      <section aria-labelledby="alerts-heading">
        <div className="mb-3">
          <h2 id="alerts-heading" className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Alert Rules
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Threshold-based rules evaluated by the health collector after each run.
            Breaches are recorded in the audit log below.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <AlertConfigPanel />
        </div>
      </section>

      {/* ── Section 4: Audit log ── */}
      <section aria-labelledby="audit-heading">
        <div className="mb-3">
          <h2 id="audit-heading" className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Audit Log
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admin actions, config changes, and alert breaches recorded by the system.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <AuditLogViewer range={range} />
        </div>
      </section>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function HealthDashboardPage() {
  return (
    <AdminGuard>
      <HealthDashboardContent />
    </AdminGuard>
  );
}
