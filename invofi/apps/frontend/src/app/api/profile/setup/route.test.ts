// Node environment — route handler + mocked config modules.
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
  updateAuthSession: vi.fn(),
}));

// The authjs gate is a pure env read — flip it per test.
vi.mock('@/lib/auth/enabled', () => ({
  isAuthjsBackendEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/auth/profile', () => ({
  claimUsername: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { isAuthjsBackendEnabled } from '@/lib/auth/enabled';
import { POST } from './route';

const enabledMock = vi.mocked(isAuthjsBackendEnabled);

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/profile/setup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  enabledMock.mockReturnValue(true);
});

describe('POST /api/profile/setup — authjs backend gate', () => {
  it('answers 401 (not 500) when the authjs backend is disabled — legacy hosts', async () => {
    enabledMock.mockReturnValue(false);
    const res = await POST(req({ username: 'ada', role: 'lender' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/wallet/i);
  });
});
