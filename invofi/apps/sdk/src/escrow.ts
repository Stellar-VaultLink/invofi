// ── Trustless Work escrow adapter (Phase 2 — Escrow Rail) ────────────────────
//
// Typed client for the Trustless Work Core REST API (single-release escrows),
// giving InvoFi a milestone-gated disbursement rail: on `accept_offer` the
// financed amount can be routed lender → escrow → (delivery milestone
// approved) → originator instead of moving directly. See
// `docs/trustless-work-integration.md` in the invofi repo for the full plan.
//
// The one thing to understand about the TW API (their words): *the API never
// signs anything*. Every state-changing endpoint returns an unsigned
// transaction XDR. The wallet signs it; you submit it:
//
//   1. BUILD  POST /deployer/single-release            → { unsignedTransaction }
//   2. SIGN   your wallet signs unsignedTransaction    → signedXdr
//   3. SUBMIT POST /helper/send-transaction            → on-chain result
//
// CONTRACT VERIFIED LIVE against https://dev.api.trustlesswork.com (testnet,
// 2026-09-09) with a real key: the deploy build returns HTTP 201 with
// `{ status, unsignedTransaction }`. Route map taken from the live Swagger
// spec (GET /docs-json, 38 paths). Docs:
//   https://docs.trustlesswork.com/trustless-work/api-rest/introduction
//
// Deliberate choices:
//   - No HTTP dependency: `fetch` only (Node 18+ / all modern browsers).
//   - The adapter does NOT hold wallets: callers pass a `signTransaction`
//     callback (same shape as the main InvofiClient config), so the same
//     wallet-connection layer powers both.
//   - Single-release (not multi-release): one delivery-verification
//     milestone per disbursement escrow. Multi-release can be added later
//     without changing these types.
//   - v1 roles are SINGULAR addresses (one approver, one release signer, …).
//     ADR-0010's dual-approver design (platform OR lender) is not expressible
//     here; the platform is the approver so an absent external lender can
//     never strand the originator's funds. See the integration doc, §Roles.

// ── Types ────────────────────────────────────────────────────────────────────

/** Environments documented by Trustless Work. */
export type TrustlessWorkEnv = 'testnet' | 'mainnet';

export interface TrustlessWorkConfig {
  /** Which TW environment to hit. Defaults to `testnet`. */
  env?: TrustlessWorkEnv;
  /**
   * Overrides the derived base URL. Derived defaults:
   *   testnet → https://dev.api.trustlesswork.com
   *   mainnet → https://api.trustlesswork.com
   */
  baseUrl?: string;
  /** API key in TW's `id.secret` format — sent as the `x-api-key` header. */
  apiKey: string;
  /**
   * Signs the unsigned transaction XDR each build endpoint returns. Same
   * contract as `InvofiClientConfig.signTransaction` — wire it to the same
   * wallet kit.
   */
  signTransaction: (txXdr: string, networkPassphrase: string) => Promise<string>;
  /** Network passphrase handed to `signTransaction` (e.g. Networks.TESTNET). */
  networkPassphrase: string;
  /** Optional fetch override (tests, proxies). Defaults to globalThis.fetch. */
  fetchImpl?: FetchLike;
}

