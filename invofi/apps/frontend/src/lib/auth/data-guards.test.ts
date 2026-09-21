// Node environment — mocked auth() + pure guards; no DB.
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// auth() is the only sideful dependency of authz.ts — mock it so the
// requireUser/requireRole gates are exercised without NextAuth wiring.
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import {
  AuthzError,
  assertSameUser,
  assertSameWallet,
  getOptionalIdentity,
  handleAuthz,
  requireRole,
  requireUser,
} from '@/lib/auth/authz';
import {
  assertMessageParticipant,
  assertMessageSender,
  assertOwnApproval,
  assertOwnNotification,
  assertPendingTxInitiator,
  assertPendingTxMutable,
} from '@/lib/auth/data-guards';

const mockedAuth = vi.mocked(auth);

// ── fixtures ─────────────────────────────────────────────────────────────────

const ALICE = {
  userId: '11111111-1111-4111-8111-111111111111',
  walletAddress: 'GALICE1111111111111111111111111111111111111111111111111111111111',
  role: 'lender' as const,
};
const BOB = {
  userId: '22222222-2222-4222-8222-222222222222',
  walletAddress: 'GBOB22222222222222222222222222222222222222222222222222222222222222',
  role: 'business' as const,
};
const ADMIN = {
  userId: '33333333-3333-4333-8333-333333333333',
  walletAddress: 'GADMIN333333333333333333333333333333333333333333333333333333333333',
  role: 'admin' as const,
};

const expectAuthz = (fn: () => void, status: number, code: string) => {
  try {
    fn();
    expect.fail(`expected AuthzError ${status}/${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(AuthzError);
    const e = err as AuthzError;
    expect(e.status).toBe(status);
    expect(e.code).toBe(code);
  }
};

beforeEach(() => {
  mockedAuth.mockReset();
});

// ── requireUser: the unauthenticated case (every table's first gate) ─────────

describe('requireUser', () => {
  it('rejects an unauthenticated request with 401', async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(requireUser()).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
  });
  it('rejects a session without a proven wallet with 401', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'u1' } } as never);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });
  it('returns the identity for a wallet session', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: ALICE.userId, walletAddress: ALICE.walletAddress, role: 'lender' },
    } as never);
    await expect(requireUser()).resolves.toEqual(ALICE);
  });
});

// ── requireRole: the reminder_configs admin gate (DoD table) ────────────────

describe('requireRole (reminder_configs gate)', () => {
  it('admin passes', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: ADMIN.userId, walletAddress: ADMIN.walletAddress, role: 'admin' },
    } as never);
    await expect(requireRole('admin')).resolves.toMatchObject({ userId: ADMIN.userId });
  });
  it('non-admin is rejected with 403', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: ALICE.userId, walletAddress: ALICE.walletAddress, role: 'lender' },
    } as never);
    await expect(requireRole('admin')).rejects.toMatchObject({ status: 403, code: 'forbidden_role' });
  });
  it('unauthenticated is rejected with 401 (not 403)', async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(requireRole('admin')).rejects.toMatchObject({ status: 401 });
  });
});

// ── party checks ─────────────────────────────────────────────────────────────

describe('assertSameWallet / assertSameUser', () => {
  it('same wallet passes; different wallet throws 403', () => {
    expect(() => assertSameWallet(ALICE.walletAddress, ALICE)).not.toThrow();
    expectAuthz(() => assertSameWallet(BOB.walletAddress, ALICE), 403, 'forbidden_party');
  });
  it('same user id passes; different id throws 403', () => {
    expect(() => assertSameUser(ALICE.userId, ALICE),).not.toThrow();
    expectAuthz(() => assertSameUser(BOB.userId, ALICE), 403, 'forbidden_party');
  });
});

// ── notifications: owner-only (DoD table) ────────────────────────────────────

describe('assertOwnNotification', () => {
  it('allows the owner', () => {
    expect(() => assertOwnNotification(ALICE, { user_id: ALICE.userId })).not.toThrow();
  });
  it('rejects another user (403 forbidden_party)', () => {
    expectAuthz(() => assertOwnNotification(ALICE, { user_id: BOB.userId }), 403, 'forbidden_party');
  });
});

// ── encrypted_messages: sender-insert, participant-read (DoD table) ─────────

describe('encrypted_messages guards', () => {
  it('sender may insert under own wallet', () => {
    expect(() => assertMessageSender(ALICE, { senderAddress: ALICE.walletAddress })).not.toThrow();
  });
  it('insert under another wallet is rejected', () => {
    expectAuthz(
      () => assertMessageSender(ALICE, { senderAddress: BOB.walletAddress }),
      403,
      'forbidden_party',
    );
  });
  it('either participant may read', () => {
    expect(() =>
      assertMessageParticipant(BOB, { senderAddress: ALICE.walletAddress, recipientAddress: BOB.walletAddress }),
    ).not.toThrow();
    expect(() =>
      assertMessageParticipant(ALICE, { senderAddress: ALICE.walletAddress, recipientAddress: BOB.walletAddress }),
    ).not.toThrow();
  });
  it('a third party gets 404 — no oracle for probing threads', () => {
    expectAuthz(
      () =>
        assertMessageParticipant(ADMIN, { senderAddress: ALICE.walletAddress, recipientAddress: BOB.walletAddress }),
      404,
      'not_found',
    );
  });
});

// ── pending_transactions / approvals: initiator + approvers (DoD table) ─────

describe('multisig guards', () => {
  const TX = { initiatorId: ALICE.userId };

  it('initiator may create and update', () => {
    expect(() => assertPendingTxInitiator(ALICE, TX)).not.toThrow();
    expect(() => assertPendingTxMutable(ALICE, TX, [])).not.toThrow();
  });
  it('a recorded approver may update', () => {
    expect(() => assertPendingTxMutable(BOB, TX, [BOB.userId])).not.toThrow();
  });
  it('a non-approver cannot update', () => {
    expectAuthz(() => assertPendingTxMutable(BOB, TX, []), 403, 'forbidden_party');
  });
  it('creating under another initiator is rejected', () => {
    expectAuthz(() => assertPendingTxInitiator(BOB, TX), 403, 'forbidden_party');
  });
  it('approval must be recorded under the approver id', () => {
    expect(() => assertOwnApproval(BOB, { approverId: BOB.userId })).not.toThrow();
    expectAuthz(() => assertOwnApproval(BOB, { approverId: ALICE.userId }), 403, 'forbidden_party');
  });
});

// ── route-handler adapter ────────────────────────────────────────────────────

describe('handleAuthz', () => {
  it('maps AuthzError to a JSON response with the right status', async () => {
    const res = await handleAuthz(async () => {
      throw new AuthzError(403, 'forbidden_party', 'nope');
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden_party', message: 'nope' });
  });
  it('rethrows non-authz errors', async () => {
    await expect(
      handleAuthz(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
  it('passes successful responses through', async () => {
    const ok = Response.json({ ok: true });
    await expect(handleAuthz(async () => ok)).resolves.toBe(ok);
  });
});

// ── optional identity ────────────────────────────────────────────────────────

describe('getOptionalIdentity', () => {
  it('returns null when unauthenticated instead of throwing', async () => {
    mockedAuth.mockResolvedValue(null as never);
    await expect(getOptionalIdentity()).resolves.toBeNull();
  });
});

