import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { __resetRateLimitsForTests } from '@/lib/rate-limit';

// Mock the Supabase session refresh so the middleware test only exercises the
// rate-limiting layer, not the Supabase client.
vi.mock('@/utils/supabase/middleware', () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));

import { middleware } from './middleware';
import { updateSession } from '@/utils/supabase/middleware';

const mockedUpdateSession = vi.mocked(updateSession);

function makeRequest(path: string, ip = '203.0.113.5'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('middleware rate limiting', () => {
  beforeEach(() => {
    mockedUpdateSession.mockClear();
  });

  afterEach(() => {
    __resetRateLimitsForTests();
  });

  it('allows legitimate auth requests through to the session refresh', async () => {
    const request = makeRequest('/api/auth/sep10/challenge');
    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(mockedUpdateSession).toHaveBeenCalledTimes(1);
  });

  it('throttles a burst of requests to an auth endpoint with 429', async () => {
    const request = makeRequest('/api/auth/sep10/challenge');
    // 10 allowed, 11th blocked.
    for (let i = 0; i < 10; i++) {
      const res = await middleware(request);
      expect(res.status).toBe(200);
    }
    const blocked = await middleware(request);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    // The blocked request never reached the session refresh.
    expect(mockedUpdateSession).toHaveBeenCalledTimes(10);
  });

  it('throttles the login page path', async () => {
    const request = makeRequest('/auth/login');
    for (let i = 0; i < 10; i++) {
      await middleware(request);
    }
    const blocked = await middleware(request);
    expect(blocked.status).toBe(429);
  });

  it('throttles the register page path', async () => {
    const request = makeRequest('/auth/register');
    for (let i = 0; i < 10; i++) {
      await middleware(request);
    }
    const blocked = await middleware(request);
    expect(blocked.status).toBe(429);
  });

  it('tracks different IPs independently', async () => {
    const requestA = makeRequest('/api/auth/sep10/verify', '203.0.113.5');
    const requestB = makeRequest('/api/auth/sep10/verify', '198.51.100.7');
    for (let i = 0; i < 10; i++) {
      await middleware(requestA);
      await middleware(requestB);
    }
    // Both are at the limit; the next from either is blocked.
    expect((await middleware(requestA)).status).toBe(429);
    expect((await middleware(requestB)).status).toBe(429);
  });

  it('does not rate-limit non-auth paths', async () => {
    const request = makeRequest('/dashboard');
    for (let i = 0; i < 25; i++) {
      const res = await middleware(request);
      expect(res.status).toBe(200);
    }
    expect(mockedUpdateSession).toHaveBeenCalledTimes(25);
  });
});
