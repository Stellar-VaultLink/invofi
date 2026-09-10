// ── Trustless Work escrow binding (Phase 2 — Escrow Rail) ────────────────────
//
// Wires the `@invofi/sdk` escrow adapter to this app's env + wallet signer.
// The escrow rail is OFF unless `NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY` is set;
// every consumer goes through `isEscrowEnabled()` so the feature can be
// flipped on without a code change (and mock mode stays escrow-free).
//
// Server-side use (the API proxy route) imports the same factory directly —
// the key must never be bundled into client JS. This file is client-side
// only and uses the PROXY route for every call so the browser never sees
// the API key either: the key lives server-side in `TW_ESCROW_API_KEY`,
// and `NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY` acts purely as the feature flag.

import {
  createTrustlessWorkClient,
  usdcTestnetTrustline,
  submitDirectRelease,
  TrustlessWorkError,
  type DisbursementEscrowParams,
  type EscrowTrustline,
  type UnsignedTransaction,
  type SendTransactionResult,
} from '@invofi/sdk';
import { USDC_ISSUER_TESTNET } from './constants';
import { isMockMode } from './mock-mode';

// NOTE: `signTransactionWithActiveWallet` is imported lazily inside
// `signAndSubmitViaProxy` rather than statically. A static import would pull
// `@stellar/freighter-api` into every module-eval that touches this file
// (including jsdom unit tests that render OfferList without mocking the
// escrow lib), and freighter-api is CommonJS-only — it explodes under vitest
// ESM named-export resolution. The escrow rail is env-gated and never called
// in tests, so lazy-loading is both correct and test-safe.

const FLAG = process.env.NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY ?? '';
const TW_ENV = (process.env.NEXT_PUBLIC_TRUSTLESS_WORK_ENV ?? 'testnet') as 'testnet' | 'mainnet';
const TW_BASE_URL = process.env.NEXT_PUBLIC_TRUSTLESS_WORK_BASE_URL ?? '';
const TW_PLATFORM_ADDRESS = process.env.NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS ?? '';
const TW_PLATFORM_FEE = Number(process.env.NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_FEE ?? '0.5');
/** Optional override for the Escrow Viewer link template (see SDK escrowViewerUrl). */
export const ESCROW_VIEWER_URL_TEMPLATE = process.env.NEXT_PUBLIC_ESCROW_VIEWER_URL ?? '';
/** InvoFi platform wallet — the escrow's approver / release signer / dispute resolver. */
export const ESCROW_PLATFORM_ADDRESS = TW_PLATFORM_ADDRESS;

/** True when the escrow rail is configured and should appear in the UI. */
export function isEscrowEnabled(): boolean {
  if (isMockMode()) return false; // offline demo stays escrow-free
  return FLAG.length > 0 && TW_PLATFORM_ADDRESS.length > 0;
}

/** True when the server-side key is present (proxy route health). */
export function isEscrowServerConfigured(): boolean {
  return FLAG.length > 0;
}

/** USDC trustline for the current network. XLM flows never need an escrow trustline. */
export function escrowTrustlineForCurrency(currency: 'XLM' | 'USDC'): EscrowTrustline | null {
  if (currency !== 'USDC') return null;
  return usdcTestnetTrustline(USDC_ISSUER_TESTNET);
}

type EscrowAction = 'deploy' | 'fund' | 'release' | 'resolve' | 'approve' | 'change-status';

/**
 * Calls the Next.js API proxy (`/api/escrow/[action]`), which injects the
 * server-held API key and forwards to Trustless Work. Returns the build
 * result (unsigned XDR + txHash + future contractId for deploys).
 */
