import { NextRequest, NextResponse } from 'next/server';
import {
  createTrustlessWorkClient,
  mapToDeployPayload,
  disbursementEngagementId,
  TrustlessWorkError,
  type DisbursementEscrowParams,
  type TrustlessWorkEnv,
} from '@invofi/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/escrow/[action]  +  GET /api/escrow/status
 *
 * Server-side proxy for the Trustless Work API. The `x-api-key` lives in a
 * server-only env var (TW_ESCROW_API_KEY) and never reaches the browser;
 * this route keeps the key out of the client bundle while allowing the
 * frontend to call build/submit endpoints on behalf of the connected wallet.
 *
 * Supported actions (the live v1 single-release loop, plus reads):
 *   deploy  — build the deploy tx for a disbursement escrow (InvoFi role mapping)
 *   fund    — build the fund tx
 *   release — build the release tx
 *   submit  — forward a signed XDR to TW's /helper/send-transaction
 *   resolve — find an escrow's contract id by engagementId (signer read)
 *   status  — GET the read-model snapshot for one escrow
 *
 * The proxy is stateless: it never stores escrow state, only relays. All
 * authorization remains with the wallet signatures on the XDR itself.
 */

const ACTION_SCHEMA = {
  deploy: ['invoiceId', 'offerId', 'amountHuman', 'lenderAddress', 'originatorAddress', 'platformAddress', 'platformFeePercent', 'trustline'],
  fund: ['contractId', 'signer', 'amount'],
  release: ['contractId', 'releaseSigner'],
  /** Platform approves the delivery milestone (builds the TW tx for the platform wallet to sign). */
  approve: ['contractId', 'milestoneIndex', 'approver'],
  /** Originator marks the delivery milestone completed with evidence (build for the originator's wallet). */
  'change-status': ['contractId', 'milestoneIndex', 'serviceProvider', 'newStatus'],
  submit: ['signedXdr'],
  resolve: ['invoiceId', 'offerId', 'signer'],
} as const;

type Action = keyof typeof ACTION_SCHEMA;

function isAction(value: string): value is Action {
  return value in ACTION_SCHEMA;
}

function clientFor(env: TrustlessWorkEnv, baseUrl?: string) {
  const apiKey = process.env.TW_ESCROW_API_KEY ?? '';
  if (!apiKey) {
    throw new TrustlessWorkError({
      status: 503,
      code: 'ESCROW_NOT_CONFIGURED',
      title: 'Escrow proxy not configured',
      detail: 'TW_ESCROW_API_KEY is not set on the server — the escrow rail is disabled.',
    }, 503);
  }
  return createTrustlessWorkClient({
    env,
    ...(baseUrl ? { baseUrl } : {}),
    apiKey,
    networkPassphrase: env === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015',
    // The proxy never signs: signing happens in the user's wallet. This
    // callback only exists to satisfy the config type and MUST NOT be
    // reachable — build endpoints return unsigned XDR by design.
    signTransaction: async () => {
      throw new TrustlessWorkError({
        status: 500,
        code: 'PROXY_CANNOT_SIGN',
        title: 'The escrow proxy must never sign transactions',
        detail: 'Signing happens client-side with the user wallet. This is a server misconfiguration.',
      }, 500);
    },
  });
}

function parseEnv(body: Record<string, unknown>): TrustlessWorkEnv {
  return body.env === 'mainnet' ? 'mainnet' : 'testnet';
}

