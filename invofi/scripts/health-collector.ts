#!/usr/bin/env tsx
/**
 * InvoFi Health Collector
 * =======================
 * Scheduled script (GitHub Actions, hourly) that:
 *
 *   1. Polls Soroban RPC `getEvents` for the last 1-hour window across all
 *      five contracts and aggregates transaction success/failure counts, fee
 *      stats, and per-event-type counts into a `health_metrics` row.
 *
 *   2. Fetches the current contract state (invoice status distribution,
 *      insurance pool, position token supply, active lenders) from the
 *      indexer's `protocol_stats` row AND from on-chain queries, and writes
 *      a `contract_state_snapshots` row.
 *
 *   3. Loads `alert_configs` from Supabase and evaluates thresholds against
 *      the fresh snapshot.  Breaches are appended to `audit_log`.
 *
 * Environment variables:
 *   RPC_URL                    Soroban RPC endpoint (default: testnet)
 *   NETWORK_PASSPHRASE         (default: testnet)
 *   REGISTRY_CONTRACT_ID       required
 *   FINANCING_CONTRACT_ID      required
 *   REPAYMENT_CONTRACT_ID      required
 *   INSURANCE_CONTRACT_ID      required
 *   REPUTATION_CONTRACT_ID     required
 *   SUPABASE_URL               required
 *   SUPABASE_SERVICE_ROLE_KEY  required
 *   LOOKBACK_HOURS             hours to look back for events (default: 1)
 *   DRY_RUN                    if "true", print but do not write to Supabase
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { rpc as SorobanRpc, scValToNative } from '@stellar/stellar-sdk';
import {
  emptyWindow,
  foldEvent,
  windowToMetric,
  buildSnapshot,
  evaluateAlerts,
  type CollectorConfig,
} from '../apps/frontend/src/lib/health/collector.js';
import type {
  AlertConfig,
  ContractStateSnapshot,
  HealthMetric,
} from '../apps/frontend/src/lib/health/types.js';

// ── Config ────────────────────────────────────────────────────────────────────

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`env var ${name} is required`);
  return v;
}

const RPC_URL    = env('RPC_URL', 'https://soroban-testnet.stellar.org');
const NETWORK    = env('NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
const CFG: CollectorConfig = {
  rpcUrl:           RPC_URL,
  networkPassphrase: NETWORK,
  registryId:       env('REGISTRY_CONTRACT_ID'),
  financingId:      env('FINANCING_CONTRACT_ID'),
  repaymentId:      env('REPAYMENT_CONTRACT_ID'),
  insuranceId:      env('INSURANCE_CONTRACT_ID'),
  reputationId:     env('REPUTATION_CONTRACT_ID'),
};
const SUPABASE_URL  = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
const LOOKBACK_HOURS = Number(env('LOOKBACK_HOURS', '1'));
const DRY_RUN = process.env.DRY_RUN === 'true';

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Log with timestamp prefix. */
function log(msg: string): void {
  console.log(`[health-collector ${new Date().toISOString()}] ${msg}`);
}

/** Format a ledger cursor from a minimum ledger (5-digit string suffix). */
function ledgerCursor(ledger: number): string {
  return `${ledger}-00000`;
}

// ── Step 1: Collect events from RPC ──────────────────────────────────────────

export interface EventsResult {
  window: ReturnType<typeof emptyWindow>;
  latestLedger: number;
}

export async function collectEvents(
  bucketStartLedger: number,
): Promise<EventsResult> {
  const window = emptyWindow();
  let latestLedger = bucketStartLedger;

  const contractIds = [
    CFG.registryId,
    CFG.financingId,
    CFG.repaymentId,
    CFG.insuranceId,
    CFG.reputationId,
  ].filter((id): id is string => Boolean(id));

  log(`Fetching events from ${contractIds.length} contracts since ledger ${bucketStartLedger}…`);

  for (const contractId of contractIds) {
    try {
      const result = await rpc.getEvents({
        startLedger: bucketStartLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [contractId],
          },
        ],
        limit: 1000,
      });

      if ('events' in result) {
        for (const evt of result.events) {
          // evt.contractId may be a Contract object or undefined in the raw RPC
          // response type; normalise to a plain string for foldEvent.
          const cid: string =
            typeof evt.contractId === 'string'
              ? evt.contractId
              : (evt.contractId as { toString?: () => string } | undefined)?.toString?.() ?? contractId;
          foldEvent(window, evt.topic, evt.value, cid);
          if (evt.ledger > latestLedger) latestLedger = evt.ledger;
        }
        log(`  ${contractId}: ${result.events.length} events`);
      }
    } catch (err) {
      // Log but don't crash — a single contract failure should not abort the run.
      log(`  WARN: failed to fetch events for ${contractId}: ${(err as Error).message}`);
    }
  }

  log(`Events collected: ${window.txSuccess} success, ${window.txFailure} failure`);
  return { window, latestLedger };
}

