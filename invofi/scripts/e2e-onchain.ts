#!/usr/bin/env tsx
/**
 * InvoFi on-chain e2e flow (issue #171)
 * ====================================
 * Exercises the core lifecycle — register_invoice → create_offer →
 * accept_offer — against the live Stellar testnet contracts using two seeded
 * identities. This is the single "scripted on-chain flow" from the issue: it
 * catches contract-wiring regressions that pass unit checks but would still
 * break the app.
 *
 * Why two identities: the financing contract rejects a lender that is the same
 * account as the originator, so the business (originator) and the lender must
 * be distinct funded keys.
 *
 * Why this script also does an XLM `approve` and a position-token trustline:
 * `accept_offer` pulls the lender's principal via `transfer_from` (needs an
 * allowance on the settlement token) and mints the lender's position token
 * (needs a trustline to that token's underlying asset). The position-token
 * asset is derived from the token contract's `name()` (`"CODE:ISSUER"`) so the
 * script follows whatever the deployed financing contract actually points at,
 * rather than trusting a hardcoded asset.
 *
 * Env vars:
 *   E2E_ORIGINATOR_SECRET_KEY   secret key of the business identity (required)
 *   E2E_LENDER_SECRET_KEY       secret key of the lender identity (required)
 *   REGISTRY_CONTRACT_ID        registry contract (default: testnet v0.3)
 *   FINANCING_CONTRACT_ID       financing contract (default: testnet v0.3)
 *   REPAYMENT_CONTRACT_ID       repayment contract (default: testnet v0.3)
 *   RPC_URL                     Soroban RPC (default: soroban-testnet)
 *   HORIZON_URL                 Horizon (default: horizon-testnet)
 *   NETWORK_PASSPHRASE          network passphrase (default: testnet)
 *   E2E_AMOUNT_STROOPS          amount in stroops (default: 1 XLM)
 *
 * On testnet the two identities are auto-funded via Friendbot if missing.
 */

import {
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  rpc as SorobanRpc,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { createInvofiClient } from '../apps/sdk/src/index';

// ── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET;
const REGISTRY_ID =
  process.env.REGISTRY_CONTRACT_ID ??
  'CCV4OSLYRRMYTRMWH4GVWY2QGSFC5PV33KYQEMQF6DOQW3OXDAVBSHSY';
const FINANCING_ID =
  process.env.FINANCING_CONTRACT_ID ??
  'CBGRA3457ZFXYZNEQLO4YGUQ3OBEWOE6US6ZREHK6NF2DLZYBO73IFVW';
const REPAYMENT_ID =
  process.env.REPAYMENT_CONTRACT_ID ??
  'CCDATW5GMVDOPK55Q4MLXV5SGA3VLXPD67ABLBNMHWFF6BLL2IZBUVEP';
const AMOUNT_STROOPS = BigInt(process.env.E2E_AMOUNT_STROOPS ?? 10_000_000n); // 1 XLM

// Invoice/offer status discriminants — must match invofi-contracts.
const INVOICE_STATUS = { Pending: 0, Financed: 1, Repaid: 2, Overdue: 3, Cancelled: 4 } as const;
const OFFER_STATUS = { Pending: 0, Accepted: 1, Rejected: 2, Repaid: 3, Defaulted: 4 } as const;

const INTEREST_RATE_BPS = 500; // 5.00%
const DURATION_SECS = 30 * 86_400; // 30 days
const FEE = '100';

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeSymbol(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'symbol' });
}

function encodeAddress(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'address' });
}

function encodeI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

function encodeU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}

/**
 * Normalizes a status field to its numeric discriminant. The SDK types these
 * as the mirror's string union, but the contract serializes them as u32.
 */
