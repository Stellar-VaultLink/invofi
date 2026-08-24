process.env.NODE_ENV = 'test';

// Unit tests for the health collector pure-logic functions.
// These tests cover the functions exported from collector.ts (the lib module)
// and the helper functions in health-collector.ts that do not require live
// network or Supabase connections.
//
// Run with:
//   npm test --prefix invofi/scripts
// or directly:
//   cd invofi/scripts && tsx --test health-collector.test.ts

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { nativeToScVal } from '@stellar/stellar-sdk';

// Import the pure helpers from the lib module directly (no network / DB side
// effects). The health-collector.ts entry point is not imported here so we
// do not hit the `run()` entrypoint or the env-var guards at the top.
import {
  emptyWindow,
  foldEvent,
  p95,
  windowToMetric,
  buildSnapshot,
  evaluateAlerts,
} from '../apps/frontend/src/lib/health/collector.js';

// ── foldEvent ─────────────────────────────────────────────────────────────────

describe('foldEvent', () => {
  test('counts known success events in txSuccess', () => {
    const w = emptyWindow();
    const topic = [nativeToScVal('inv_reg', { type: 'symbol' })];
    foldEvent(w, topic as never, null, 'CONTRACT_A');
    assert.equal(w.txSuccess, 1);
    assert.equal(w.txFailure, 0);
    assert.deepEqual(w.eventCounts, { inv_reg: 1 });
    assert.ok(w.contractsActive.has('CONTRACT_A'));
  });

  test('counts off_acc as success', () => {
    const w = emptyWindow();
    const topic = [nativeToScVal('off_acc', { type: 'symbol' })];
    foldEvent(w, topic as never, null, 'C1');
    assert.equal(w.txSuccess, 1);
  });

  test('counts unknown event names in txFailure', () => {
    const w = emptyWindow();
    const topic = [nativeToScVal('unknown_event', { type: 'symbol' })];
    foldEvent(w, topic as never, null, 'C1');
    assert.equal(w.txFailure, 1);
    assert.equal(w.txSuccess, 0);
    assert.deepEqual(w.eventCounts, { unknown_event: 1 });
  });

  test('skips malformed topics without throwing', () => {
    const w = emptyWindow();
    // Pass a topic array with a non-decodable scVal — should not throw.
    const badTopic = [{ _switch: { value: -99999 } }];
    assert.doesNotThrow(() => foldEvent(w, badTopic as never, null, 'C1'));
    assert.equal(w.txSuccess, 0);
    assert.equal(w.txFailure, 0);
  });

  test('accumulates multiple events from multiple contracts', () => {
    const w = emptyWindow();
    const topicReg = [nativeToScVal('inv_reg', { type: 'symbol' })];
    const topicRep = [nativeToScVal('inv_rep', { type: 'symbol' })];
    foldEvent(w, topicReg as never, null, 'C1');
    foldEvent(w, topicReg as never, null, 'C2');
    foldEvent(w, topicRep as never, null, 'C1');
    assert.equal(w.txSuccess, 3);
    assert.equal(w.eventCounts['inv_reg'], 2);
    assert.equal(w.eventCounts['inv_rep'], 1);
    assert.equal(w.contractsActive.size, 2);
  });
});

// ── p95 ───────────────────────────────────────────────────────────────────────

describe('p95', () => {
  test('returns 0 for empty array', () => {
    assert.equal(p95([]), 0);
  });

  test('returns the single value for a 1-element array', () => {
    assert.equal(p95([42]), 42);
  });

  test('returns the 95th percentile value', () => {
    // 20 values 1..20; p95 index = floor(20 * 0.95) = 19 → value 20
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.equal(p95(values), 20);
  });

  test('handles unsorted input', () => {
    const values = [50, 10, 30, 20, 40];
    // sorted: [10, 20, 30, 40, 50]; idx = floor(5*0.95)=4 → 50
    assert.equal(p95(values), 50);
  });
});

// ── windowToMetric ────────────────────────────────────────────────────────────

describe('windowToMetric', () => {
  test('converts an empty window to a zero metric row', () => {
    const w = emptyWindow();
    const bucketStart = new Date('2026-01-01T12:00:00Z');
    const metric = windowToMetric(w, bucketStart);

    assert.equal(metric.tx_success, 0);
    assert.equal(metric.tx_failure, 0);
    assert.equal(metric.avg_fee_stroops, 0);
    assert.equal(metric.p95_fee_stroops, 0);
    assert.equal(metric.avg_confirmation_ms, 0);
    assert.equal(metric.bucket_start, bucketStart.toISOString());
    assert.equal(metric.bucket_end, new Date('2026-01-01T13:00:00Z').toISOString());
    assert.deepEqual(metric.event_counts, {});
    assert.deepEqual(metric.contracts_active, []);
  });

  test('computes averages correctly', () => {
    const w = emptyWindow();
    w.txSuccess = 10;
    w.txFailure = 2;
    w.fees = [100, 200, 300];
    w.totalFeeStroops = 600n;
    w.confirmationMs = [1000, 2000, 3000];
    w.eventCounts = { inv_reg: 10, off_new: 2 };
    w.contractsActive = new Set(['CA', 'CB']);

    const metric = windowToMetric(w, new Date('2026-01-01T00:00:00Z'));
    assert.equal(metric.avg_fee_stroops, 200);
    assert.equal(metric.p95_fee_stroops, 300);
    assert.equal(metric.avg_confirmation_ms, 2000);
    assert.deepEqual(metric.contracts_active, ['CA', 'CB']);
  });
});

