import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetRateLimitsForTests } from '@/lib/rate-limit';

// The wallet-first auth migration (#376) removed the Supabase session
// refresh from middleware: database sessions cannot be resolved at the edge
// (ADR-0008). The middleware now only rate-limits and negotiates the locale.

import { middleware } from './middleware';

function makeRequest(path: string, ip = '203.0.113.5'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'accept-language': 'en' },
  });
}

describe('middleware rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetRateLimitsForTests();
  });

  it('allows legitimate auth requests through', async () => {
    const request = makeRequest('/api/auth/sep10/challenge');
    const response = await middleware(request);
    expect(response.status).toBe(200);
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
  });

  it('throttles the Auth.js credentials callback path', async () => {
    const request = makeRequest('/api/auth/callback/sep10');
    for (let i = 0; i < 10; i++) {
      await middleware(request);
    }
    const blocked = await middleware(request);
    expect(blocked.status).toBe(429);
  });

  it('throttles the legacy verify path', async () => {
    const request = makeRequest('/api/auth/sep10/verify');
    for (let i = 0; i < 10; i++) {
      await middleware(request);
    }
    expect((await middleware(request)).status).toBe(429);
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
  });

  it('writes the locale cookie on a first visit and never overwrites an existing choice', async () => {
    const first = await middleware(makeRequest('/'));
    expect(first.cookies.get('INVOFI_LOCALE')?.value).toBe('en');

    // A reader who already chose a language keeps their choice: the response
    // must not carry a new Set-Cookie for the locale.
    const repeated = new NextRequest('http://localhost/', {
      headers: { 'accept-language': 'ar' },
    });
    repeated.cookies.set('INVOFI_LOCALE', 'fr');
    const second = await middleware(repeated);
    expect(second.cookies.get('INVOFI_LOCALE')?.value).toBeUndefined();
  });
});
