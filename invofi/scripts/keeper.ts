#!/usr/bin/env tsx
/**
 * InvoFi Keeper (Task 12 & Event-Driven Upgrade)
 * =============================================
 * Off-chain automation that maintains protocol health on Soroban:
 *
 *  1. mark_overdue  — for every Financed invoice whose due_date has passed,
 *     call repayment.mark_overdue (a public, permissionless transition).
 *  2. bump_ttl      — best-effort TTL extension for the storage of active
 *     invoices, so contract state never expires on the Soroban network.
 *
 * Operating Modes:
 *  - `event-driven`: (Daemon mode) Continuously subscribes to Soroban RPC events
 *    (`inv_reg`, `off_acc`) via cursor polling every 10s. Triggers immediate
 *    TTL bumps on `inv_reg` and immediate overdue checks + TTL bumps on `off_acc`.
 *    Runs a full paginated sweep every 6 hours as a fallback.
 *  - `event-catchup`: Single-pass execution that queries RPC events since the
 *    last checkpoint/start ledger to handle recent events, then finishes.
 *  - `sweep`: (Default / Classic fallback) Single-pass paginated sweep over all
 *    invoices on the registry contract (ideal for 6-hourly cron jobs).
 *
 * Env vars / CLI flags:
 *  KEEPER_MODE / --mode   Operating mode: 'event-driven' | 'event-catchup' | 'sweep' (default: 'sweep')
 *  KEEPER_START_LEDGER / --start-ledger Target starting ledger for event mode (optional)
 *  RPC_URL                Soroban RPC endpoint (default: soroban-testnet)
 *  NETWORK_PASSPHRASE     network passphrase (default: testnet)
 *  REGISTRY_CONTRACT_ID   registry contract (required)
 *  REPAYMENT_CONTRACT_ID  repayment contract (required)
 *  FINANCING_CONTRACT_ID  financing contract (required for event-driven)
 *  KEEPER_SECRET_KEY      secret key of the funded keeper account (required)
 *  PAGE_SIZE              invoices per page for sweep (default 50)
 *  MAX_TTL_BUMPS          max TTL extensions per sweep (default 50)
 *  TTL_EXTEND_LEDGERS     how many ledgers to extend TTL to (default ~30 days)
 *  EVENT_POLL_INTERVAL_MS polling interval for event listener (default 10000ms = 10s)
 *  FALLBACK_SWEEP_INTERVAL_MS interval for full sweep fallback in daemon (default 6h)
 */

import fs from 'fs';
import {
  Contract,
  Keypair,
  Networks,
  Operation,
  SorobanDataBuilder,
  rpc as SorobanRpc,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

// ── Config ───────────────────────────────────────────────────────────────────

export const RPC_URL = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE =
  process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET;
export const REGISTRY_ID = process.env.REGISTRY_CONTRACT_ID;
export const REPAYMENT_ID = process.env.REPAYMENT_CONTRACT_ID;
export const FINANCING_ID = process.env.FINANCING_CONTRACT_ID;
export const KEEPER_SECRET_KEY = process.env.KEEPER_SECRET_KEY;
export const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 50);
export const MAX_TTL_BUMPS = Number(process.env.MAX_TTL_BUMPS ?? 50);
export const TTL_EXTEND_LEDGERS = Number(process.env.TTL_EXTEND_LEDGERS ?? 311_040); // ~30 days
export const EVENT_POLL_INTERVAL_MS = Number(process.env.EVENT_POLL_INTERVAL_MS ?? 10_000); // 10s
export const FALLBACK_SWEEP_INTERVAL_MS = Number(
  process.env.FALLBACK_SWEEP_INTERVAL_MS ?? 6 * 3600 * 1000,
); // 6 hours
export const CHECKPOINT_FILE = process.env.CHECKPOINT_FILE ?? '.keeper-checkpoint.json';
export const FEE = '100';
export const MAX_PAGES = 2_000;

export const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

export const STATUS: Record<string, number> = {
  Pending: 0,
  Financed: 1,
  Repaid: 2,
  Overdue: 3,
  Cancelled: 4,
  Disputed: 5,
  Defaulted: 6,
};

export type KeeperMode = 'event-driven' | 'event-catchup' | 'sweep';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function encodeSymbol(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'symbol' });
}

export function encodeU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}

/** Defensively parse the serialized status (number | numeric string | name). */
export function statusNum(value: unknown): number {
  if (typeof value === 'number') return value;
  const s = String(value);
  if (s in STATUS) return STATUS[s];
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? -1 : n;
}

