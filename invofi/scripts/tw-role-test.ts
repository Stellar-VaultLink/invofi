#!/usr/bin/env tsx
/**
 * TW release-funds role-collision test — escrow 007.
 *
 * Hypothesis (from the TW team): the release-funds build endpoint works when
 * the payload uses the proper release signer + contract id — implying our
 * four failing escrows may have tripped the pre-check because
 * releaseSigner == approver == disputeResolver == platformAddress (the
 * platform key held every role).
 *
 * This run isolates exactly the release-signer variable: platform-ish roles
 * keep our production mapping (approver = platformAddress = platform), while
 * releaseSigner and disputeResolver are DISTINCT wallets:
 *   signer/funder       = e2e-lender      (GDHS…)
 *   approver            = invofi-deployer (GBDD…)
 *   platformAddress     = invofi-deployer (GBDD…)
 *   serviceProvider     = e2e-originator  (GAB3…)
 *   releaseSigner       = e2e-buyer       (GCPN…)
 *   disputeResolver     = keeper          (GCEC…)
 *
 * Outcome A: release build 200 → role collision IS the trigger; sign+submit
 *            as the buyer proves the fix end-to-end.
 * Outcome B: release build 400 → collision theory ruled out; payload shape
 *            was already spec-perfect, bug is elsewhere in their pre-check.
 */
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { execSync } from 'node:child_process';

const API = 'https://dev.api.trustlesswork.com';
const NET = Networks.TESTNET;
const KEY = process.env.TW_API_KEY ?? '';
if (!KEY) { console.error('TW_API_KEY required'); process.exit(1); }

const ENGAGEMENT = process.env.TW_ENGAGEMENT ?? 'invofi-e2e-escrow-008-o1';
const AMOUNT = 250;
const FEE = 0.5;
const ASSET_SYMBOL = process.env.TW_ASSET ?? 'USDC';
const ASSET_ISSUER =
  process.env.TW_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const kp = (name: string) => Keypair.fromSecret(execSync(`stellar keys show ${name}`, { encoding: 'utf8' }).trim().split(/\s+/).pop()!);
const LENDER = kp('e2e-lender');
const PLATFORM = kp('invofi-deployer');
const ORIGINATOR = kp('e2e-originator');
const BUYER = kp('e2e-buyer');
const KEEPER = kp('keeper');
const disputeResolver = KEEPER.publicKey();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

