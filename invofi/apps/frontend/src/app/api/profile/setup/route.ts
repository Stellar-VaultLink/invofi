import { NextRequest, NextResponse } from 'next/server';

import { auth, updateAuthSession } from '@/lib/auth/config';
import { isAuthjsBackendEnabled } from '@/lib/auth/enabled';
import {
  claimUsername,
  type SetupRole,
} from '@/lib/auth/profile';
import { validateUsername } from '@/lib/auth/username';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * POST /api/profile/setup — the one-time profile-setup step (issue #380,
 * ADR-0008 Amendment 001).
 *
 * Body: `{ username: string, role: 'business' | 'lender', displayName?: string }`
 *
 * Session-gated (wallet-first Auth.js session), idempotent-safe by design:
 * the username can only ever be claimed once (the UPDATE matches
 * `username is null`, and the partial unique index arbitrates races).
 * `displayName` is required when role = 'business' — it is the business name
 * shown across the marketplace.
 */
export async function POST(req: NextRequest) {
  // Backend gate: on legacy-Supabase deployments there is no Auth.js session
  // (and auth() would throw MissingSecret) — answer 401 like any other
  // unauthenticated request instead of 500.
  if (!isAuthjsBackendEnabled()) {
    return NextResponse.json({ error: 'Sign in with your wallet first.' }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(`profile-setup:${ip}`, { limit: RATE_LIMIT, windowMs: RATE_LIMIT_WINDOW_MS }).allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 },
    );
  }

  // Session gate: only a proven wallet may provision its profile.
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Sign in with your wallet first.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const { username, role, displayName } = (body ?? {}) as {
    username?: unknown;
    role?: unknown;
    displayName?: unknown;
  };

  if (role !== 'business' && role !== 'lender') {
    return NextResponse.json(
      { error: 'Choose whether you are joining as a business or a lender.' },
      { status: 400 },
    );
  }

  const check = validateUsername(username);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // Business name is mandatory for business accounts (the marketplace shows it
  // as the invoice issuer); lenders may leave it null and keep the handle.
  let name: string | null = null;
  if (typeof displayName === 'string' && displayName.trim().length > 0) {
    name = displayName.trim().slice(0, 80);
  } else if (role === 'business') {
    return NextResponse.json(
      { error: 'Business accounts need a business name.' },
      { status: 400 },
    );
  }

  try {
    const result = await claimUsername(userId, check.username, role as SetupRole, name);
    if (!result.ok) {
      const message =
        result.reason === 'taken'
          ? 'That username is already taken.'
          : 'Your profile is already set up — usernames cannot be changed.';
      return NextResponse.json({ error: message }, { status: 409 });
    }
  } catch (err) {
    console.error('profile/setup failed:', err);
    return NextResponse.json(
      { error: 'Could not save your profile. Please try again.' },
      { status: 500 },
    );
  }

  // Refresh the JWT session extras so the client sees hasProfile=true /
  // username / role immediately — without this, the token's snapshot of the
  // profile (frozen at sign-in under the JWT strategy) would stay stale
  // until the next wallet sign-in and loop users back to /auth/setup.
  try {
    await updateAuthSession({
      user: { name: name ?? check.username, hasProfile: true },
    });
  } catch (err) {
    // Non-fatal: the profile row is saved; worst case the token catches up
    // on the next sign-in. Logged for ops rather than failing the request.
    console.warn('profile/setup session refresh failed:', err);
  }

  return NextResponse.json({ username: check.username, role, displayName: name });
}
