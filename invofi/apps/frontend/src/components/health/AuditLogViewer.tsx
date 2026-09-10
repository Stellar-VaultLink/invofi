'use client';

// AuditLogViewer — paginated audit log table for the health dashboard.
//
// Reads audit_log rows from Supabase (via lib/health/metrics.ts) with
// optional filtering by action_type and severity.  Supports CSV export via
// the existing lib/csv.ts helpers and time-range filtering.

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchAuditLog } from '@/lib/health/metrics';
import type {
  AuditLogEntry,
  AuditActionType,
  AlertSeverity,
  TimeRange,
} from '@/lib/health/types';
import { toCsv, downloadCsv } from '@/lib/csv';

// ── constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<AuditActionType, string> = {
  alert_breach: 'Alert breach',
  admin_action: 'Admin action',
  config_change: 'Config change',
  system_event:  'System event',
};

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  info:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  warning:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day:   'numeric',
    hour:  '2-digit',
    minute:'2-digit',
    second:'2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface AuditLogViewerProps {
  range: TimeRange;
}

// ── component ─────────────────────────────────────────────────────────────────

export function AuditLogViewer({ range }: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState<AuditActionType | ''>('');
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | ''>('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (pg = 0) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog(range, {
        actionType: filterType || undefined,
        severity:   filterSeverity || undefined,
        limit:  PAGE_SIZE,
        offset: pg * PAGE_SIZE,
      });
      setEntries(result.entries);
      setCount(result.count);
      setPage(pg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, filterType, filterSeverity]);

  // Re-load whenever range or filters change.
  useEffect(() => { load(0); }, [load]);

  // ── CSV export ────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch all rows in the current range/filter (up to 1000).
      const result = await fetchAuditLog(range, {
        actionType: filterType || undefined,
        severity:   filterSeverity || undefined,
        limit:  1000,
        offset: 0,
      });
      const csv = toCsv(result.entries as unknown as Record<string, unknown>[], [
        { key: 'id',          header: 'ID' },
        { key: 'action_at',   header: 'Timestamp' },
        { key: 'action_type', header: 'Type' },
        { key: 'severity',    header: 'Severity' },
        { key: 'message',     header: 'Message' },
        { key: 'actor_email', header: 'Actor' },
        { key: 'details',     header: 'Details (JSON)' },
      ]);
      downloadCsv(`audit-log-${range}-${Date.now()}.csv`, csv);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filter: type */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as AuditActionType | '')}
          className="h-8 text-xs rounded border border-input bg-background px-2"
          aria-label="Filter by action type"
        >
          <option value="">All types</option>
          {(Object.keys(ACTION_LABELS) as AuditActionType[]).map(t => (
            <option key={t} value={t}>{ACTION_LABELS[t]}</option>
          ))}
        </select>

        {/* Filter: severity */}
        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value as AlertSeverity | '')}
          className="h-8 text-xs rounded border border-input bg-background px-2"
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {(['info', 'warning', 'critical'] as AlertSeverity[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground ml-auto">
          {count.toLocaleString()} row{count !== 1 ? 's' : ''}
        </span>

        {/* Refresh */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => load(page)}
          disabled={loading}
          aria-label="Refresh audit log"
          className="h-8 px-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        {/* Export */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={exporting || count === 0}
          aria-label="Export audit log as CSV"
          className="h-8 gap-1"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Audit log entries">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium w-36">Time</th>
              <th className="pb-2 pr-4 font-medium w-28">Type</th>
              <th className="pb-2 pr-4 font-medium w-20">Severity</th>
              <th className="pb-2 pr-4 font-medium">Message</th>
              <th className="pb-2 font-medium w-32">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5].map(j => (
                    <td key={j} className="py-2.5 pr-4">
                      <div className="h-3.5 bg-muted/50 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                  No audit log entries for this time range and filters.
                </td>
              </tr>
            ) : (
              entries.map(entry => (
                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(entry.action_at)}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="text-xs text-muted-foreground">
                      {ACTION_LABELS[entry.action_type]}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge className={`text-xs ${SEVERITY_STYLES[entry.severity]}`} variant="outline">
                      {entry.severity}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate" title={entry.message}>
                    {entry.message}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground truncate max-w-[8rem]" title={entry.actor_email ?? undefined}>
                    {entry.actor_email ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => load(page - 1)}
            disabled={page === 0 || loading}
            aria-label="Previous page"
            className="h-7 px-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>Page {page + 1} of {totalPages}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => load(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            aria-label="Next page"
            className="h-7 px-2"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
