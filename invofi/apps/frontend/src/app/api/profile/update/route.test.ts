// Node environment — route handlers + mocked auth/pg modules.
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
  updateAuthSession: vi.fn(),
}));

vi.mock('@/lib/auth/profile', () => ({
  updateProfileDisplay: vi.fn(),
  getProfileByWallet: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { auth, updateAuthSession } from '@/lib/auth/config';
import { getProfileByWallet, updateProfileDisplay } from '@/lib/auth/profile';
import { checkRateLimit } from '@/lib/rate-limit';
import { PATCH } from './route';

const authMock = vi.mocked(auth);
const updateSessionMock = vi.mocked(updateAuthSession);
const updateMock = vi.mocked(updateProfileDisplay);
const getProfileMock = vi.mocked(getProfileByWallet);
const rateLimitMock = vi.mocked(checkRateLimit);

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/profile/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
  authMock.mockResolvedValue({
    user: { id: 'u1', walletAddress: 'GWA' },
    expires: '9999-01-01T00:00:00Z',
  } as never);
  getProfileMock.mockResolvedValue({
    id: 'u1',
    username: 'ada',
    role: 'lender',
    display_name: 'Ada L',
  });
});

describe('PATCH /api/profile/update', () => {
  it('updates the display name and returns the authoritative row', async () => {
    const res = await PATCH(req({ displayName: 'Ada Lovelace' }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith('u1', { displayName: 'Ada Lovelace', role: undefined });
    const body = await res.json();
    expect(body).toEqual({ displayName: 'Ada L', role: 'lender' });
    // JWT strategy (ADR-0008 Amendment 002): the token extras must be
    // refreshed so the session reflects the new display name immediately.
    expect(updateSessionMock).toHaveBeenCalledWith({
      user: { name: 'Ada L', role: 'lender' },
    });
  });

  it('switches the role', async () => {
    const res = await PATCH(req({ role: 'business' }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith('u1', { displayName: undefined, role: 'business' });
  });

  it('rejects username changes — immutability enforced server-side', async () => {
    const res = await PATCH(req({ username: 'new_handle', displayName: 'X' }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect((await res.json()).error).toMatch(/permanent/i);
  });

  it('rejects an invalid role', async () => {
    const res = await PATCH(req({ role: 'admin' }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized display name', async () => {
    const res = await PATCH(req({ displayName: 'x'.repeat(81) }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('accepts an empty displayName to clear the name', async () => {
    const res = await PATCH(req({ displayName: '' }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith('u1', { displayName: '', role: undefined });
  });

  it('rejects an empty patch', async () => {
    const res = await PATCH(req({}));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    authMock.mockResolvedValue(null as never);
    const res = await PATCH(req({ displayName: 'X' }));
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rate-limits before touching the session', async () => {
    rateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await PATCH(req({ displayName: 'X' }));
    expect(res.status).toBe(429);
    expect(authMock).not.toHaveBeenCalled();
  });

  it('maps storage failures to 500 without leaking details', async () => {
    updateMock.mockRejectedValueOnce(new Error('connection refused'));
    const res = await PATCH(req({ displayName: 'X' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('connection refused');
  });

  it('rejects malformed JSON', async () => {
    const bad = new NextRequest('http://localhost/api/profile/update', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(bad);
    expect(res.status).toBe(400);
  });
});
