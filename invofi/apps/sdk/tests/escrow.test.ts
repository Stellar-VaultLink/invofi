import { describe, it, expect, vi } from 'vitest';
import {
  createTrustlessWorkClient,
  mapToDeployPayload,
  usdcTestnetTrustline,
  disbursementEngagementId,
  TrustlessWorkError,
  DELIVERY_MILESTONE_DESCRIPTION,
  type DisbursementEscrowParams,
  type FetchLike,
} from '../src/escrow';

const VALID_PARAMS: DisbursementEscrowParams = {
  invoiceId: 'inv_001',
  offerId: 'off_001',
  amountHuman: 1250.5,
  lenderAddress: 'GLender1111111111111111111111111111111111111111111',
  originatorAddress: 'GOrigin222222222222222222222222222222222222222222',
  platformAddress: 'GPlatform33333333333333333333333333333333333333333',
  platformFeePercent: 0.5,
  trustline: { symbol: 'USDC', address: 'GIssuer444444444444444444444444444444444444444444444' },
};

/** A fetch mock returning the given JSON for every request. */
function fetchOk(response: unknown, capture?: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[]): FetchLike {
  return (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (capture) capture.push({ url, init });
    return { ok: true, status: 200, json: async () => response };
  }) as unknown as FetchLike;
}

function fetchProblem(status: number, problem: unknown): FetchLike {
  return (async () => ({ ok: false, status, json: async () => problem })) as unknown as FetchLike;
}

/** Live-verified build response shape: `{ status, unsignedTransaction }`. */
const BUILD_OK = { status: 201, unsignedTransaction: 'AAAAAgAAAAAtWsgedQ==' };

describe('mapToDeployPayload — InvoFi → TW role mapping (v1, singular roles)', () => {
  it('maps the disbursement roles correctly', () => {
    const payload = mapToDeployPayload(VALID_PARAMS);
    expect(payload.signer).toBe(VALID_PARAMS.lenderAddress);
    expect(payload.engagementId).toBe('invofi-inv_001-off_001');
    // v1 roles are singular addresses.
    expect(payload.roles.receiver).toBe(VALID_PARAMS.originatorAddress);
    expect(payload.roles.serviceProvider).toBe(VALID_PARAMS.originatorAddress);
    // The platform approves/releases/resolves — an absent external lender
    // can never strand the originator's funds (ADR-0010, v1 constraint).
    expect(payload.roles.approver).toBe(VALID_PARAMS.platformAddress);
    expect(payload.roles.releaseSigner).toBe(VALID_PARAMS.platformAddress);
    expect(payload.roles.disputeResolver).toBe(VALID_PARAMS.platformAddress);
    expect(payload.roles.platformAddress).toBe(VALID_PARAMS.platformAddress);
  });

  it('attaches exactly one delivery-verification milestone', () => {
    const payload = mapToDeployPayload(VALID_PARAMS);
    expect(payload.milestones).toHaveLength(1);
    expect(payload.milestones[0].description).toBe(DELIVERY_MILESTONE_DESCRIPTION);
  });

  it('carries the human-readable amount and trustline through', () => {
    const payload = mapToDeployPayload(VALID_PARAMS);
    expect(payload.amount).toBe(1250.5);
    expect(payload.platformFee).toBe(0.5);
    expect(payload.trustline).toEqual(VALID_PARAMS.trustline);
  });

  it('builds a deterministic engagementId', () => {
    expect(disbursementEngagementId('inv_9', 'off_9')).toBe('invofi-inv_9-off_9');
  });

  it('usdcTestnetTrustline produces a symbol+issuer trustline', () => {
    expect(usdcTestnetTrustline('GIssuer444444444444444444444444444444444444444444444')).toEqual({
      symbol: 'USDC',
      address: 'GIssuer444444444444444444444444444444444444444444444',
    });
  });
});

