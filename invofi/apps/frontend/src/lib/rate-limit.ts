/**
 * Minimal in-memory, fixed-window rate limiter for API Route Handlers.
 *
 * Scoped to a single server process/instance — on a multi-instance deployment
 * each instance tracks its own counts, so the *effective* limit scales with
 * instance count. That's an accepted tradeoff for now (see PR #237 review):
 * it still stops a single client from hammering an endpoint, which is the
 * immediate risk on unthrottled auth routes.
 */
import type { NextRequest } from 'next/server';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimitOptions {
  /** Max requests allowed per window. Default: 10. */
  limit?: number;
  /** Window size in ms. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** Max distinct *active* keys tracked at once. Default: 5000. */
  maxTrackedKeys?: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

// Bound memory use: the map may never hold more than this many *active*
// (non-expired) entries at once — see the cap check in checkRateLimit.
const DEFAULT_MAX_TRACKED_KEYS = 5000;

const buckets = new Map<string, RateLimitBucket>();

function sweepExpired(now: number): void {
  for (const [trackedKey, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(trackedKey);
    }
  }
}

/**
 * Records a hit for `key` and reports whether it's within the allowed rate.
 * `key` should already include a namespace prefix (e.g. `sep10-verify:1.2.3.4`)
 * so different endpoints don't share a counter for the same client.
 *
 * Enforces `maxTrackedKeys` on *active* entries: once the table is full of
 * still-active buckets, a brand-new key is rejected (fails closed) rather
 * than evicting an existing client's bucket or growing the map unbounded.
 * Evicting to make room was considered and rejected — it would let an
 * attacker churn through the table with many distinct keys to reset other
 * clients' windows, which defeats the point of rate limiting. An
 * already-tracked key is never affected by the cap — only new keys are.
 */
export function checkRateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const now = Date.now();

  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) {
    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
  }

  // `key` is new, or its previous window has expired — either way this is a
  // fresh bucket, so it counts against the active-key cap.
  if (existing) {
    buckets.delete(key);
  }
  if (buckets.size >= maxTrackedKeys) {
    sweepExpired(now);
  }
  if (buckets.size >= maxTrackedKeys) {
    const resetAt = now + windowMs;
    return { allowed: false, remaining: 0, resetAt };
  }

  const resetAt = now + windowMs;
  buckets.set(key, { count: 1, resetAt });
  return { allowed: true, remaining: limit - 1, resetAt };
}

/** Test-only: clears all tracked buckets so tests don't leak state between runs. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
}

/**
 * Best-effort client IP for rate-limit keying. Trusts `x-forwarded-for` /
 * `x-real-ip` (set by the reverse proxy in front of the app — Vercel or
 * otherwise); falls back to a constant so requests with no proxy headers
 * still share a single (conservative) bucket instead of bypassing the limit.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const [first] = forwardedFor.split(',');
    if (first?.trim()) {
      return first.trim();
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp?.trim()) {
    return realIp.trim();
  }

  return 'unknown';
}