// ── buildSnapshot ─────────────────────────────────────────────────────────────

describe('buildSnapshot', () => {
  test('builds a valid snapshot with zero state', () => {
    const snap = buildSnapshot({
      lastLedger: 1000,
      totalInvoices: 0,
      invoicesFinanced: 0,
      invoicesRepaid: 0,
      invoicesOverdue: 0,
      invoicesDefaulted: 0,
      invoicesCancelled: 0,
      invoicesDisputed: 0,
      invoicesPending: 0,
      totalVolume: 0n,
      totalRepaid: 0n,
      insurancePool: 0n,
      activeLenders: 0,
    });

    assert.equal(snap.last_ledger, 1000);
    assert.equal(snap.repayment_rate, 0);
    assert.equal(snap.overdue_rate, 0);
    assert.equal(snap.total_volume, '0');
  });

  test('computes repayment_rate and overdue_rate correctly', () => {
    const snap = buildSnapshot({
      lastLedger: 5000,
      totalInvoices: 100,
      invoicesFinanced: 40,
      invoicesRepaid: 50,
      invoicesOverdue: 10,
      invoicesDefaulted: 0,
      invoicesCancelled: 0,
      invoicesDisputed: 0,
      invoicesPending: 0,
      totalVolume: 1_000_000n,
      totalRepaid:   500_000n,
      insurancePool: 200_000n,
      activeLenders: 20,
    });

    // repaymentRate = min(1, 500000/1000000) = 0.5
    assert.equal(snap.repayment_rate, 0.5);
    // overdueRate = overdue / (financed + overdue) = 10 / 50 = 0.2
    assert.equal(snap.overdue_rate, 0.2);
  });

  test('caps repayment_rate at 1.0', () => {
    const snap = buildSnapshot({
      lastLedger: 1,
      totalInvoices: 10,
      invoicesFinanced: 0,
      invoicesRepaid: 10,
      invoicesOverdue: 0,
      invoicesDefaulted: 0,
      invoicesCancelled: 0,
      invoicesDisputed: 0,
      invoicesPending: 0,
      totalVolume:  100n,
      totalRepaid: 200n, // repaid > volume (edge case)
      insurancePool: 0n,
      activeLenders: 5,
    });
    assert.equal(snap.repayment_rate, 1);
  });
});

// ── evaluateAlerts ────────────────────────────────────────────────────────────

describe('evaluateAlerts', () => {
  const makeConfig = (
    id: string,
    metric: string,
    operator: string,
    threshold: string,
    enabled = true,
  ) => ({
    id,
    label: `Test rule ${id}`,
    metric,
    operator,
    threshold,
    severity: 'warning' as const,
    enabled,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  test('returns no breaches when there are no enabled rules', () => {
    const cfg = [makeConfig('1', 'overdue_rate', 'gt', '0.15', false)];
    const breaches = evaluateAlerts(cfg as never, null, null);
    assert.equal(breaches.length, 0);
  });

  test('detects overdue_rate gt threshold breach', () => {
    const cfg = [makeConfig('1', 'overdue_rate', 'gt', '0.15')];
    const snapshot = { overdue_rate: 0.20 } as never;
    const breaches = evaluateAlerts(cfg as never, snapshot, null);
    assert.equal(breaches.length, 1);
    assert.equal(breaches[0].config.id, '1');
    assert.ok(Math.abs(breaches[0].actualValue - 0.20) < 0.0001);
  });

  test('does not breach when value is below threshold', () => {
    const cfg = [makeConfig('1', 'overdue_rate', 'gt', '0.15')];
    const snapshot = { overdue_rate: 0.10 } as never;
    const breaches = evaluateAlerts(cfg as never, snapshot, null);
    assert.equal(breaches.length, 0);
  });

  test('detects tx_failure_rate breach from metric row', () => {
    const cfg = [makeConfig('2', 'tx_failure_rate', 'gt', '0.1')];
    const metric = { tx_success: 8, tx_failure: 3 } as never; // 3/11 ≈ 0.27
    const breaches = evaluateAlerts(cfg as never, null, metric);
    assert.equal(breaches.length, 1);
    assert.ok(breaches[0].actualValue > 0.1);
  });

  test('evaluates gte operator correctly', () => {
    const cfg = [makeConfig('3', 'invoices_overdue', 'gte', '5')];
    const snap = { invoices_overdue: 5 } as never;
    const breaches = evaluateAlerts(cfg as never, snap, null);
    assert.equal(breaches.length, 1);
  });

  test('skips unknown metric without crashing', () => {
    // 'unknown_metric' is not in AlertMetric union at runtime, but we still
    // test the defensive path.
    const cfg = [makeConfig('4', 'unknown_metric_xyz', 'gt', '0')];
    assert.doesNotThrow(() => evaluateAlerts(cfg as never, null, null));
  });
});