describe('createTrustlessWorkClient — build/sign/submit loop (live-verified contract)', () => {
  it('sends x-api-key and posts the live deploy path with the mapped body', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'test-key-id.test-secret',
      networkPassphrase: 'Test SDF Network ; September 2015',
      signTransaction: async xdr => `signed(${xdr})`,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });

    await client.buildDisbursementEscrow(VALID_PARAMS);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://dev.api.trustlesswork.com/deployer/single-release');
    expect((calls[0].init!.headers as Record<string, string>)['x-api-key']).toBe('test-key-id.test-secret');
    const body = JSON.parse(calls[0].init!.body!);
    expect(body.signer).toBe(VALID_PARAMS.lenderAddress);
    expect(body.roles.receiver).toBe(VALID_PARAMS.originatorAddress);
    expect(body.roles.approver).toBe(VALID_PARAMS.platformAddress);
    expect(body.trustline).toEqual(VALID_PARAMS.trustline);
  });

  it('extracts unsignedTransaction from the live response shape', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK),
    });
    const built = await client.buildFund('CEscrow1', 'GFunder', 100);
    expect(built.unsignedXdr).toBe('AAAAAgAAAAAtWsgedQ==');
  });

  it('buildFund and buildRelease post the live paths with the right bodies', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });

    await client.buildFund('CEscrow1', 'GFunder', 100);
    await client.buildRelease('CEscrow1', 'GReleaser');

    expect(calls[0].url).toBe('https://dev.api.trustlesswork.com/escrow/single-release/fund-escrow');
    expect(JSON.parse(calls[0].init!.body!)).toEqual({ contractId: 'CEscrow1', signer: 'GFunder', amount: 100 });
    expect(calls[1].url).toBe('https://dev.api.trustlesswork.com/escrow/single-release/release-funds');
    expect(JSON.parse(calls[1].init!.body!)).toEqual({ contractId: 'CEscrow1', releaseSigner: 'GReleaser' });
  });

  it('buildApproveMilestone and buildChangeMilestoneStatus post string milestone indexes', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });

    await client.buildApproveMilestone('CEscrow1', 0, 'GApprover');
    await client.buildChangeMilestoneStatus('CEscrow1', 0, 'GProvider', 'completed', 'invoice PDF link');

    expect(calls[0].url).toBe('https://dev.api.trustlesswork.com/escrow/single-release/approve-milestone');
    expect(JSON.parse(calls[0].init!.body!)).toEqual({ contractId: 'CEscrow1', milestoneIndex: '0', approver: 'GApprover' });
    expect(calls[1].url).toBe('https://dev.api.trustlesswork.com/escrow/single-release/change-milestone-status');
    expect(JSON.parse(calls[1].init!.body!)).toEqual({
      contractId: 'CEscrow1', milestoneIndex: '0', serviceProvider: 'GProvider', newStatus: 'completed', newEvidence: 'invoice PDF link',
    });
  });

  it('buildSignSubmit chains build → sign → submit and returns both results', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const signSpy = vi.fn(async (xdr: string) => `SIGNED:${xdr}`);
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: signSpy,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });

    const { built, submitted } = await client.buildSignSubmit(client.buildFund('CEscrow1', 'GFunder', 10));
    expect(built.unsignedXdr).toBe('AAAAAgAAAAAtWsgedQ==');
    expect(signSpy).toHaveBeenCalledWith('AAAAAgAAAAAtWsgedQ==', 'test');
    expect(calls[1].url).toBe('https://dev.api.trustlesswork.com/helper/send-transaction');
    expect(JSON.parse(calls[1].init!.body!)).toEqual({ signedXdr: 'SIGNED:AAAAAgAAAAAtWsgedQ==' });
    expect(submitted.success).toBe(true);
  });

  it('getEscrow resolves one escrow via the by-contract-ids read model', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk([{ contractId: 'CEscrow1', amount: '100.00', engagementId: 'invofi-inv_001-off_001' }], calls),
    });
    const escrow = await client.getEscrow('CEscrow1');
    expect(escrow.contractId).toBe('CEscrow1');
    expect(calls[0].url).toContain('/helper/get-escrow-by-contract-ids?contractIds=CEscrow1');
  });

  it('getEscrow throws ESCROW_NOT_FOUND when the read model has no row', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk([]),
    });
    await expect(client.getEscrow('Cmissing')).rejects.toMatchObject({ code: 'ESCROW_NOT_FOUND', status: 404 });
  });

  it('findEscrowByEngagementId matches on the engagementId among signer escrows', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk([
        { contractId: 'COther', engagementId: 'invofi-inv_x-off_x' },
        { contractId: 'CHit', engagementId: 'invofi-inv_001-off_001' },
      ]),
    });
    const hit = await client.findEscrowByEngagementId('GLender', 'invofi-inv_001-off_001');
    expect(hit?.contractId).toBe('CHit');
    const miss = await client.findEscrowByEngagementId('GLender', 'invofi-inv_zzz-off_zzz');
    expect(miss).toBeNull();
  });
});