export async function getAccount(pub: string) {
  return rpc.getAccount(pub);
}

/** Fund the keeper account on testnet if it doesn't exist yet. */
export async function ensureAccount(pub: string): Promise<void> {
  try {
    await rpc.getAccount(pub);
    return;
  } catch {
    /* account missing — fund below */
  }
  if (NETWORK_PASSPHRASE !== Networks.TESTNET) {
    throw new Error(`Account ${pub} missing and network is not testnet — fund it manually.`);
  }
  const net = await rpc.getNetwork();
  const friendbotUrl = net.friendbotUrl ?? 'https://friendbot.stellar.org';
  const url = `${friendbotUrl}?addr=${pub}`;
  log(`funding keeper account via friendbot: ${pub}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Friendbot funding failed (${res.status}): ${await res.text()}`);
  }
  for (let i = 0; i < 10; i++) {
    await sleep(1_000);
    try {
      await rpc.getAccount(pub);
      return;
    } catch {
      /* keep polling */
    }
  }
  throw new Error('Friendbot funded but account still not visible after 10s.');
}

export async function sendAndConfirm(tx: Transaction): Promise<boolean> {
  const resp = await rpc.sendTransaction(tx);
  if (resp.status === 'ERROR') {
    log(`    send ERROR: ${resp.errorResult?.result().toXDR('base64')}`);
    return false;
  }
  if (resp.status === 'DUPLICATE') return true;
  for (let i = 0; i < 15; i++) {
    await sleep(2_000);
    const res = await rpc.getTransaction(resp.hash);
    if (res.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return true;
    if (res.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      log(`    tx FAILED: ${res.resultXdr.toXDR('base64')}`);
      return false;
    }
  }
  log(`    tx ${resp.hash} timed out waiting for confirmation`);
  return false;
}

/** Read one page of invoices (bounded — the scalability-safe query). */
export async function readInvoicePage(offset: number, pub: string): Promise<unknown[]> {
  const contract = new Contract(REGISTRY_ID!);
  const account = await rpc.getAccount(pub);
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_invoices_paginated', encodeU32(offset), encodeU32(PAGE_SIZE)))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`get_invoices_paginated sim error: ${sim.error}`);
  }
  const result = sim.result?.retval;
  if (!result) return [];
  const parsed = scValToNative(result);
  return Array.isArray(parsed) ? parsed : [];
}

