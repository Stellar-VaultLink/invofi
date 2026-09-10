// Supabase read/write helpers for the health monitoring tables.
// All reads are filtered by a `since` timestamp derived from the TimeRange
// selector on the dashboard.

import { supabase } from '@/lib/supabase';
import type {
  HealthMetric,
  ContractStateSnapshot,
  AlertConfig,
  AlertConfigDraft,
  AuditLogEntry,
  AuditActionType,
  AlertSeverity,
} from './types';
import { timeRangeSince, type TimeRange } from './types';

// ── health_metrics ────────────────────────────────────────────────────────────

/**
 * Fetch health metric rows for the given time range, newest first.
 * Caps at 200 rows to keep the response manageable; the dashboard
 * aggregates / samples down to chart-friendly granularity anyway.
 */
export async function fetchHealthMetrics(range: TimeRange): Promise<HealthMetric[]> {
  const since = timeRangeSince(range).toISOString();
  const { data, error } = await supabase
    .from('health_metrics')
    .select('*')
    .gte('bucket_start', since)
    .order('bucket_start', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as HealthMetric[];
}

/**
 * Insert a new health metric row (called by the collector script running under
 * the service role or an admin session). Uses upsert on bucket_start so a
 * re-run of the same hour overwrites the previous value.
 */
export async function upsertHealthMetric(
  row: Omit<HealthMetric, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await supabase
    .from('health_metrics')
    .upsert(row, { onConflict: 'bucket_start' });
  if (error) throw new Error(error.message);
}

// ── contract_state_snapshots ──────────────────────────────────────────────────

/** Fetch snapshot rows for the given time range, oldest first (for charting). */
export async function fetchSnapshots(range: TimeRange): Promise<ContractStateSnapshot[]> {
  const since = timeRangeSince(range).toISOString();
  const { data, error } = await supabase
    .from('contract_state_snapshots')
    .select('*')
    .gte('snapshotted_at', since)
    .order('snapshotted_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractStateSnapshot[];
}

/** Fetch the single most-recent snapshot (used by KPI summary cards). */
export async function fetchLatestSnapshot(): Promise<ContractStateSnapshot | null> {
  const { data, error } = await supabase
    .from('contract_state_snapshots')
    .select('*')
    .order('snapshotted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ContractStateSnapshot | null) ?? null;
}

/** Insert a new snapshot row (called by the collector). */
export async function insertSnapshot(
  row: Omit<ContractStateSnapshot, 'id'>,
): Promise<void> {
  const { error } = await supabase
    .from('contract_state_snapshots')
    .insert(row);
  if (error) throw new Error(error.message);
}

// ── alert_configs ─────────────────────────────────────────────────────────────

/** Fetch all alert config rows (admins only — enforced by RLS). */
export async function fetchAlertConfigs(): Promise<AlertConfig[]> {
  const { data, error } = await supabase
    .from('alert_configs')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AlertConfig[];
}

/** Create a new alert config. */
export async function createAlertConfig(draft: AlertConfigDraft): Promise<AlertConfig> {
  const { data, error } = await supabase
    .from('alert_configs')
    .insert(draft)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AlertConfig;
}

/** Update an existing alert config. */
export async function updateAlertConfig(
  id: string,
  patch: Partial<AlertConfigDraft>,
): Promise<void> {
  const { error } = await supabase
    .from('alert_configs')
    .update(patch)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Delete an alert config. */
export async function deleteAlertConfig(id: string): Promise<void> {
  const { error } = await supabase
    .from('alert_configs')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── audit_log ─────────────────────────────────────────────────────────────────

/** Fetch audit log entries for the given time range, newest first. */
export async function fetchAuditLog(
  range: TimeRange,
  options?: {
    actionType?: AuditActionType;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
  },
): Promise<{ entries: AuditLogEntry[]; count: number }> {
  const since = timeRangeSince(range).toISOString();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .gte('action_at', since)
    .order('action_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.actionType) {
    query = query.eq('action_type', options.actionType);
  }
  if (options?.severity) {
    query = query.eq('severity', options.severity);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { entries: (data ?? []) as AuditLogEntry[], count: count ?? 0 };
}

/** Insert an audit log entry (called from the frontend on admin actions). */
export async function insertAuditLog(entry: {
  action_type: AuditActionType;
  message: string;
  details?: Record<string, unknown>;
  severity?: AlertSeverity;
  actor_email?: string;
}): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    action_type: entry.action_type,
    message: entry.message,
    details: entry.details ?? {},
    severity: entry.severity ?? 'info',
    actor_email: entry.actor_email ?? null,
  });
  if (error) throw new Error(error.message);
}