describe('createTrustlessWorkClient — resolveContractId (indexer-lag retry)', () => {
  /** fetch mock whose responses change per call. */
  function fetchSequence(responses: unknown[]): FetchLike {
    let call = 0;
    return (async () => {
      const body = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as FetchLike;
  }

  /** Per-test no-op delay mock (fresh each test so call counts don't leak). */
  const noDelay = () => vi.fn(async (_ms: number) => {});

  it('returns the contract id immediately when the escrow is already indexed (no waits)', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchSequence([{ escrows: [{ contractId: 'CHit', engagementId: 'invofi-inv_1-off_1' }] }]),
    });
    const delay = noDelay();
    const id = await client.resolveContractId('GLender', 'invofi-inv_1-off_1', { delayImpl: delay });
    expect(id).toBe('CHit');
    expect(delay).not.toHaveBeenCalled();
  });

  it('retries with exponential backoff (+jitter) until the indexer catches up', async () => {
    const delay = vi.fn(async (_ms: number) => {});
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchSequence([
        { escrows: [] }, // attempt 1: not indexed yet
        { escrows: [] }, // attempt 2: still lagging
        { escrows: [{ contractId: 'CLate', engagementId: 'invofi-inv_1-off_1' }] }, // attempt 3: caught up
      ]),
    });
    const id = await client.resolveContractId('GLender', 'invofi-inv_1-off_1', {
      attempts: 4,
      backoffBaseMs: 1_000,
      maxBackoffMs: 8_000,
      delayImpl: delay,
    });
    expect(id).toBe('CLate');
    expect(delay).toHaveBeenCalledTimes(2);
    // Bases 1s then 2s, each jittered ±20%.
    expect(delay.mock.calls[0][0]).toBeGreaterThanOrEqual(800);
    expect(delay.mock.calls[0][0]).toBeLessThanOrEqual(1_200);
    expect(delay.mock.calls[1][0]).toBeGreaterThanOrEqual(1_600);
    expect(delay.mock.calls[1][0]).toBeLessThanOrEqual(2_400);
  });

  it('caps a single wait at maxBackoffMs before jitter', async () => {
    const delay = vi.fn(async (_ms: number) => {});
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchSequence([{ escrows: [] }]), // always a miss
    });
    await expect(
      client.resolveContractId('GLender', 'invofi-inv_1-off_1', { attempts: 4, backoffBaseMs: 5_000, maxBackoffMs: 3_000, delayImpl: delay }),
    ).rejects.toMatchObject({ code: 'ESCROW_RESOLVE_TIMEOUT' });
    // Bases 5s, 10s, 20s all cap to 3s → jittered within [2.4s, 3.6s].
    for (const call of delay.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(2_400);
      expect(call[0]).toBeLessThanOrEqual(3_600);
    }
  });

  it('throws ESCROW_RESOLVE_TIMEOUT after exhausting the attempts', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchSequence([{ escrows: [] }]),
    });
    await expect(
      client.resolveContractId('GLender', 'invofi-inv_never-off_never', { attempts: 3, delayImpl: noDelay() }),
    ).rejects.toMatchObject({
      code: 'ESCROW_RESOLVE_TIMEOUT',
      status: 408,
      detail: expect.stringContaining('after 3 attempts'),
    });
  });

  it('does NOT retry on HTTP/auth errors — they surface immediately', async () => {
    let calls = 0;
    const fetchErr = (async () => {
      calls += 1;
      return { ok: false, status: 401, json: async () => ({ statusCode: 401, message: 'AUTH_INVALID_CREDENTIAL' }) };
    }) as unknown as FetchLike;
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'bad.key',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchErr,
    });
    // The adapter maps an untyped 401 body to TW_ERROR (detail carries the
    // API message) — the point here is that it surfaces IMMEDIATELY: one
    // fetch, no delay, no retry loop.
    await expect(
      client.resolveContractId('GLender', 'invofi-inv_1-off_1', { attempts: 5, delayImpl: noDelay() }),
    ).rejects.toMatchObject({ code: 'TW_ERROR', status: 401 });
    expect(calls).toBe(1);
  });

  it('attempts: 1 throws without any delay (single-shot mode)', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchSequence([{ escrows: [] }]),
    });
    const delay = noDelay();
    await expect(
      client.resolveContractId('GLender', 'invofi-inv_1-off_1', { attempts: 1, delayImpl: delay }),
    ).rejects.toMatchObject({ code: 'ESCROW_RESOLVE_TIMEOUT' });
    expect(delay).not.toHaveBeenCalled();
  });
});

