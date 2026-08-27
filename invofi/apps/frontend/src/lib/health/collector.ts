// Health metrics collector helpers.
//
// This module is used by the GitHub Actions health collector script
// (scripts/health-collector.ts) that runs on an hourly schedule.
// It is NOT bundled into the frontend — all imports are Node-compatible and
// the functions are only called from the collector, not from React components.
//
// Responsibilities:
//   1. Poll Soroban RPC getEvents for the current 1-hour window.
//   2. Aggregate success/failure counts, fee stats, and event-type counts.
//   3. Snapshot the current contract state (invoice distribution, pool util, …).
//   4. Evaluate alert_configs and emit audit_log rows for breaches.

import { rpc, scValToNative } from '@stellar/stellar-sdk';
import type { HealthMetric, ContractStateSnapshot, AlertConfig } from './types';

// ── Config ────────────────────────────────────────────────────────────────────

export interface CollectorConfig {
  rpcUrl: string;
  networkPassphrase: string;
  registryId: string;
  financingId: string;
  repaymentId: string;
  insuranceId: string;
  reputationId: string;
}

// ── Event ingestion ───────────────────────────────────────────────────────────

export interface TxWindow {
  /** Number of transactions (events) that succeeded in the window. */
  txSuccess: number;
  /** Number of transactions that emitted error events or had failed ledger entries. */
  txFailure: number;
  /** Sum of all fee_charged values seen in the window (stroops). */
  totalFeeStroops: bigint;
  /** Individual fee values, used to compute p95. */
  fees: number[];
  /** Ledger close times for confirmation latency (ms). */
  confirmationMs: number[];
  /** Per-event-type counts. */
  eventCounts: Record<string, number>;
  /** Contract IDs that emitted at least one event. */
  contractsActive: Set<string>;
}

export function emptyWindow(): TxWindow {
  return {
    txSuccess: 0,
    txFailure: 0,
    totalFeeStroops: 0n,
    fees: [],
    confirmationMs: [],
    eventCounts: {},
    contractsActive: new Set(),
  };
}

/** Known success event topic names (state-mutating, forward-progressing). */
const SUCCESS_EVENTS = new Set([
  'inv_reg', 'off_new', 'off_acc', 'off_rej', 'inv_rep',
  'inv_ovd', 'inv_cxl', 'inv_dsp', 'inv_rsl', 'off_def', 'off_wdr',
]);

/**
 * Fold a single Soroban event into the accumulator.
 * The event's first topic is the event name (a Symbol scVal).
 */
export function foldEvent(
  window: TxWindow,
  topic: rpc.Api.EventResponse['topic'],
  _value: unknown,
  contractId: string,
): void {
  let name: string;
  try {
    name = scValToNative(topic[0]) as string;
  } catch {
    return; // malformed event
  }

  if (SUCCESS_EVENTS.has(name)) {
    window.txSuccess += 1;
  } else {
    window.txFailure += 1;
  }

  window.eventCounts[name] = (window.eventCounts[name] ?? 0) + 1;
  window.contractsActive.add(contractId);
}

/** Compute p95 from a sorted array of numbers. Returns 0 for empty arrays. */
export function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Convert an accumulated TxWindow into a HealthMetric row for Supabase.
 */
export function windowToMetric(
  window: TxWindow,
  bucketStart: Date,
): Omit<HealthMetric, 'id' | 'created_at'> {
  const totalFees = window.fees.length;
  const avgFee = totalFees > 0
    ? Math.round(Number(window.totalFeeStroops) / totalFees)
    : 0;
  const avgConfMs = window.confirmationMs.length > 0
    ? Math.round(window.confirmationMs.reduce((a, b) => a + b, 0) / window.confirmationMs.length)
    : 0;
  const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);

  return {
    bucket_start: bucketStart.toISOString(),
    bucket_end: bucketEnd.toISOString(),
    tx_success: window.txSuccess,
    tx_failure: window.txFailure,
    avg_fee_stroops: avgFee,
    p95_fee_stroops: p95(window.fees),
    avg_confirmation_ms: avgConfMs,
    event_counts: window.eventCounts,
    contracts_active: [...window.contractsActive],
  };
}

// ── Alert evaluation ──────────────────────────────────────────────────────────

/**
 * A breach report produced when an alert_config threshold is violated.
 */
