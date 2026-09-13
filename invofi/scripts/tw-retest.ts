#!/usr/bin/env tsx
/**
 * Trustless Work release-funds bug retest — fresh escrow, FULL API path.
 * ============================================================================
 * Purpose: re-verify the "Escrow already in dispute" 400 from
 * /escrow/single-release/release-funds (docs/trustless-work-bug-report.md)
 * on a brand-new escrow driven entirely through TW's build→sign→submit loop,
 * and measure read-model (indexer) lag at each step to test the
 * "backend/DB was paused" hypothesis from the TW team.
 *
 * Flow:
 *   1. deploy    POST /deployer/single-release                     (lender signs)
 *   2. resolve   GET  /helper/get-escrows-by-signer                (lag-measured)
 *   3. fund      POST /escrow/single-release/fund-escrow           (lender signs)
 *   4. approve   POST /escrow/single-release/approve-milestone     (platform)
 *   5. complete  POST /escrow/single-release/change-milestone-status (originator)
 *   6. state     on-chain get_escrow + read model validateOnChain=true
 *   7. release   POST /escrow/single-release/release-funds  ← THE TEST
 *                → if 200: sign+submit (bug fixed!)
 *                → if 400: direct on-chain release_funds (workaround)
 *   8. balances  Horizon, before vs after
 *
 * Env:
 *   TW_API_KEY     required — TW x-api-key (id.secret)
 *   TW_ENGAGEMENT  optional — engagementId (default invofi-e2e-escrow-004-o1)
 *
 * Identities come from the stellar CLI store (~/.config/stellar/identity):
 *   e2e-lender       = funder/signer      (GDHS…)
 *   e2e-originator   = receiver/serviceProvider (GAB3…)
 *   invofi-deployer  = platform (approver/releaseSigner/disputeResolver) (GBDD…)
 *
 * Run: TW_API_KEY=… tsx tw-retest.ts
 */