describe('createTrustlessWorkClient — errors', () => {
  it('maps v1 NestJS-style error bodies into TrustlessWorkError', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchProblem(400, {
        statusCode: 400,
        message: "The wallet for role 'receiver' does not have the required asset to complete this operation.",
        timestamp: '2026-09-09T09:02:27.726Z',
        path: '/deployer/single-release',
      }),
    });

    await expect(client.buildDeploy(mapToDeployPayload(VALID_PARAMS))).rejects.toMatchObject({
      name: 'TrustlessWorkError',
      status: 400,
      code: 'TW_ERROR',
      detail: "The wallet for role 'receiver' does not have the required asset to complete this operation.",
    });
  });

  it('also maps v2 RFC 9457 Problem Details bodies (future-proofing)', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchProblem(422, {
        type: 'https://docs.trustlesswork.com/errors/amount-out-of-range',
        title: 'Amount out of range',
        status: 422,
        code: 'AMOUNT_OUT_OF_RANGE',
        detail: 'Amount must be greater than zero.',
        traceId: 'tr-123',
      }),
    });

    await expect(client.buildFund('C1', 'G1', -5)).rejects.toMatchObject({
      name: 'TrustlessWorkError',
      status: 422,
      code: 'AMOUNT_OUT_OF_RANGE',
      detail: 'Amount must be greater than zero.',
      traceId: 'tr-123',
    });
  });

  it('flags a malformed build response even on HTTP 200', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk({ unexpected: true }),
    });
    await expect(client.buildFund('C1', 'G1', 5)).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('throws a typed 401 when the API key is missing', async () => {
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: '',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK),
    });
    await expect(client.buildFund('C1', 'G1', 5)).rejects.toMatchObject({ code: 'MISSING_API_KEY', status: 401 });
  });

  it('TrustlessWorkError works when constructed bare (client-side guard)', () => {
    const err = new TrustlessWorkError({ status: 401, code: 'MISSING_API_KEY', title: 'Missing API key', detail: 'x' }, 401);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('MISSING_API_KEY');
  });
});

describe('environment defaults', () => {
  it('testnet defaults to the live dev host', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'testnet',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });
    await client.buildFund('C1', 'G1', 1);
    expect(calls[0].url.startsWith('https://dev.api.trustlesswork.com/')).toBe(true);
  });

  it('mainnet defaults to the production host', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'mainnet',
      apiKey: 'k.s',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });
    await client.buildFund('C1', 'G1', 1);
    expect(calls[0].url.startsWith('https://api.trustlesswork.com/')).toBe(true);
  });

  it('baseUrl override wins over the environment default', async () => {
    const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const client = createTrustlessWorkClient({
      env: 'testnet',
      baseUrl: 'https://tw.proxy.internal/',
      apiKey: 'k.s',
      networkPassphrase: 'test',
      signTransaction: async x => x,
      fetchImpl: fetchOk(BUILD_OK, calls),
    });
    await client.buildFund('C1', 'G1', 1);
    expect(calls[0].url.startsWith('https://tw.proxy.internal/')).toBe(true);
  });
});