/** Minimal structural fetch type so the SDK needs no DOM/undici lib types. */
export interface FetchLike {
  (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

/**
 * v1 single-release roles — singular addresses per TW's payload reference
 * (https://docs.trustlesswork.com/trustless-work/introduction/developer-resources/types/payloads/deploy).
 */
export interface EscrowRoles {
  /** Address of the entity requiring the service — approves milestones. */
  approver: string;
  /** Address of the entity providing the service (fulfils the invoice). */
  serviceProvider: string;
  /** Address of the entity that owns the escrow — receives the platform fee. */
  platformAddress: string;
  /** Address in charge of releasing the escrow funds to the receiver. */
  releaseSigner: string;
  /** Address in charge of resolving disputes within the escrow. */
  disputeResolver: string;
  /** Address where escrow proceeds will be sent to. */
  receiver: string;
}

/** v1 trustline — issuer address + asset symbol (e.g. USDC). */
export interface EscrowTrustline {
  /** Issuer account (G…) establishing permission to accept the asset. */
  address: string;
  /** Asset code (e.g. `USDC`). */
  symbol: string;
}

export interface EscrowMilestone {
  description: string;
}

/** Body TW's `/deployer/single-release` accepts (verified against live spec). */
export interface DeployEscrowPayload {
  /** Entity that signs the transaction that deploys and initializes the escrow. */
  signer: string;
  /** Unique identifier for the escrow. */
  engagementId: string;
  /** Name of the escrow. */
  title: string;
  /** Text describing the function of the escrow. */
  description: string;
  roles: EscrowRoles;
  /** Human-readable decimals (e.g. 100.5 = 100.5 USDC) — NOT stroops. */
  amount: number;
  /** Platform fee in percent (1 = 1%). Cannot exceed 99. */
  platformFee: number;
  /** Objectives to complete to define the escrow as completed. */
  milestones: EscrowMilestone[];
  trustline: EscrowTrustline;
}

/** What every TW build endpoint returns (verified: `{ status, unsignedTransaction }`). */
export interface UnsignedTransaction {
  unsignedXdr: string;
}

/** Response of TW's `/helper/send-transaction`. */
export interface SendTransactionResult {
  success: boolean;
  /** Raw TW response — exact shape can evolve; treat as opaque unless `success`. */
  raw: unknown;
}

/**
 * Typed wrapper around TW errors. The v1 API returns NestJS-style
 * `{ statusCode, message, timestamp, path }` bodies; the newer v2 surface
 * (beta host) returns RFC 9457 Problem Details with a machine-readable
 * `code`. Both are mapped here so `code` is always safe to switch on.
 */
export class TrustlessWorkError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly traceId?: string;
  /** The full error body, for fields we don't surface explicitly. */
  readonly problem: Record<string, unknown> | null;

  constructor(problem: {
    status?: number;
    statusCode?: number;
    code?: string;
    title?: string;
    detail?: string;
    message?: string;
    traceId?: string;
    [k: string]: unknown;
  }, status?: number) {
    const detail =
      (typeof problem.detail === 'string' && problem.detail) ||
      (typeof problem.message === 'string' && problem.message) ||
      problem.title ||
      `Trustless Work request failed (HTTP ${problem.status ?? problem.statusCode ?? status ?? '?'})`;
    super(detail);
    this.name = 'TrustlessWorkError';
    this.status = (problem.status ?? problem.statusCode ?? status ?? 0) as number;
    this.code = (problem.code ?? (problem.statusCode !== undefined || problem.message ? 'TW_ERROR' : 'UNKNOWN')) as string;
    this.detail = detail;
    this.traceId = typeof problem.traceId === 'string' ? problem.traceId : undefined;
    this.problem = problem as Record<string, unknown>;
    Object.setPrototypeOf(this, TrustlessWorkError.prototype);
  }
}

// ── InvoFi → TW domain mapping ───────────────────────────────────────────────
//
// Disbursement escrow for an accepted offer:
//
//   lender ──fund──▶ escrow ──release (milestone: delivery verified)──▶ originator
//
// Role mapping (v1 — singular roles; documented in
// docs/trustless-work-integration.md §Roles and ADR-0010):
//   receiver         = originator   (gets the financed amount)
//   serviceProvider  = originator   (the party fulfilling the invoice)
//   approver         = platform     (approves the delivery milestone — kept
//                                    on-platform so an absent external
//                                    lender can never strand the funds;
//                                    ADR-0010's dual-approver is not
//                                    expressible in v1)
//   releaseSigner    = platform     (releases after approval)
//   disputeResolver  = platform     (invoice disputes map to TW disputes)
//   platformAddress  = platform     (receives the platform fee)
//
// The lender still signs the deploy + fund transactions as `signer`, so
// nothing moves without the lender's wallet.

export interface DisbursementEscrowParams {
  /** Invoice id (InvoFi domain) — becomes part of the engagementId. */
  invoiceId: string;
  /** Offer id (InvoFi domain) — becomes part of the engagementId. */
  offerId: string;
  /** Financed amount in human-readable units (e.g. 1250.5 USDC). */
  amountHuman: number;
  /** Wallet that signs the deploy transaction — the lender (the funder). */
  lenderAddress: string;
  /** The business receiving the disbursement. */
  originatorAddress: string;
  /** InvoFi platform wallet (approver / release signer / dispute resolver). */
  platformAddress: string;
  /** InvoFi's platform fee on the disbursement, in percent. */
  platformFeePercent: number;
  trustline: EscrowTrustline;
}

/** The single delivery-verification milestone attached to every disbursement. */
export const DELIVERY_MILESTONE_DESCRIPTION =
  'Invoice delivery verified — the originator has delivered per the registered invoice and the disbursement is approved for release.';

/** engagementId TW escrows get for InvoFi disbursements (used for lookups). */
export function disbursementEngagementId(invoiceId: string, offerId: string): string {
  return `invofi-${invoiceId}-${offerId}`;
}

/**
 * Maps InvoFi domain parameters onto TW's single-release deploy payload.
 * Exported for transparency and testing; `deployDisbursementEscrow` uses it.
 */
export function mapToDeployPayload(params: DisbursementEscrowParams): DeployEscrowPayload {
  return {
    signer: params.lenderAddress,
    engagementId: disbursementEngagementId(params.invoiceId, params.offerId),
    title: `InvoFi disbursement — invoice ${params.invoiceId}`,
    description:
      `Milestone-gated disbursement of invoice ${params.invoiceId} (offer ${params.offerId}) ` +
      'on InvoFi. Funds are released to the originator once delivery is verified; ' +
      'disputes route to the InvoFi platform dispute resolver.',
    roles: {
      approver: params.platformAddress,
      serviceProvider: params.originatorAddress,
      platformAddress: params.platformAddress,
      releaseSigner: params.platformAddress,
      disputeResolver: params.platformAddress,
      receiver: params.originatorAddress,
    },
    amount: params.amountHuman,
    platformFee: params.platformFeePercent,
    milestones: [
      { description: DELIVERY_MILESTONE_DESCRIPTION },
    ],
    trustline: params.trustline,
  };
}

/** Builds the USDC testnet trustline (symbol + issuer) used by InvoFi flows. */
export function usdcTestnetTrustline(issuerAddress: string): EscrowTrustline {
  return { symbol: 'USDC', address: issuerAddress };
}

// ── Client factory ───────────────────────────────────────────────────────────

const DEFAULT_BASE_URLS: Record<TrustlessWorkEnv, string> = {
  testnet: 'https://dev.api.trustlesswork.com',
  mainnet: 'https://api.trustlesswork.com',
};

/**
 * Creates a typed Trustless Work client. Stateless apart from config —
 * create one per environment and reuse it.
 */
export function createTrustlessWorkClient(cfg: TrustlessWorkConfig) {
  const env: TrustlessWorkEnv = cfg.env ?? 'testnet';
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URLS[env]).replace(/\/+$/, '');
  const fetchImpl: FetchLike = cfg.fetchImpl ?? ((url, init) => globalThis.fetch(url, init) as unknown as Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>);