function statusOf(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? -1 : n;
}

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (a funded Stellar testnet secret key).`);
  return value;
}

/** Fund a testnet account via Friendbot if it does not exist yet. */
async function ensureAccount(rpcServer: SorobanRpc.Server, address: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rpcServer.getAccount(address);
      return;
    } catch {
      /* account missing — fund below */
    }
    if (NETWORK_PASSPHRASE !== Networks.TESTNET) {
      throw new Error(`Account ${address} missing and network is not testnet — fund it manually.`);
    }
    const net = await rpcServer.getNetwork();
    const friendbotUrl = net.friendbotUrl ?? 'https://friendbot.stellar.org';
    log(`funding ${address.slice(0, 8)}… via friendbot`);
    const res = await fetch(`${friendbotUrl}?addr=${address}`);
    if (!res.ok && res.status !== 400) {
      throw new Error(`Friendbot funding failed (${res.status}): ${await res.text()}`);
    }
    for (let i = 0; i < 10; i++) {
      await sleep(1_000);
      try {
        await rpcServer.getAccount(address);
        return;
      } catch {
        /* keep polling */
      }
    }
  }
  throw new Error(`Account ${address} could not be confirmed after funding`);
}

/** Read-only contract call via simulateTransaction (no signing). */
async function readContract(
  rpcServer: SorobanRpc.Server,
  sourceAccount: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<unknown> {
  const account = await rpcServer.getAccount(sourceAccount);
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Read ${method} failed: ${sim.error}`);
  }
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`Read ${method} returned no result`);
  }
  return scValToNative(sim.result.retval);
}

/** Sign-and-submit a single contract invocation and wait for confirmation. */
async function invoke(
  rpcServer: SorobanRpc.Server,
  kp: Keypair,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<void> {
  await ensureAccount(rpcServer, kp.publicKey());
  const account = await rpcServer.getAccount(kp.publicKey());
  let tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`${method} simulation failed: ${sim.error}`);
  }
  tx = SorobanRpc.assembleTransaction(tx, sim).build();
  tx.sign(kp);

  const sent = await rpcServer.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    throw new Error(`${method} failed: ${JSON.stringify(sent.errorResult)}`);
  }
  let result = await rpcServer.getTransaction(sent.hash);
  for (let i = 0; i < 20 && result.status === 'NOT_FOUND'; i++) {
    await sleep(1_000);
    result = await rpcServer.getTransaction(sent.hash);
  }
  if (result.status !== 'SUCCESS') {
    throw new Error(`${method} did not succeed: ${result.status}`);
  }
}

/** Lender approves the financing contract to pull `amount` of the settlement token. */
async function approveSettlementToken(
  rpcServer: SorobanRpc.Server,
  lender: Keypair,
  tokenId: string,
  spender: string,
  amount: bigint,
): Promise<void> {
  const latest = (await rpcServer.getLatestLedger()).sequence;
  const liveUntil = latest + 1_000_000; // ~1 week of ledgers; u32-safe on testnet
  log(`approving ${spender.slice(0, 8)}… to spend ${amount} of ${tokenId.slice(0, 8)}…`);
  await invoke(rpcServer, lender, tokenId, 'approve', [
    encodeAddress(lender.publicKey()),
    encodeAddress(spender),
    encodeI128(amount),
    encodeU32(liveUntil),
  ]);
}