// ── Step 2: Snapshot contract state ──────────────────────────────────────────

export async function snapshotContractState(
  supabase: SupabaseClient,
  latestLedger: number,
): Promise<ReturnType<typeof buildSnapshot>> {
  log('Reading contract state from protocol_stats…');

  // Read the indexer's aggregate row as a data source for invoice distribution.
  // This is the same source the /stats page uses — no need for a separate
  // on-chain query here; the indexer already reconciles against chain state.
  const { data: ps, error: psErr } = await supabase
    .from('protocol_stats')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (psErr) {
    log(`WARN: Could not read protocol_stats: ${psErr.message}. Using zeros.`);
  }

  const proto = ps as {
    total_invoices: number;
    invoices_financed: number;
    total_volume: string;
    total_repaid: string;
    repayment_rate: number;
    active_lenders: number;
    defaulted_invoices: number;
    insurance_pool: string;
    last_ledger: number;
  } | null;

  // Derive individual status counts.  The indexer does not break out every
  // status, so we use what we have and leave the rest as 0.
  const invoicesFinanced  = proto?.invoices_financed ?? 0;
  const invoicesRepaid    = Math.round(
    (proto?.total_invoices ?? 0) * (proto?.repayment_rate ?? 0),
  );
  const invoicesDefaulted = proto?.defaulted_invoices ?? 0;
  const totalInvoices     = proto?.total_invoices ?? 0;
  const invoicesPending   = Math.max(
    0,
    totalInvoices - invoicesFinanced - invoicesRepaid - invoicesDefaulted,
  );

  return buildSnapshot({
    lastLedger:        latestLedger || (proto?.last_ledger ?? 0),
    totalInvoices,
    invoicesFinanced,
    invoicesRepaid,
    invoicesOverdue:   0,           // not tracked separately yet
    invoicesDefaulted,
    invoicesCancelled: 0,
    invoicesDisputed:  0,
    invoicesPending,
    totalVolume:       BigInt(proto?.total_volume ?? '0'),
    totalRepaid:       BigInt(proto?.total_repaid ?? '0'),
    insurancePool:     BigInt(proto?.insurance_pool ?? '0'),
    activeLenders:     proto?.active_lenders ?? 0,
  });
}

// ── Step 3: Write to Supabase ─────────────────────────────────────────────────

export async function writeMetric(
  supabase: SupabaseClient,
  metric: ReturnType<typeof windowToMetric>,
): Promise<void> {
  if (DRY_RUN) {
    log(`[dry-run] Would upsert health_metrics row for ${metric.bucket_start}`);
    return;
  }
  const { error } = await supabase
    .from('health_metrics')
    .upsert(metric, { onConflict: 'bucket_start' });
  if (error) throw new Error(`writeMetric failed: ${error.message}`);
  log(`health_metrics upserted for ${metric.bucket_start}`);
}

export async function writeSnapshot(
  supabase: SupabaseClient,
  snapshot: ReturnType<typeof buildSnapshot>,
): Promise<void> {
  if (DRY_RUN) {
    log(`[dry-run] Would insert contract_state_snapshots row`);
    return;
  }
  const { error } = await supabase.from('contract_state_snapshots').insert(snapshot);
  if (error) throw new Error(`writeSnapshot failed: ${error.message}`);
  log('contract_state_snapshots row inserted');
}