  function headers(): Record<string, string> {
    if (!cfg.apiKey) throw new TrustlessWorkError({ status: 401, code: 'MISSING_API_KEY', title: 'Missing API key', detail: 'TrustlessWorkConfig.apiKey is empty — request one via the TW Backoffice.' }, 401);
    return { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey };
  }

  /** Normalizes any TW error body (v1 NestJS or v2 Problem Details). */
  function toError(data: Record<string, unknown> | null, status: number): TrustlessWorkError {
    return new TrustlessWorkError((data ?? { status }) as Record<string, unknown>, status);
  }

  /** POST a build endpoint; extracts `unsignedTransaction` from the response. */
  async function build(path: string, body: unknown): Promise<UnsignedTransaction> {
    const res = await fetchImpl(`${baseUrl}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw toError(data, res.status);
    const unsignedXdr = typeof data?.unsignedTransaction === 'string'
      ? data.unsignedTransaction
      : (typeof data?.unsignedXdr === 'string' ? data.unsignedXdr : undefined);
    if (!unsignedXdr) {
      throw new TrustlessWorkError({ status: res.status, code: 'MALFORMED_RESPONSE', title: 'Unexpected response', detail: `Expected unsignedTransaction from ${path}.` }, res.status);
    }
    return { unsignedXdr };
  }

  /** Signs an unsigned XDR with the configured wallet callback. */
  async function sign(unsignedXdr: string): Promise<string> {
    return cfg.signTransaction(unsignedXdr, cfg.networkPassphrase);
  }

  /** Submits a signed XDR through TW's helper endpoint. */
  async function submit(signedXdr: string): Promise<SendTransactionResult> {
    const res = await fetchImpl(`${baseUrl}/helper/send-transaction`, { method: 'POST', headers: headers(), body: JSON.stringify({ signedXdr }) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw toError(data, res.status);
    return { success: true, raw: data };
  }

  return {
    /** Base URL in use (exposed for logging/tests). */
    baseUrl,
    env,

    // ── Build endpoints (return unsigned XDR) ──────────────────────────────

    /** Build the deploy tx for a single-release escrow. */
    buildDeploy(payload: DeployEscrowPayload): Promise<UnsignedTransaction> {
      return build('/deployer/single-release', payload);
    },

    /** Build the fund tx moving `amount` human units into the escrow. */
    buildFund(contractId: string, signer: string, amount: number): Promise<UnsignedTransaction> {
      return build('/escrow/single-release/fund-escrow', { contractId, signer, amount });
    },

    /** Build the release tx paying the escrow out to the receiver. */
    buildRelease(contractId: string, releaseSigner: string): Promise<UnsignedTransaction> {
      return build('/escrow/single-release/release-funds', { contractId, releaseSigner });
    },

    /**
     * Build the tx approving a milestone (the approver role signs this —
     * on InvoFi disbursements that is the platform).
     */
    buildApproveMilestone(contractId: string, milestoneIndex: number, approver: string): Promise<UnsignedTransaction> {
      return build('/escrow/single-release/approve-milestone', { contractId, milestoneIndex: String(milestoneIndex), approver });
    },

    /**
     * Build the tx changing a milestone's status (the service provider —
     * on InvoFi disbursements the originator — signs this).
     */
    buildChangeMilestoneStatus(contractId: string, milestoneIndex: number, serviceProvider: string, newStatus: string, newEvidence = ''): Promise<UnsignedTransaction> {
      return build('/escrow/single-release/change-milestone-status', { contractId, milestoneIndex: String(milestoneIndex), serviceProvider, newStatus, newEvidence });
    },

    // ── Sign + submit helpers ──────────────────────────────────────────────

    sign,

    submit,

    /**
     * One-shot convenience: build → sign → submit. Use the granular methods
     * instead when the UI must show the user the transaction before signing
     * (which the frontend usually should).
     */
    async buildSignSubmit(buildPromise: Promise<UnsignedTransaction>): Promise<{ built: UnsignedTransaction; submitted: SendTransactionResult }> {
      const built = await buildPromise;
      const signedXdr = await sign(built.unsignedXdr);
      const submitted = await submit(signedXdr);
      return { built, submitted };
    },

    // ── Reads (plain GET against TW's read model) ──────────────────────────

    /**
     * Fetch escrows by contract ids. Returns the raw read-model rows
     * (TW's `/helper/get-escrow-by-contract-ids`).
     */
    async getEscrowsByContractIds(contractIds: string[]): Promise<Record<string, unknown>[]> {
      const qs = contractIds.map(id => `contractIds=${encodeURIComponent(id)}`).join('&');
      const res = await fetchImpl(`${baseUrl}/helper/get-escrow-by-contract-ids?${qs}`, { method: 'GET', headers: headers() });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw toError((data ?? {}) as Record<string, unknown>, res.status);
      return unwrapRows(data);
    },

    /**
     * Fetch the authoritative read-model snapshot for one escrow.
     * Throws `TrustlessWorkError` with code `ESCROW_NOT_FOUND` when absent.
     */
    async getEscrow(contractId: string): Promise<Record<string, unknown>> {
      const rows = await this.getEscrowsByContractIds([contractId]);
      const row = rows.find(r => (r as { contractId?: string }).contractId === contractId) ?? rows[0];
      if (!row) {
        throw new TrustlessWorkError({ status: 404, code: 'ESCROW_NOT_FOUND', title: 'Escrow not found', detail: `No escrow read-model row for ${contractId}.` }, 404);
      }
      return row;
    },

    /**
     * Fetch escrows where `address` is the transaction signer (the wallet
     * that deployed them) — TW's `/helper/get-escrows-by-signer`.
     */
    async getEscrowsBySigner(signer: string): Promise<Record<string, unknown>[]> {
      const res = await fetchImpl(`${baseUrl}/helper/get-escrows-by-signer?signer=${encodeURIComponent(signer)}`, { method: 'GET', headers: headers() });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw toError((data ?? {}) as Record<string, unknown>, res.status);
      return unwrapRows(data);
    },

    /**
     * Finds an InvoFi disbursement escrow by its engagementId among the
     * escrows signed by `signer`. TW's deploy build does NOT return the
     * escrow's future contract id, so callers resolve it this way right
     * after the deploy transaction lands. Returns null when not found yet
     * (the read model may lag the chain by a few seconds — retry upstream).
     */
    async findEscrowByEngagementId(signer: string, engagementId: string): Promise<Record<string, unknown> | null> {
      const rows = await this.getEscrowsBySigner(signer);
      const hit = rows.find(r => (r as { engagementId?: string }).engagementId === engagementId);
      return hit ?? null;
    },

    // ── InvoFi domain helpers ──────────────────────────────────────────────

    /**
     * Builds the deploy tx for an InvoFi disbursement escrow (role mapping
     * per mapToDeployPayload). Resolve the escrow's contract id afterwards
     * with findEscrowByEngagementId once the tx has landed.
     */
    buildDisbursementEscrow(params: DisbursementEscrowParams): Promise<UnsignedTransaction> {
      return build('/deployer/single-release', mapToDeployPayload(params));
    },
  };
}

/** Unwraps TW read-model responses: array, `{data: [...]}`, or `{escrows: [...]}`. */
function unwrapRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
    if (Array.isArray(obj.escrows)) return obj.escrows as Record<string, unknown>[];
    if (obj.data && typeof obj.data === 'object') return [obj.data as Record<string, unknown>];
  }
  return [];
}

export type TrustlessWorkClient = ReturnType<typeof createTrustlessWorkClient>;