/** Fetch a single invoice from registry contract to inspect status & due_date. */
export async function fetchInvoiceDetails(invoiceId: string, pub: string): Promise<Record<string, unknown> | null> {
  try {
    const contract = new Contract(REGISTRY_ID!);
    const account = await rpc.getAccount(pub);
    const tx = new TransactionBuilder(account, {
      fee: FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_invoice', encodeSymbol(invoiceId)))
      .setTimeout(30)
      .build();
    const sim = await rpc.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) {
      return null;
    }
    const retval = sim.result?.retval;
    if (!retval) return null;
    const parsed = scValToNative(retval);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Mark a single invoice overdue (public transition). Returns true on success. */
export async function markOverdue(invoiceId: string, kp: Keypair): Promise<boolean> {
  const account = await getAccount(kp.publicKey());
  const contract = new Contract(REPAYMENT_ID!);
  let tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('mark_overdue', encodeSymbol(invoiceId)))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    log(`    mark_overdue sim error: ${sim.error}`);
    return false;
  }
  tx = SorobanRpc.assembleTransaction(tx, sim).build();
  tx.sign(kp);
  return sendAndConfirm(tx);
}

/**
 * Best-effort TTL extension: probe a read of the invoice to learn the
 * storage footprint, then submit an extendFootprintTtl transaction.
 */
export async function bumpTtl(invoiceId: string, kp: Keypair): Promise<boolean> {
  try {
    const contract = new Contract(REGISTRY_ID!);

    const probe = new TransactionBuilder(await getAccount(kp.publicKey()), {
      fee: FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_invoice', encodeSymbol(invoiceId)))
      .setTimeout(30)
      .build();
    const sim = await rpc.simulateTransaction(probe);
    if (SorobanRpc.Api.isSimulationError(sim)) {
      log(`    ttl probe sim error: ${sim.error}`);
      return false;
    }
    const readOnlyKeys = sim.transactionData.build().resources().footprint().readOnly();

    let bump = new TransactionBuilder(await getAccount(kp.publicKey()), {
      fee: FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .setSorobanData(new SorobanDataBuilder().setReadOnly(readOnlyKeys).build())
      .addOperation(Operation.extendFootprintTtl({ extendTo: TTL_EXTEND_LEDGERS }))
      .setTimeout(30)
      .build();

    bump = await rpc.prepareTransaction(bump);
    bump.sign(kp);
    return sendAndConfirm(bump);
  } catch (err) {
    log(`    ttl error for ${invoiceId}: ${(err as Error).message}`);
    return false;
  }
}

// ── Event Processing Core ───────────────────────────────────────────────────

export interface ParsedEvent {
  type: string;
  invoiceId: string;
  ledger: number;
  data: Record<string, unknown>;
}

export function parseRawEvent(rawEvent: SorobanRpc.Api.EventResponse): ParsedEvent | null {
  try {
    const topic0 = rawEvent.topic?.[0];
    if (!topic0) return null;
    const name = scValToNative(topic0);
    if (typeof name !== 'string') return null;

    const topic1 = rawEvent.topic?.[1];
    if (!topic1) return null;
    const topic1Dec = scValToNative(topic1);
    if (typeof topic1Dec !== 'string' || !topic1Dec) return null;
    const invoiceId = topic1Dec;

    let valDec: unknown;
    valDec = scValToNative(rawEvent.value);

    const arr = Array.isArray(valDec) ? valDec : [];
    const map = typeof valDec === 'object' && valDec !== null && !Array.isArray(valDec)
      ? (valDec as Record<string, unknown>)
      : {};

    if (name === 'inv_reg') {
      return {
        type: 'inv_reg',
        invoiceId,
        ledger: rawEvent.ledger,
        data: { valDec },
      };
    }

    if (name === 'off_acc') {
      return {
        type: 'off_acc',
        invoiceId,
        ledger: rawEvent.ledger,
        data: {
          invoiceId,
          lender: arr[1] ?? map['lender'],
          amount: arr[2] ?? map['amount'],
        },
      };
    }

    if (name === 'off_def') {
      return {
        type: 'off_def',
        invoiceId,
        ledger: rawEvent.ledger,
        data: { valDec },
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function loadCheckpoint(): number | undefined {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const content = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (typeof data.lastLedger === 'number') return data.lastLedger;
    }
  } catch {
    /* ignore error */
  }
  return undefined;
}

export function saveCheckpoint(ledger: number): void {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastLedger: ledger, updatedAt: new Date().toISOString() }, null, 2));
  } catch {
    /* ignore error */
  }
}

/** Process a list of decoded contract events. */
export async function processEvents(
  events: ParsedEvent[],
  kp: Keypair,
): Promise<{ processed: number; ttlBumps: number; markedOverdue: number }> {
  let processed = 0;
  let ttlBumps = 0;
  let markedOverdue = 0;
  const now = Math.floor(Date.now() / 1000);
  const pub = kp.publicKey();

  for (const evt of events) {
    if (!evt.invoiceId) continue;
    processed++;

    if (evt.type === 'inv_reg') {
      log(`[event:inv_reg] New invoice registered: ${evt.invoiceId} -> triggering instant TTL bump`);
      if (await bumpTtl(evt.invoiceId, kp)) ttlBumps++;
    } else if (evt.type === 'off_acc') {
      log(`[event:off_acc] Offer accepted for invoice: ${evt.invoiceId} -> triggering instant TTL bump & overdue check`);
      if (await bumpTtl(evt.invoiceId, kp)) ttlBumps++;

      const inv = await fetchInvoiceDetails(evt.invoiceId, pub);
      if (inv) {
        const st = statusNum(inv.status);
        const due = Number(inv.due_date ?? inv.dueDate ?? 0);
        if (st === STATUS.Financed && due > 0 && due < now) {
          log(`[event:off_acc -> overdue] ${evt.invoiceId} due=${due} now=${now} -> mark_overdue`);
          if (await markOverdue(evt.invoiceId, kp)) markedOverdue++;
        }
      }
    }
  }

  return { processed, ttlBumps, markedOverdue };
}

// ── Keeper Execution Modes ───────────────────────────────────────────────────

/** Paginated full sweep over registry contract invoices. */
export async function runFullSweep(kp: Keypair): Promise<{ scanned: number; marked: number; bumped: number }> {
  const pub = kp.publicKey();
  log(`[sweep] scanning invoices in pages of ${PAGE_SIZE} (max ${MAX_PAGES} pages)`);

  let offset = 0;
  let scanned = 0;
  let marked = 0;
  let bumped = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page = await readInvoicePage(offset, pub);
    if (page.length === 0) break;
    scanned += page.length;
    pages += 1;

    const now = Math.floor(Date.now() / 1000);
    for (const raw of page) {
      const inv = raw as Record<string, unknown>;
      const id = String(inv.id);
      const st = statusNum(inv.status);
      const due = Number(inv.due_date);
      const active = st === STATUS.Pending || st === STATUS.Financed;

      if (st === STATUS.Financed && due < now) {
        log(`[sweep:overdue] ${id} due=${due} now=${now} → mark_overdue`);
        if (await markOverdue(id, kp)) marked += 1;
      }

      if (active && bumped < MAX_TTL_BUMPS) {
        log(`[sweep:ttl] ${id} (status=${st}) → extend ${TTL_EXTEND_LEDGERS} ledgers`);
        if (await bumpTtl(id, kp)) bumped += 1;
      }
    }

    if (page.length < PAGE_SIZE) break;
    offset += page.length;
  }

  log(`[sweep summary] pages=${pages} scanned=${scanned} marked_overdue=${marked} ttl_bumps=${bumped}`);
  return { scanned, marked, bumped };
}

/** Poll contract events from starting ledger cursor up to latest ledger with pagination. */
export async function pollEventsOnce(
  currentLedger: number,
  kp: Keypair,
): Promise<{ nextLedger: number; processed: number; ttlBumps: number; markedOverdue: number }> {
  const contractIds = [REGISTRY_ID, FINANCING_ID].filter(Boolean) as string[];
  if (contractIds.length === 0) {
    return { nextLedger: currentLedger, processed: 0, ttlBumps: 0, markedOverdue: 0 };
  }

  const latestRes = await rpc.getLatestLedger();
  const latestSeq = latestRes.sequence;

  if (latestSeq < currentLedger) {
    return { nextLedger: currentLedger, processed: 0, ttlBumps: 0, markedOverdue: 0 };
  }

  let cursor: string | undefined = undefined;
  let latestSeenLedger = currentLedger;
  let totalProcessed = 0;
  let totalTtlBumps = 0;
  let totalMarkedOverdue = 0;

  while (true) {
    const params: SorobanRpc.Api.GetEventsRequest = cursor
      ? { cursor, filters: [{ type: 'contract', contractIds }], limit: 100 }
      : { startLedger: currentLedger, filters: [{ type: 'contract', contractIds }], limit: 100 };

    const eventRes = await rpc.getEvents(params);
    if (!eventRes.events || eventRes.events.length === 0) {
      if (eventRes.latestLedger && eventRes.latestLedger > latestSeenLedger) {
        latestSeenLedger = eventRes.latestLedger;
      }
      break;
    }

    const parsedEvents: ParsedEvent[] = [];
    for (const rawEvt of eventRes.events) {
      const parsed = parseRawEvent(rawEvt);
      if (parsed) {
        parsedEvents.push(parsed);
        if (parsed.ledger > latestSeenLedger) {
          latestSeenLedger = parsed.ledger;
        }
      }
    }

    const result = await processEvents(parsedEvents, kp);
    totalProcessed += result.processed;
    totalTtlBumps += result.ttlBumps;
    totalMarkedOverdue += result.markedOverdue;

    if (eventRes.latestLedger && eventRes.latestLedger > latestSeenLedger) {
      latestSeenLedger = eventRes.latestLedger;
    }

    if (eventRes.cursor && eventRes.cursor !== cursor) {
      cursor = eventRes.cursor;
    } else {
      break;
    }
  }

  const nextLedger = latestSeenLedger >= currentLedger ? latestSeenLedger + 1 : currentLedger;
  saveCheckpoint(nextLedger);

  return {
    nextLedger,
    processed: totalProcessed,
    ttlBumps: totalTtlBumps,
    markedOverdue: totalMarkedOverdue,
  };
}

/** Continuous daemon mode: RPC event subscriptions + periodic fallback sweep. */
export async function runEventDrivenDaemon(kp: Keypair): Promise<void> {
  log(`starting event-driven keeper daemon (poll interval: ${EVENT_POLL_INTERVAL_MS}ms, fallback sweep: ${FALLBACK_SWEEP_INTERVAL_MS}ms)`);

  let currentLedger = parseStartLedger() ?? loadCheckpoint();
  if (currentLedger === undefined) {
    const latestRes = await rpc.getLatestLedger();
    currentLedger = latestRes.sequence;
    log(`no checkpoint found — initializing starting ledger to ${currentLedger}`);
    saveCheckpoint(currentLedger);
  } else {
    log(`resumed from starting/checkpoint ledger ${currentLedger}`);
  }

  let running = true;
  const shutdown = () => {
    log('shutdown signal received — stopping event-driven daemon');
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runFullSweep(kp);
  let lastSweepTime = Date.now();
  let consecutiveFailures = 0;

  while (running) {
    try {
      const res = await pollEventsOnce(currentLedger, kp);
      currentLedger = res.nextLedger;
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      log(`[daemon error] event poll failed (attempt ${consecutiveFailures}): ${(err as Error).message}`);

      if (consecutiveFailures >= 3) {
        try {
          const health = await rpc.getHealth();
          log(`[daemon recovery] rpc health: ${health.status}`);
          const oldestLedger = (health as { oldestLedger?: number }).oldestLedger;
          if (oldestLedger !== undefined && oldestLedger > currentLedger) {
            log(`[daemon recovery] cursor ${currentLedger} expired below oldest ledger ${oldestLedger} -> advancing cursor`);
            currentLedger = oldestLedger;
            saveCheckpoint(currentLedger);
          } else {
            log(`[daemon recovery] preserving current cursor ${currentLedger}`);
          }
          consecutiveFailures = 0;
        } catch (healthErr) {
          log(`[daemon recovery error] health check failed: ${(healthErr as Error).message}`);
        }
      }
    }

    if (Date.now() - lastSweepTime >= FALLBACK_SWEEP_INTERVAL_MS) {
      log('[daemon] running periodic fallback sweep');
      try {
        await runFullSweep(kp);
      } catch (sweepErr) {
        log(`[daemon sweep error]: ${(sweepErr as Error).message}`);
      }
      lastSweepTime = Date.now();
    }

    await sleep(EVENT_POLL_INTERVAL_MS);
  }
}

// ── Main Entrypoint ──────────────────────────────────────────────────────────

export function parseKeeperMode(): KeeperMode {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      const modeStr = arg.split('=')[1];
      if (modeStr === 'event-driven' || modeStr === 'event-catchup' || modeStr === 'sweep') {
        return modeStr;
      }
    }
  }
  const envMode = process.env.KEEPER_MODE;
  if (envMode === 'event-driven' || envMode === 'event-catchup' || envMode === 'sweep') {
    return envMode;
  }
  return 'sweep';
}

export function parseStartLedger(): number | undefined {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--start-ledger=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isInteger(val) && val > 0) return val;
    }
  }
  const envVal = Number(process.env.KEEPER_START_LEDGER);
  if (Number.isInteger(envVal) && envVal > 0) return envVal;
  return undefined;
}

