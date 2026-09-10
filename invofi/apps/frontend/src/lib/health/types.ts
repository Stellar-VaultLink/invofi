// Types for the protocol health monitoring system (issue health-dashboard).
// These mirror the four Supabase tables created in migration 004.

export type TimeRange = '1h' | '24h' | '7d' | '30d';

export function timeRangeSince(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case '1h':  return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// ── health_metrics ────────────────────────────────────────────────────────────

export interface HealthMetric {
  id: number;
  bucket_start: string;  // ISO 8601
  bucket_end: string;
  tx_success: number;
  tx_failure: number;
  avg_fee_stroops: number;
  p95_fee_stroops: number;
  avg_confirmation_ms: number;
  /** JSON object: { inv_reg: 3, off_acc: 2, … } */
  event_counts: Record<string, number>;
  contracts_active: string[];
  created_at: string;
}

// ── contract_state_snapshots ──────────────────────────────────────────────────

export interface ContractStateSnapshot {
  id: number;
  snapshotted_at: string;
  last_ledger: number;
  invoices_pending: number;
  invoices_financed: number;
  invoices_repaid: number;
  invoices_overdue: number;
  invoices_defaulted: number;
  invoices_cancelled: number;
  invoices_disputed: number;
  total_invoices: number;
  insurance_pool_total: string;
  insurance_pool_staked: string;
  position_token_supply: string;
  repayment_rate: number;
  overdue_rate: number;
  total_volume: string;
  total_repaid: string;
  active_lenders: number;
}

// ── alert_configs ─────────────────────────────────────────────────────────────

export type AlertMetric =
  | 'overdue_rate'
  | 'repayment_rate'
  | 'tx_failure_rate'
  | 'insurance_pool_total'
  | 'avg_fee_stroops'
  | 'invoices_overdue';

export type AlertOperator = 'gt' | 'lt' | 'gte' | 'lte';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertConfig {
  id: string;
  label: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: string;
  severity: AlertSeverity;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertConfigDraft {
  label: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: string;
  severity: AlertSeverity;
  enabled: boolean;
}

// ── audit_log ─────────────────────────────────────────────────────────────────

export type AuditActionType =
  | 'alert_breach'
  | 'admin_action'
  | 'config_change'
  | 'system_event';

export interface AuditLogEntry {
  id: number;
  action_at: string;
  action_type: AuditActionType;
  message: string;
  details: Record<string, unknown>;
  severity: AlertSeverity;
  actor_id: string | null;
  actor_email: string | null;
}

// ── derived helpers ───────────────────────────────────────────────────────────

/** Compute the tx failure rate (0–1) from a HealthMetric row. */
export function txFailureRate(metric: HealthMetric): number {
  const total = metric.tx_success + metric.tx_failure;
  return total === 0 ? 0 : metric.tx_failure / total;
}

/** Human-readable label for an alert operator. */
export const OPERATOR_LABELS: Record<AlertOperator, string> = {
  gt:  '>',
  lt:  '<',
  gte: '≥',
  lte: '≤',
};

/** Human-readable label for an alert metric. */
export const METRIC_LABELS: Record<AlertMetric, string> = {
  overdue_rate:         'Overdue Rate',
  repayment_rate:       'Repayment Rate',
  tx_failure_rate:      'TX Failure Rate',
  insurance_pool_total: 'Insurance Pool (stroops)',
  avg_fee_stroops:      'Avg Fee (stroops)',
  invoices_overdue:     'Overdue Invoice Count',
};