function baseUrlFor(body: Record<string, unknown>): string | undefined {
  const v = body.baseUrl;
  if (typeof v !== 'string' || v.length === 0) return undefined;
  // Only allow https URLs to prevent SSRF via the baseUrl override.
  if (!/^https:\/\//i.test(v)) return undefined;
  return v;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action: rawAction } = await params;
  const action = rawAction === 'status' ? undefined : rawAction;

  if (!action || !isAction(action)) {
    return NextResponse.json(
      { code: 'UNKNOWN_ACTION', detail: `Unknown escrow action: ${rawAction}` },
      { status: 404 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ code: 'BAD_JSON', detail: 'Request body must be JSON.' }, { status: 400 });
  }

  const missing = ACTION_SCHEMA[action].filter(k => body[k] === undefined || body[k] === null || body[k] === '');
  if (missing.length > 0) {
    return NextResponse.json(
      { code: 'MISSING_FIELDS', detail: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const client = clientFor(parseEnv(body), baseUrlFor(body));

    switch (action) {
      case 'deploy': {
        const escrowParams: DisbursementEscrowParams = {
          invoiceId: String(body.invoiceId),
          offerId: String(body.offerId),
          amountHuman: Number(body.amountHuman),
          lenderAddress: String(body.lenderAddress),
          originatorAddress: String(body.originatorAddress),
          platformAddress: String(body.platformAddress),
          platformFeePercent: Number(body.platformFeePercent),
          trustline: body.trustline as DisbursementEscrowParams['trustline'],
          ...(body.receiverMemo !== undefined ? { receiverMemo: Number(body.receiverMemo) } : {}),
        };
        if (!Number.isFinite(escrowParams.amountHuman) || escrowParams.amountHuman <= 0) {
          return NextResponse.json({ code: 'INVALID_AMOUNT', detail: 'amountHuman must be a positive number.' }, { status: 400 });
        }
        const built = await client.buildDisbursementEscrow(escrowParams);
        return NextResponse.json(built);
      }
      case 'fund': {
        const built = await client.buildFund(String(body.contractId), String(body.signer), Number(body.amount));
        return NextResponse.json(built);
      }
      case 'release': {
        const built = await client.buildRelease(String(body.contractId), String(body.releaseSigner));
        return NextResponse.json(built);
      }
      case 'approve': {
        const built = await client.buildApproveMilestone(
          String(body.contractId),
          Number(body.milestoneIndex),
          String(body.approver),
        );
        return NextResponse.json(built);
      }
      case 'change-status': {
        const built = await client.buildChangeMilestoneStatus(
          String(body.contractId),
          Number(body.milestoneIndex),
          String(body.serviceProvider),
          String(body.newStatus),
          typeof body.newEvidence === 'string' ? body.newEvidence : '',
        );
        return NextResponse.json(built);
      }
      case 'submit': {
        const result = await client.submit(String(body.signedXdr));
        return NextResponse.json(result.raw);
      }
      case 'resolve': {
        const signer = String(body.signer);
        // Delegate to the SDK's backoff retry: TW's read model trails the
        // chain by seconds after a deploy lands, so a single lookup misses.
        // The budget here is deliberately SMALL — this route runs in a
        // serverless function with a hard wall-clock limit; the frontend's
        // resolveDisbursementEscrow loop provides the outer retries.
        const contractId = await client.resolveContractId(
          signer,
          disbursementEngagementId(String(body.invoiceId), String(body.offerId)),
          { attempts: 3, backoffBaseMs: 1_000, maxBackoffMs: 2_000 },
        );
        return NextResponse.json({ contractId });
      }
    }
  } catch (err) {
    if (err instanceof TrustlessWorkError) {
      return NextResponse.json(
        { code: err.code, detail: err.detail, status: err.status, ...(err.traceId ? { traceId: err.traceId } : {}) },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    return NextResponse.json(
      { code: 'PROXY_INTERNAL', detail: err instanceof Error ? err.message : 'Unknown proxy error' },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (action !== 'status') {
    return NextResponse.json({ code: 'UNKNOWN_ACTION', detail: `Unknown escrow action: ${action}` }, { status: 404 });
  }
  const contractId = request.nextUrl.searchParams.get('contractId');
  if (!contractId) {
    return NextResponse.json({ code: 'MISSING_FIELDS', detail: 'Missing required query param: contractId' }, { status: 400 });
  }
  try {
    const client = clientFor('testnet');
    const snapshot = await client.getEscrow(contractId);
    return NextResponse.json({ data: snapshot });
  } catch (err) {
    if (err instanceof TrustlessWorkError) {
      return NextResponse.json({ code: err.code, detail: err.detail, status: err.status }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    return NextResponse.json({ code: 'PROXY_INTERNAL', detail: err instanceof Error ? err.message : 'Unknown proxy error' }, { status: 500 });
  }
}