export async function loadAlertConfigs(supabase: SupabaseClient): Promise<AlertConfig[]> {
  const { data, error } = await supabase.from('alert_configs').select('*').eq('enabled', true);
  if (error) {
    log(`WARN: Could not load alert_configs: ${error.message}`);
    return [];
  }
  return (data ?? []) as AlertConfig[];
}

export async function writeAuditBreaches(
  supabase: SupabaseClient,
  breaches: { config: AlertConfig; actualValue: number }[],
): Promise<void> {
  if (breaches.length === 0) return;
  const rows = breaches.map(({ config, actualValue }) => ({
    action_type: 'alert_breach' as const,
    message:     `Alert "${config.label}" breached: ${config.metric} ${config.operator} ${config.threshold} (actual: ${actualValue})`,
    details:     { config, actualValue },
    severity:    config.severity,
  }));

  if (DRY_RUN) {
    log(`[dry-run] Would insert ${rows.length} audit_log breach row(s)`);
    rows.forEach(r => log(`  breach: ${r.message}`));
    return;
  }

  const { error } = await supabase.from('audit_log').insert(rows);
  if (error) log(`WARN: Could not write audit_log breaches: ${error.message}`);
  else log(`${rows.length} alert breach(es) written to audit_log`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<void> {
  log('Health collector starting…');
  if (DRY_RUN) log('[dry-run mode — no writes will occur]');

  if (!HAS_SUPABASE) {
  log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — running in collect-only mode (no DB writes).');
}
const supabase = HAS_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  // Determine bucket start (truncated to the hour).
  const now = new Date();
  const bucketStart = new Date(now);
  bucketStart.setMinutes(0, 0, 0);
  bucketStart.setHours(bucketStart.getHours() - LOOKBACK_HOURS);

  // Resolve the starting ledger for the bucket window.
  // We use the latest ledger and subtract an approximation:
  //   Stellar produces ~1 ledger per 5 seconds → 720 ledgers/hour.
  let startLedger: number;
  try {
    const health = await rpc.getHealth();
    const latest = 'oldestLedger' in health ? (health as { oldestLedger?: number }).oldestLedger ?? 1 : 1;
    const latestLedger = await rpc.getLatestLedger();
    startLedger = Math.max(1, latestLedger.sequence - Math.ceil(LOOKBACK_HOURS * 720));
    log(`Latest ledger: ${latestLedger.sequence}, window start: ${startLedger}`);
    void latest; // used only for logging
  } catch (err) {
    log(`WARN: Could not resolve latest ledger: ${(err as Error).message}. Using ledger 1.`);
    startLedger = 1;
  }

  // Step 1: Collect events.
  const { window, latestLedger } = await collectEvents(startLedger);

  // Step 2: Build metric row.
  const metricRow = windowToMetric(window, bucketStart);
  log(`Metric row: success=${metricRow.tx_success} failure=${metricRow.tx_failure} avgFee=${metricRow.avg_fee_stroops}`);

  if (!HAS_SUPABASE) {
    log('Collect-only mode: skipping snapshot/alerts/DB writes.');
    log('Health collector finished (collect-only).');
    return;
  }

  // Step 3: Snapshot contract state.
  const snapshot = await snapshotContractState(supabase!, latestLedger);
  log(`Snapshot: overdue_rate=${snapshot.overdue_rate} repayment_rate=${snapshot.repayment_rate}`);

  // Step 4: Evaluate alert configs.
  const alertConfigs = await loadAlertConfigs(supabase!);
  const breaches = evaluateAlerts(
    alertConfigs,
    snapshot as unknown as ContractStateSnapshot,
    metricRow as unknown as HealthMetric,
  );
  log(`Alert evaluation: ${alertConfigs.length} rules, ${breaches.length} breach(es)`);

  // Step 5: Write everything to Supabase.
  await writeMetric(supabase!, metricRow);
  await writeSnapshot(supabase!, snapshot);
  await writeAuditBreaches(supabase!, breaches);

  log('Health collector finished successfully.');
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Run only when executed directly (not imported as a module in tests).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('health-collector.ts')) {
  run().catch(err => {
    console.error('[health-collector] Fatal error:', err);
    process.exit(1);
  });
}