export interface AlertBreach {
  config: AlertConfig;
  actualValue: number;
}

/**
 * Evaluate all enabled alert configs against the latest snapshot and
 * the most-recent health metric bucket.
 *
 * Returns a list of breaches (may be empty).
 */
export function evaluateAlerts(
  configs: AlertConfig[],
  snapshot: ContractStateSnapshot | null,
  latestMetric: HealthMetric | null,
): AlertBreach[] {
  if (!snapshot && !latestMetric) return [];

  const breaches: AlertBreach[] = [];

  for (const cfg of configs) {
    if (!cfg.enabled) continue;

    let actual: number | null = null;

    switch (cfg.metric) {
      case 'overdue_rate':
        actual = snapshot ? Number(snapshot.overdue_rate) : null;
        break;
      case 'repayment_rate':
        actual = snapshot ? Number(snapshot.repayment_rate) : null;
        break;
      case 'tx_failure_rate': {
        if (latestMetric) {
          const total = latestMetric.tx_success + latestMetric.tx_failure;
          actual = total > 0 ? latestMetric.tx_failure / total : 0;
        }
        break;
      }
      case 'insurance_pool_total':
        actual = snapshot ? Number(snapshot.insurance_pool_total) : null;
        break;
      case 'avg_fee_stroops':
        actual = latestMetric ? latestMetric.avg_fee_stroops : null;
        break;
      case 'invoices_overdue':
        actual = snapshot ? snapshot.invoices_overdue : null;
        break;
    }

    if (actual === null) continue;

    const threshold = Number(cfg.threshold);
    let breached = false;
    switch (cfg.operator) {
      case 'gt':  breached = actual > threshold;  break;
      case 'lt':  breached = actual < threshold;  break;
      case 'gte': breached = actual >= threshold; break;
      case 'lte': breached = actual <= threshold; break;
    }

    if (breached) {
      breaches.push({ config: cfg, actualValue: actual });
    }
  }

  return breaches;
}

// ── Contract state snapshot helpers ──────────────────────────────────────────

/**
 * Build a ContractStateSnapshot from the same on-chain numbers the indexer
 * already fetches. Pass the output of readRegistryStats() / readInsurancePool()
 * from apps/indexer/src/chain.ts.
 */
export function buildSnapshot(params: {
  lastLedger: number;
  totalInvoices: number;
  invoicesFinanced: number;
  invoicesRepaid: number;
  invoicesOverdue: number;
  invoicesDefaulted: number;
  invoicesCancelled: number;
  invoicesDisputed: number;
  invoicesPending: number;
  totalVolume: bigint;
  totalRepaid: bigint;
  insurancePool: bigint;
  activeLenders: number;
  positionTokenSupply?: bigint;
}): Omit<ContractStateSnapshot, 'id'> {
  const {
    lastLedger, totalInvoices, invoicesFinanced, invoicesRepaid, invoicesOverdue,
    invoicesDefaulted, invoicesCancelled, invoicesDisputed, invoicesPending,
    totalVolume, totalRepaid, insurancePool, activeLenders,
    positionTokenSupply = 0n,
  } = params;

  const repaymentRate = totalVolume > 0n
    ? Math.min(1, Number(totalRepaid) / Number(totalVolume))
    : 0;
  const overdueRate = invoicesFinanced > 0
    ? invoicesOverdue / (invoicesFinanced + invoicesOverdue)
    : 0;

  return {
    snapshotted_at: new Date().toISOString(),
    last_ledger: lastLedger,
    invoices_pending: invoicesPending,
    invoices_financed: invoicesFinanced,
    invoices_repaid: invoicesRepaid,
    invoices_overdue: invoicesOverdue,
    invoices_defaulted: invoicesDefaulted,
    invoices_cancelled: invoicesCancelled,
    invoices_disputed: invoicesDisputed,
    total_invoices: totalInvoices,
    insurance_pool_total: insurancePool.toString(),
    insurance_pool_staked: insurancePool.toString(),
    position_token_supply: positionTokenSupply.toString(),
    repayment_rate: Math.round(repaymentRate * 10000) / 10000,
    overdue_rate: Math.round(overdueRate * 10000) / 10000,
    total_volume: totalVolume.toString(),
    total_repaid: totalRepaid.toString(),
    active_lenders: activeLenders,
  };
}