async function tw(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

async function runStep(name: string, signer: Keypair, buildPath: string, buildBody: unknown): Promise<string> {
  const r = await tw(buildPath, buildBody);
  if (!r.ok) throw new Error(`${buildPath} → ${r.status}: ${r.text.slice(0, 250)}`);
  const tx = TransactionBuilder.fromXDR(r.json.unsignedTransaction, NET);
  tx.sign(signer);
  const sub = await tw('/helper/send-transaction', { signedXdr: tx.toXDR() });
  if (!sub.ok) throw new Error(`send-transaction → ${sub.status}: ${sub.text.slice(0, 250)}`);
  // TW's submit response may omit the hash — compute it from the signed tx.
  const hash = (sub.json as any)?.hash ?? (sub.json as any)?.txHash ?? TransactionBuilder.fromXDR(tx.toXDR(), NET).hash().toString('hex');
  log(`  ${name}: submitted ${hash}`);
  // wait for Horizon confirmation
  for (let i = 0; i < 25; i++) {
    await sleep(3000);
    const h = await fetch(`https://horizon-testnet.stellar.org/transactions/${hash}`);
    if (h.status === 200) {
      const j = (await h.json()) as { successful?: boolean };
      log(`  ${name}: successful=${j.successful}`);
      if (!j.successful) throw new Error(`${name} failed on-chain`);
      return hash;
    }
  }
  throw new Error(`${name}: not on Horizon in time`);
}

async function main() {
  log('ROLE-COLLISION TEST — every role a distinct address');
  log(`funder=${LENDER.publicKey()}`);
  log(`approver=${PLATFORM.publicKey()}`);
  log(`serviceProvider=${ORIGINATOR.publicKey()}`);
  log(`platformAddress=${PLATFORM.publicKey()}`);
  log(`releaseSigner=${BUYER.publicKey()}`);
  log(`disputeResolver=${disputeResolver}`);

  // 1. deploy
  const dep = await tw('/deployer/single-release', {
    signer: LENDER.publicKey(),
    engagementId: ENGAGEMENT,
    title: 'InvoFi role-collision test 007',
    description: 'Distinct address per role — isolates release-signer vs role-collision in the release pre-check',
    roles: {
      approver: PLATFORM.publicKey(),
      serviceProvider: ORIGINATOR.publicKey(),
      platformAddress: PLATFORM.publicKey(),
      releaseSigner: BUYER.publicKey(),
      disputeResolver,
      receiver: ORIGINATOR.publicKey(),
    },
    amount: AMOUNT,
    platformFee: FEE,
    milestones: [{ description: 'Role-collision test delivery milestone' }],
    trustline: { address: ASSET_ISSUER, symbol: ASSET_SYMBOL },
  });
  if (!dep.ok) throw new Error(`deploy build → ${dep.status}: ${dep.text.slice(0, 250)}`);
  const dtx = TransactionBuilder.fromXDR(dep.json.unsignedTransaction, NET);
  dtx.sign(LENDER);
  const dsub = await tw('/helper/send-transaction', { signedXdr: dtx.toXDR() });
  if (!dsub.ok) throw new Error(`deploy submit → ${dsub.status}: ${dsub.text.slice(0, 250)}`);
  const deployHash = (dsub.json as any)?.hash ?? (dsub.json as any)?.txHash ?? dtx.hash().toString('hex');
  log(`  deploy: submitted ${deployHash}`);

  // 2. resolve contract id from read model
  let contractId = '';
  let contractBaseId = '';
  const t0 = Date.now();
  for (let i = 1; i <= 18; i++) {
    const r = await tw(`/helper/get-escrows-by-signer?signer=${LENDER.publicKey()}`, undefined, 'GET');
    if (r.ok) {
      const rows = Array.isArray(r.json) ? r.json : (r.json?.data ?? r.json?.escrows ?? []);
      const hit = rows.find((x: any) => x.engagementId === ENGAGEMENT);
      if (hit?.contractId) {
        contractId = hit.contractId;
        contractBaseId = hit.contractBaseId ?? '';
        break;
      }
    }
    await sleep(8000);
  }
  if (!contractId) throw new Error('escrow never indexed');
  log(`  contractId=${contractId} (indexed in ${((Date.now() - t0) / 1000) | 0}s)`);

  // 3-5. fund (lender) → approve (platform) → complete (originator)
  await runStep('fund', LENDER, '/escrow/single-release/fund-escrow', { contractId, signer: LENDER.publicKey(), amount: AMOUNT });
  await runStep('approve', PLATFORM, '/escrow/single-release/approve-milestone', { contractId, milestoneIndex: '0', approver: PLATFORM.publicKey() });
  await runStep('complete', ORIGINATOR, '/escrow/single-release/change-milestone-status', { contractId, milestoneIndex: '0', serviceProvider: ORIGINATOR.publicKey(), newStatus: 'completed', newEvidence: 'Role-collision test — delivery confirmed' });

  // 6. THE TEST: release build with the proper distinct releaseSigner
  log('RELEASE BUILD with distinct releaseSigner (the test)');
  const rel = await tw('/escrow/single-release/release-funds', { contractId, releaseSigner: BUYER.publicKey() });
  log(`  → HTTP ${rel.status} ${rel.ok ? '★ SUCCESS — ROLE COLLISION WAS THE TRIGGER' : rel.text.slice(0, 220)}`);
  if (!rel.ok) {
    await sleep(20000);
    const rel2 = await tw('/escrow/single-release/release-funds', { contractId, releaseSigner: BUYER.publicKey() });
    log(`  retry → HTTP ${rel2.status}`);
    if (rel2.ok) {
      log('  ★ SUCCESS on retry — role collision WAS the trigger');
      rel.ok = true; rel.json = rel2.json;
    } else {
      console.log(`\nVERDICT: 400 persists with fully distinct roles — collision theory ruled out.`);
      console.log(`contractId=${contractId}`);
      return;
    }
  }

  // 7. sign + submit as the actual release signer (buyer)
  const rtx = TransactionBuilder.fromXDR(rel.json.unsignedTransaction, NET);
  rtx.sign(BUYER);
  const rsub = await tw('/helper/send-transaction', { signedXdr: rtx.toXDR() });
  if (!rsub.ok) throw new Error(`release submit → ${rsub.status}: ${rsub.text.slice(0, 250)}`);
  const releaseHash = (rsub.json as any)?.hash ?? (rsub.json as any)?.txHash ?? rtx.hash().toString('hex');
  log(`  release via API: submitted ${releaseHash}`);

  console.log('\n════ SUMMARY ════');
  console.log(`engagement:  ${ENGAGEMENT}`);
  console.log(`contractId:  ${contractId}`);
  console.log(`deploy tx:   ${deployHash}`);
  console.log(`release tx:  ${releaseHash}`);
  console.log(`VERDICT:     release build ${rel.ok ? 'ACCEPTED with distinct roles → role collision is the trigger' : 'still rejected'}`);
}

main().catch(err => { console.error(`\nFATAL: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); });