async function buildViaProxy(action: EscrowAction, body: Record<string, unknown>): Promise<UnsignedTransaction> {
  const res = await fetch(`/api/escrow/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      env: TW_ENV,
      ...(TW_BASE_URL ? { baseUrl: TW_BASE_URL } : {}),
    }),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new TrustlessWorkError(
      (data ?? { status: res.status, code: 'PROXY_ERROR', title: 'Escrow proxy error', detail: `Escrow ${action} failed (HTTP ${res.status}).` }) as Record<string, unknown>,
      res.status,
    );
  }
  return data as unknown as UnsignedTransaction;
}

/**
 * Signs an unsigned XDR with the connected wallet and submits it through
 * the proxy (which forwards to TW's /stellar/send-transaction).
 */
async function signAndSubmitViaProxy(unsignedXdr: string): Promise<SendTransactionResult> {
  const { signTransactionWithActiveWallet } = await import('./walletkit');
  const signedXdr = await signTransactionWithActiveWallet(unsignedXdr, TW_ENV === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015');
  const res = await fetch('/api/escrow/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedXdr, env: TW_ENV }),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new TrustlessWorkError(
      (data ?? { status: res.status, code: 'PROXY_ERROR', title: 'Escrow submit error', detail: `Escrow submit failed (HTTP ${res.status}).` }) as Record<string, unknown>,
      res.status,
    );
  }
  return { success: true, raw: data };
}

/**
 * Builds AND executes the disbursement escrow for an accepted offer:
 * deploy → (lender signs) → submit.
 *
 * The TW v1 deploy build does NOT return the escrow's on-chain contract id —
 * resolve it right after the fund tx lands with `resolveDisbursementEscrow`
 * (it matches TW's read model on the deterministic engagementId) and persist
 * the result against the offer.
 *
 * The caller must have already checked `isEscrowEnabled()` and obtained the
 * offer's amount in human-readable units.
 */
export async function createDisbursementEscrow(params: {
  invoiceId: string;
  offerId: string;
  amountHuman: number;
  lenderAddress: string;
  originatorAddress: string;
  trustline: EscrowTrustline;
}): Promise<{ result: SendTransactionResult }> {
  if (!isEscrowEnabled()) {
    throw new TrustlessWorkError({
      status: 412,
      code: 'ESCROW_DISABLED',
      title: 'Escrow rail disabled',
      detail: 'Set NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY and NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS to enable the escrow rail.',
    }, 412);
  }
  const built = await buildViaProxy('deploy', {
    invoiceId: params.invoiceId,
    offerId: params.offerId,
    amountHuman: params.amountHuman,
    lenderAddress: params.lenderAddress,
    originatorAddress: params.originatorAddress,
    platformAddress: TW_PLATFORM_ADDRESS,
    platformFeePercent: TW_PLATFORM_FEE,
    trustline: params.trustline,
  });
  const result = await signAndSubmitViaProxy(built.unsignedXdr);
  return { result };
}

/**
 * Resolves the escrow's on-chain contract id from TW's read model by
 * matching the deterministic engagementId among the lender's escrows.
 *
 * Two retry layers cover indexer lag:
 *   1. inside the proxy — the SDK's `resolveContractId` retries with
 *      exponential backoff (3 attempts, ≤2s waits) within one request; and
 *   2. here — outer retries across separate proxy calls with their own
 *      backoff + ±20% jitter, so total tolerance is roughly 45s of lag.
 *
 * Returns null when the escrow never appeared — the caller keeps going
 * (the offer keeps its accepted state; the mapping can be repaired later).
 */
export async function resolveDisbursementEscrow(
  invoiceId: string,
  offerId: string,
  lenderAddress: string,
  attempts = 3,
): Promise<string | null> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch('/api/escrow/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, offerId, signer: lenderAddress, env: TW_ENV }),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && typeof data?.contractId === 'string' && data.contractId.length > 0) {
        return data.contractId;
      }
    } catch {
      // Read-model lag / transient — retry.
    }
    if (i + 1 >= attempts) return null;
    const base = Math.min(2_000 * 2 ** i, 8_000);
    await new Promise(r => setTimeout(r, Math.round(base * (0.8 + 0.4 * Math.random()))));
  }
}

/**
 * Builds AND executes the fund tx (lender locks the financed amount in the
 * escrow). Called right after a successful deploy.
 */
export async function fundEscrow(contractId: string, lenderAddress: string, amountHuman: number): Promise<SendTransactionResult> {
  const built = await buildViaProxy('fund', { contractId, signer: lenderAddress, amount: amountHuman });
  return signAndSubmitViaProxy(built.unsignedXdr);
}

/**
 * Builds AND executes the release tx (platform releases funds to the
 * originator once the delivery milestone is approved).
 */
export async function releaseEscrow(contractId: string, platformAddress: string): Promise<SendTransactionResult> {
  const built = await buildViaProxy('release', { contractId, releaseSigner: platformAddress });
  return signAndSubmitViaProxy(built.unsignedXdr);
}

/**
 * Builds AND executes the milestone-approval tx — the PLATFORM wallet signs
 * (it is the escrow's approver role). Delivery approval is what makes the
 * escrow releasable.
 */
export async function approveMilestone(contractId: string, milestoneIndex: number, platformAddress: string): Promise<SendTransactionResult> {
  const built = await buildViaProxy('approve', { contractId, milestoneIndex, approver: platformAddress });
  return signAndSubmitViaProxy(built.unsignedXdr);
}

/**
 * Builds AND executes the milestone status change — the ORIGINATOR's wallet
 * signs (it is the escrow's service-provider role) to confirm delivery,
 * attaching free-form evidence (e.g. a delivery reference or IPFS cid).
 */
export async function confirmDelivery(contractId: string, milestoneIndex: number, originatorAddress: string, evidence = ''): Promise<SendTransactionResult> {
  const built = await buildViaProxy('change-status', { contractId, milestoneIndex, serviceProvider: originatorAddress, newStatus: 'completed', newEvidence: evidence });
  return signAndSubmitViaProxy(built.unsignedXdr);
}

/**
 * Builds AND executes the release DIRECTLY on-chain (Soroban RPC), bypassing
 * TW's release-funds build endpoint. This is the documented workaround for
 * TW's "Escrow already in dispute" bug, which rejects fully releasable
 * escrows (see docs/trustless-work-bug-report.md). `contractBaseId` comes
 * from the escrow read-model snapshot (extractContractBaseId).
 */
export async function releaseEscrowDirect(
  contractId: string,
  contractBaseId: string,
  platformAddress: string,
): Promise<SendTransactionResult> {
  // Only the config is needed — the standalone builder uses the RPC + wallet
  // signer directly and never calls the TW API.
  return submitDirectRelease(
    {
      env: TW_ENV,
      ...(TW_BASE_URL ? { baseUrl: TW_BASE_URL } : {}),
      apiKey: FLAG,
      networkPassphrase: TW_ENV === 'mainnet' ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015',
      signTransaction: async (txXdr, passphrase) => {
        const { signTransactionWithActiveWallet } = await import('./walletkit');
        return signTransactionWithActiveWallet(txXdr, passphrase);
      },
    },
    contractId,
    contractBaseId,
    platformAddress,
  );
}

/** UI-facing view of an escrow's milestone state (parsed from the read model). */
export interface EscrowStatus {
  contractId: string;
  contractBaseId: string | null;
  flags: { disputed: boolean; released: boolean; resolved: boolean };
  milestone: { approved: boolean; status: string } | null;
  amount: number | null;
}

/** Parses a TW read-model row into the UI-facing snapshot. */
export function parseEscrowStatus(snapshot: Record<string, unknown>, contractId: string): EscrowStatus {
  const flags = (snapshot.flags ?? {}) as Record<string, unknown>;
  const ms = (snapshot.milestone ?? null) as Record<string, unknown> | null;
  return {
    contractId,
    contractBaseId: typeof snapshot.contractBaseId === 'string' && snapshot.contractBaseId.length > 0 ? snapshot.contractBaseId : null,
    flags: {
      disputed: flags.disputed === true,
      released: flags.released === true,
      resolved: flags.resolved === true,
    },
    milestone: ms
      ? { approved: ms.approved === true, status: typeof ms.status === 'string' ? ms.status : 'unknown' }
      : null,
    amount: typeof snapshot.amount === 'number' ? snapshot.amount : null,
  };
}

/**
 * Reads the authoritative escrow snapshot from TW's read-model (via proxy).
 */
export async function getEscrowSnapshot(contractId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/escrow/status?contractId=${encodeURIComponent(contractId)}`, { method: 'GET' });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new TrustlessWorkError(
      (data ?? { status: res.status, code: 'PROXY_ERROR', title: 'Escrow read error', detail: `Escrow read failed (HTTP ${res.status}).` }) as Record<string, unknown>,
      res.status,
    );
  }
  return (data?.data ?? data) as Record<string, unknown>;
}

// Re-exports so components import escrow types from one place.
export type { DisbursementEscrowParams, EscrowTrustline, UnsignedTransaction, SendTransactionResult };
export { TrustlessWorkError };
export { escrowViewerUrl, contractIdMatchesBase } from '@invofi/sdk';