export async function main(): Promise<void> {
  const mode = parseKeeperMode();

  if (!REGISTRY_ID || !REPAYMENT_ID) {
    throw new Error('REGISTRY_CONTRACT_ID and REPAYMENT_CONTRACT_ID are required.');
  }
  if ((mode === 'event-driven' || mode === 'event-catchup') && !FINANCING_ID) {
    throw new Error('FINANCING_CONTRACT_ID is required for event-driven keeper modes.');
  }
  if (!KEEPER_SECRET_KEY) {
    throw new Error('KEEPER_SECRET_KEY is required (funded keeper account).');
  }

  const kp = Keypair.fromSecret(KEEPER_SECRET_KEY);
  const pub = kp.publicKey();
  await ensureAccount(pub);

  log(`keeper ${pub} — mode=${mode} registry=${REGISTRY_ID.slice(0, 8)}… repayment=${REPAYMENT_ID.slice(0, 8)}…`);

  if (mode === 'event-driven') {
    await runEventDrivenDaemon(kp);
  } else if (mode === 'event-catchup') {
    let ledger = parseStartLedger() ?? loadCheckpoint();
    if (ledger === undefined) {
      const latest = await rpc.getLatestLedger();
      ledger = Math.max(1, latest.sequence - 1_000);
    }
    log(`[event-catchup] polling events starting at ledger ${ledger}`);
    const res = await pollEventsOnce(ledger, kp);
    log(`[event-catchup summary] processed=${res.processed} ttl_bumps=${res.ttlBumps} marked_overdue=${res.markedOverdue}`);
    await runFullSweep(kp);
  } else {
    // Mode: 'sweep'
    await runFullSweep(kp);
  }
}

const isDirectExecution = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('keeper.ts') ||
      process.argv[1].endsWith('keeper.js') ||
      process.argv[1].endsWith('keeper')),
);

if (isDirectExecution && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  main()
    .then(() => {
      log('keeper run complete');
      process.exit(0);
    })
    .catch((err: unknown) => {
      log(`keeper run FAILED: ${(err as Error).message}`);
      process.exit(1);
    });
}
