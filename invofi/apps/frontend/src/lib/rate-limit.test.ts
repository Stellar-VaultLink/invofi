import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { checkRateLimit, getClientIp, __resetRateLimitsForTests } from './rate-limit';

afterEach(() => {
  __resetRateLimitsForTests();
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows requests up to the limit within the window', () => {
    const key = 'test:allow';
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, { limit: 5, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests once the limit is exceeded', () => {
    const key = 'test:block';
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, { limit: 5, windowMs: 60_000 });
    }
    const blocked = checkRateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('tracks remaining count correctly as requests are made', () => {
    const key = 'test:remaining';
    const first = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(first.remaining).toBe(2);
    const second = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(second.remaining).toBe(1);
    const third = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(third.remaining).toBe(0);
  });

  it('resets the count once the window has elapsed', () => {
    vi.useFakeTimers();
    const key = 'test:reset';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, { limit: 3, windowMs: 1_000 });
    }
    expect(checkRateLimit(key, { limit: 3, windowMs: 1_000 }).allowed).toBe(false);

    vi.advanceTimersByTime(1_001);

    const afterWindow = checkRateLimit(key, { limit: 3, windowMs: 1_000 });
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(2);
  });

  it('tracks separate keys independently', () => {
    const a = checkRateLimit('test:a', { limit: 1, windowMs: 60_000 });
    const b = checkRateLimit('test:b', { limit: 1, windowMs: 60_000 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(checkRateLimit('test:a', { limit: 1, windowMs: 60_000 }).allowed).toBe(false);
  });

  it('uses default limit and window when options are omitted', () => {
    const key = 'test:defaults';
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it('rejects a brand-new key once the active-key cap is reached, without disturbing existing keys', () => {
    const opts = { limit: 10, windowMs: 60_000, maxTrackedKeys: 2 };
    expect(checkRateLimit('cap:a', opts).allowed).toBe(true);
    expect(checkRateLimit('cap:b', opts).allowed).toBe(true);

    // Table is full of active keys — a third, never-seen key is rejected
    // rather than evicting 'a' or 'b' or growing past the cap.
    const rejected = checkRateLimit('cap:c', opts);
    expect(rejected.allowed).toBe(false);

    // Existing keys are unaffected by the cap and keep working normally.
    const a = checkRateLimit('cap:a', opts);
    expect(a.allowed).toBe(true);
    expect(a.remaining).toBe(8);
  });

  it('reclaims capacity from expired buckets before rejecting a new key', () => {
    vi.useFakeTimers();
    const opts = { limit: 10, windowMs: 1_000, maxTrackedKeys: 1 };
    expect(checkRateLimit('sweep:a', opts).allowed).toBe(true);

    vi.advanceTimersByTime(1_001);

    // 'sweep:a' has since expired — the cap check sweeps it out first,
    // making room for the new key instead of rejecting it outright.
    const result = checkRateLimit('sweep:b', opts);
    expect(result.allowed).toBe(true);
  });

  it('keeps rejecting new keys past the cap even as different unseen keys are tried', () => {
    const opts = { limit: 10, windowMs: 60_000, maxTrackedKeys: 1 };
    expect(checkRateLimit('flood:seed', opts).allowed).toBe(true);
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(`flood:${i}`, opts).allowed).toBe(false);
    }
    // The map never grew past the cap despite 20 distinct rejected keys.
    expect(checkRateLimit('flood:seed', opts).allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  function makeRequest(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost/api/auth/sep10/challenge', {
      method: 'POST',
      headers,
    });
  }

  it('reads the first address from x-forwarded-for', () => {
    const request = makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(getClientIp(request)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const request = makeRequest({ 'x-real-ip': '198.51.100.7' });
    expect(getClientIp(request)).toBe('198.51.100.7');
  });

  it('falls back to a constant when no proxy headers are present', () => {
    const request = makeRequest({});
    expect(getClientIp(request)).toBe('unknown');
  });
});