/** Poll the position token's balance read until the lender's trustline is visible to the RPC. */
async function waitForTrustline(
  rpcServer: SorobanRpc.Server,
  lender: Keypair,
  tokenId: string,
): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      await readContract(rpcServer, lender.publicKey(), tokenId, 'balance', [
        encodeAddress(lender.publicKey()),
      ]);
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error('Position-token trustline did not become visible to the RPC in time.');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const originator = Keypair.fromSecret(requireSecret('E2E_ORIGINATOR_SECRET_KEY'));
  const lender = Keypair.fromSecret(requireSecret('E2E_LENDER_SECRET_KEY'));
  if (originator.publicKey() === lender.publicKey()) {
    throw new Error('The originator and lender identities must differ (the financing contract rejects self-lending).');
  }

  const rpcServer = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  await ensureAccount(rpcServer, originator.publicKey());
  await ensureAccount(rpcServer, lender.publicKey());

  // ── Discover the settlement + position tokens before building the clients ──
  const settlementToken = (await readContract(
    rpcServer,
    originator.publicKey(),
    FINANCING_ID,
    'get_currency_token',
    [encodeSymbol('XLM')],
  )) as string;

  const positionTokenId = (await readContract(
    rpcServer,
    originator.publicKey(),
    FINANCING_ID,
    'get_position_token',
    [],
  )) as string | null;
  if (!positionTokenId) throw new Error('Financing contract returned no position token.');

  const positionTokenName = (await readContract(
    rpcServer,
    originator.publicKey(),
    positionTokenId,
    'name',
    [],
  )) as string;
  if (!positionTokenName.includes(':')) {
    throw new Error(`Unexpected position-token name (expected "CODE:ISSUER"): ${positionTokenName}`);
  }
  const positionTokenAsset = positionTokenName; // e.g. "POSI:GBDD…"

  const signWith = (kp: Keypair) => async (txXdr: string): Promise<string> => {
    const tx = new Transaction(txXdr, NETWORK_PASSPHRASE);
    tx.sign(kp);
    return tx.toXDR();
  };

  const makeClient = (kp: Keypair) =>
    createInvofiClient({
      rpcUrl: RPC_URL,
      horizonUrl: HORIZON_URL,
      networkPassphrase: NETWORK_PASSPHRASE as typeof Networks.TESTNET | typeof Networks.PUBLIC,
      registryId: REGISTRY_ID,
      financingId: FINANCING_ID,
      repaymentId: REPAYMENT_ID,
      positionTokenAsset,
      signTransaction: signWith(kp),
    });

  const originatorClient = makeClient(originator);
  const lenderClient = makeClient(lender);

  log(`originator   = ${originator.publicKey()}`);
  log(`lender       = ${lender.publicKey()}`);
  log(`registry     = ${REGISTRY_ID.slice(0, 8)}…`);
  log(`settlement   = ${settlementToken.slice(0, 8)}…`);
  log(`position     = ${positionTokenId.slice(0, 8)}… (${positionTokenAsset})`);

  // ── The lifecycle ──────────────────────────────────────────────────────────
  const invoiceId = `inv_e2e_${Date.now().toString(36)}`;
  const offerId = `off_e2e_${Date.now().toString(36)}`;
  const dueDate = Math.floor(Date.now() / 1000) + 30 * 86_400;

  log(`register_invoice ${invoiceId}`);
  await originatorClient.registerInvoice(
    { id: invoiceId, amount: AMOUNT_STROOPS, currency: 'XLM', dueDate },
    originator.publicKey(),
  );

  log(`create_offer ${offerId} → ${invoiceId}`);
  await lenderClient.createOffer(
    {
      offerId,
      invoiceId,
      amount: AMOUNT_STROOPS,
      currency: 'XLM',
      interestRate: INTEREST_RATE_BPS,
      duration: DURATION_SECS,
    },
    lender.publicKey(),
  );

  await approveSettlementToken(rpcServer, lender, settlementToken, FINANCING_ID, AMOUNT_STROOPS);

  if (!(await lenderClient.hasPositionTrustline(lender.publicKey()))) {
    log('adding position-token trustline');
    await lenderClient.addPositionTrustline(lender.publicKey());
    await waitForTrustline(rpcServer, lender, positionTokenId);
  }

  log(`accept_offer ${offerId}`);
  await originatorClient.acceptOffer(offerId, originator.publicKey());

  // ── Verify the resulting state ─────────────────────────────────────────────
  const invoice = await originatorClient.getInvoice(invoiceId, originator.publicKey());
  const offer = await originatorClient.getOffer(offerId, originator.publicKey());

  // The SDK types `status` as the mirror's string union, but the contract
  // actually serializes it as the u32 discriminant. Normalize defensively.
  const invoiceStatus = statusOf(invoice.status);
  const offerStatus = statusOf(offer.status);
  if (invoiceStatus !== INVOICE_STATUS.Financed) {
    throw new Error(`Expected invoice ${invoiceId} to be Financed (1), got ${invoiceStatus}`);
  }
  if (offerStatus !== OFFER_STATUS.Accepted) {
    throw new Error(`Expected offer ${offerId} to be Accepted (1), got ${offerStatus}`);
  }

  log(`✓ invoice ${invoiceId} → Financed`);
  log(`✓ offer   ${offerId} → Accepted`);
  log(`e2e on-chain flow complete`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`e2e on-chain flow FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