import {
  Contract,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
  rpc as SorobanRpc,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { execSync } from 'node:child_process';

// ── Config ───────────────────────────────────────────────────────────────────

const API = 'https://dev.api.trustlesswork.com';
const NET = Networks.TESTNET;
const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON = 'https://horizon-testnet.stellar.org';
const ASSET_SYMBOL = process.env.TW_ASSET ?? 'USDC';
const ASSET_ISSUER =
  process.env.TW_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
// Legacy VBUC verification run: TW_ASSET=VBUC TW_ISSUER=GBG77OVPMWHLOSRD3MSJ2IN7GLUTLCUWOV5J53WY4NBAOO4YZTQ6WFQ6

const KEY = process.env.TW_API_KEY ?? '';
if (!KEY) {
  console.error('TW_API_KEY is required');
  process.exit(1);
}
const ENGAGEMENT = process.env.TW_ENGAGEMENT ?? 'invofi-e2e-escrow-004-o1';
const AMOUNT = 250; // human units
const PLATFORM_FEE = 0.5; // percent

const LENDER = Keypair.fromSecret(seedOf('e2e-lender'));
const ORIGINATOR = Keypair.fromSecret(seedOf('e2e-originator'));
const PLATFORM = Keypair.fromSecret(seedOf('invofi-deployer'));

/** Secret key for a stellar-CLI identity (`stellar keys show` handles both S-keys and mnemonics). */
function seedOf(name: string): string {
  return execSync(`stellar keys show ${name}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\s+/).pop()!;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

// ── TW API helpers ───────────────────────────────────────────────────────────

interface TwResult { status: number; ok: boolean; json: any; text: string }

async function tw(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<TwResult> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text };
}

async function submitSigned(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NET) as Transaction;
  const hash = tx.hash().toString('hex');
  const r = await tw('/helper/send-transaction', { signedXdr });
  if (!r.ok) throw new Error(`send-transaction ${r.status}: ${r.text.slice(0, 300)}`);
  log(`    submitted ${hash}`);
  return hash;
}

async function awaitHorizon(hash: string, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await sleep(4000);
    const res = await fetch(`${HORIZON}/transactions/${hash}`);
    if (res.status === 200) {
      const j = (await res.json()) as { successful?: boolean };
      if (j.successful === true) return true;
      if (j.successful === false) return false;
    }
  }
  throw new Error(`tx ${hash} not found on Horizon after ${tries} tries`);
}

async function runStep(name: string, signer: Keypair, buildPath: string, buildBody: unknown, buildRetries = 1): Promise<string> {
  for (let attempt = 1; attempt <= buildRetries; attempt++) {
    const r = await tw(buildPath, buildBody);
    if (r.ok) {
      const unsigned = r.json?.unsignedTransaction as string | undefined;
      if (!unsigned) throw new Error(`${buildPath}: no unsignedTransaction in response: ${r.text.slice(0, 200)}`);
      const tx = TransactionBuilder.fromXDR(unsigned, NET) as Transaction;
      tx.sign(signer);
      const hash = await submitSigned(tx.toXDR());
      const ok = await awaitHorizon(hash);
      log(`  ${name}: tx ${hash} successful=${ok}`);
      if (!ok) throw new Error(`${name}: transaction failed on-chain`);
      return hash;
    }
    const retryable = /not found|index|temporarily|ECONN/i.test(r.text);
    if (attempt < buildRetries && retryable) {
      log(`  ${name}: build attempt ${attempt} → ${r.status} ${r.text.slice(0, 140)} — retrying in 12s`);
      await sleep(12000);
      continue;
    }
    throw new Error(`${buildPath} → ${r.status}: ${r.text.slice(0, 300)}`);
  }
  throw new Error('unreachable');
}

// ── Chain readers ────────────────────────────────────────────────────────────

async function onChainState(contractId: string): Promise<any> {
  const server = new SorobanRpc.Server(RPC_URL);
  const source = await server.getAccount(PLATFORM.publicKey());
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NET })
    .addOperation(new Contract(contractId).call('get_escrow'))
    .setTimeout(30)
    .build();
  const sim: any = await server.simulateTransaction(tx);
  if (sim.error) throw new Error(`simulation error: ${JSON.stringify(sim.error).slice(0, 200)}`);
  return scValToNative(sim.result.retval);
}

async function balances(pub: string): Promise<string> {
  const res = await fetch(`${HORIZON}/accounts/${pub}`);
  if (!res.ok) return '(account missing)';
  const j = (await res.json()) as { balances: Array<Record<string, string>> };
  return j.balances.map(b => `${b.asset_code ?? b.asset_type}=${b.balance}`).join('  ');
}

function unwrapRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.escrows)) return data.escrows;
    if (data.data && typeof data.data === 'object') return [data.data];
  }
  return [];
}

/** Resolves the fresh escrow's contract id from the read model, measuring lag. */
async function resolveEscrowIds(): Promise<{ contractId: string; contractBaseId: string | null; lagMs: number }> {
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 18; attempt++) {
    const r = await tw(`/helper/get-escrows-by-signer?signer=${LENDER.publicKey()}`, undefined, 'GET');
    if (r.ok) {
      const hit = unwrapRows(r.json).find((row: any) => row.engagementId === ENGAGEMENT);
      if (hit?.contractId) {
        return { contractId: hit.contractId, contractBaseId: hit.contractBaseId ?? null, lagMs: Date.now() - t0 };
      }
    }
    log(`  indexer: engagement ${ENGAGEMENT} not in read model yet (attempt ${attempt})`);
    await sleep(10000);
  }
  throw new Error(`escrow never indexed after ${(Date.now() - t0) / 1000 | 0}s — indexer lag/extreme`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`TW release-funds retest — engagement=${ENGAGEMENT} amount=${AMOUNT} fee=${PLATFORM_FEE}%`);
  log(`lender=${LENDER.publicKey()}`);
  log(`originator=${ORIGINATOR.publicKey()}`);
  log(`platform=${PLATFORM.publicKey()}`);

  log('BEFORE  lender:     ' + await balances(LENDER.publicKey()));
  log('BEFORE  originator: ' + await balances(ORIGINATOR.publicKey()));
  log('BEFORE  platform:   ' + await balances(PLATFORM.publicKey()));

  // 1. Deploy (full API path)
  log('STEP 1 deploy (POST /deployer/single-release)');
  const deployBody = {
    signer: LENDER.publicKey(),
    engagementId: ENGAGEMENT,
    title: 'InvoFi TW retest 004',
    description: 'Retest of the release-funds build endpoint after the maintainer-reported infra pause',
    roles: {
      approver: PLATFORM.publicKey(),
      serviceProvider: ORIGINATOR.publicKey(),
      platformAddress: PLATFORM.publicKey(),
      releaseSigner: PLATFORM.publicKey(),
      disputeResolver: PLATFORM.publicKey(),
      receiver: ORIGINATOR.publicKey(),
    },
    amount: AMOUNT,
    platformFee: PLATFORM_FEE,
    milestones: [{ description: 'InvoFi retest delivery milestone' }],
    trustline: { address: ASSET_ISSUER, symbol: ASSET_SYMBOL },
  };
  const deployTx = await runStep('deploy', LENDER, '/deployer/single-release', deployBody);

  // 2. Resolve contract id (indexer-lag measurement)
  log('STEP 2 resolve contract id from read model');
  const { contractId, contractBaseId, lagMs } = await resolveEscrowIds();
  log(`  contractId=${contractId}`);
  log(`  contractBaseId=${contractBaseId}`);
  log(`  INDEXER LAG: ${lagMs / 1000 | 0}s from deploy confirmation to indexed`);

  // 3. Fund via API (this is what failed on 2026-09-10 with "Escrow not found")
  log('STEP 3 fund via API');
  await runStep('fund', LENDER, '/escrow/single-release/fund-escrow',
    { contractId, signer: LENDER.publicKey(), amount: AMOUNT }, 5);

  // 4. Approve milestone (platform)
  log('STEP 4 approve milestone');
  await runStep('approve', PLATFORM, '/escrow/single-release/approve-milestone',
    { contractId, milestoneIndex: '0', approver: PLATFORM.publicKey() });

  // 5. Complete milestone (originator = serviceProvider)
  log('STEP 5 change milestone status → completed');
  await runStep('complete', ORIGINATOR, '/escrow/single-release/change-milestone-status',
    { contractId, milestoneIndex: '0', serviceProvider: ORIGINATOR.publicKey(), newStatus: 'completed', newEvidence: 'InvoFi retest 004 — delivery confirmed' });

  // 6. State proof at attempt time
  log('STEP 6 state before release attempt');
  const chain = await onChainState(contractId);
  log(`  on-chain: flags=${JSON.stringify(chain.flags ?? chain)} milestone=${JSON.stringify(chain.milestone ?? '')}`.slice(0, 400));
  const read = await tw(`/helper/get-escrow-by-contract-ids?contractIds%5B%5D=${contractId}&validateOnChain=true`, undefined, 'GET');
  log(`  read model (validateOnChain=true): ${read.ok ? JSON.stringify(unwrapRows(read.json)[0]).slice(0, 400) : read.text.slice(0, 200)}`);

  // 7. THE TEST — release-funds build endpoint
  log('STEP 7 release-funds BUILD attempt (the bug test)');
  const rel = await tw('/escrow/single-release/release-funds', { contractId, releaseSigner: PLATFORM.publicKey() });
  log(`  → HTTP ${rel.status} ${rel.ok ? '(SUCCESS — bug appears FIXED)' : rel.text.slice(0, 300)}`);

  let releaseTx: string;
  if (rel.ok) {
    const unsigned = rel.json?.unsignedTransaction as string | undefined;
    if (!unsigned) throw new Error(`release build ok but no unsignedTransaction: ${rel.text.slice(0, 200)}`);
    const tx = TransactionBuilder.fromXDR(unsigned, NET) as Transaction;
    tx.sign(PLATFORM);
    const hash = await submitSigned(tx.toXDR());
    const ok = await awaitHorizon(hash);
    log(`  release via API: tx ${hash} successful=${ok}`);
    if (!ok) throw new Error('API release tx failed on-chain');
    releaseTx = hash;
  } else {
    // retry once after 30s before declaring the bug live
    await sleep(30000);
    const rel2 = await tw('/escrow/single-release/release-funds', { contractId, releaseSigner: PLATFORM.publicKey() });
    log(`  retry after 30s → HTTP ${rel2.status}`);
    if (rel2.ok) {
      const unsigned = rel2.json?.unsignedTransaction as string | undefined;
      const tx = TransactionBuilder.fromXDR(unsigned!, NET) as Transaction;
      tx.sign(PLATFORM);
      const hash = await submitSigned(tx.toXDR());
      const ok = await awaitHorizon(hash);
      log(`  release via API (retry): tx ${hash} successful=${ok}`);
      if (!ok) throw new Error('API release tx failed on-chain');
      releaseTx = hash;
    } else {
      log('  bug still live — falling back to direct on-chain release_funds');
      if (!contractBaseId) throw new Error('no contractBaseId in read model — cannot do direct release');
      const server = new SorobanRpc.Server(RPC_URL);
      const source = await server.getAccount(PLATFORM.publicKey());
      const op = new Contract(contractId).call(
        'release_funds',
        nativeToScVal(PLATFORM.publicKey(), { type: 'address' }),
        nativeToScVal(contractBaseId, { type: 'address' }),
      );
      const raw = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NET })
        .addOperation(op)
        .setTimeout(60)
        .build();
      // Soroban invocations must be simulated + resource-attached before
      // signing — an unprepared submit is rejected as txMalformed.
      const prepared = await server.prepareTransaction(raw);
      prepared.sign(PLATFORM);
      const sent = await server.sendTransaction(prepared);
      for (let i = 0; i < 20; i++) {
        const tr: any = await server.getTransaction(sent.hash);
        if (tr.status === 'SUCCESS') { log(`  direct release: tx ${sent.hash} SUCCESS`); releaseTx = sent.hash; break; }
        if (tr.status === 'ERROR') throw new Error(`direct release failed on-chain: ${JSON.stringify(tr.resultXdr ?? '').slice(0, 200)}`);
        await sleep(3000);
      }
      if (!releaseTx) throw new Error('direct release: no final status after polling');
    }
  }

  log('AFTER   lender:     ' + await balances(LENDER.publicKey()));
  log('AFTER   originator: ' + await balances(ORIGINATOR.publicKey()));
  log('AFTER   platform:   ' + await balances(PLATFORM.publicKey()));

  console.log('\n════ SUMMARY ════');
  console.log(`engagement:    ${ENGAGEMENT}`);
  console.log(`contractId:    ${contractId}`);
  console.log(`baseId:        ${contractBaseId}`);
  console.log(`deploy tx:     ${deployTx}`);
  console.log(`release tx:    ${releaseTx}`);
  console.log(`indexer lag:   ${lagMs / 1000 | 0}s`);
  console.log(`release build: HTTP ${rel.status} ${rel.ok ? 'OK (fixed)' : '400 bug still live'}`);
}

main().catch(err => {
  console.error(`\nFATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
