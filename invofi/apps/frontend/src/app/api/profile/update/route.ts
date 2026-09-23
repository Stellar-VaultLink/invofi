import { NextRequest, NextResponse } from 'next/server';

import { auth, updateAuthSession } from '@/lib/auth/config';
import { getProfileByWallet, updateProfileDisplay } from '@/lib/auth/profile';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * PATCH /api/profile/update — display name + role edits (issue #380).
 *
 * Session-gated (wallet-first Auth.js session), rate-limited. The immutable
 * username is rejected if present — immutability is enforced server-side
 * here (the API surface), not just by hiding it in the UI.
 * `displayName` accepts "" (clears it) or a string trimmed to 80 chars;
 * omitted/undefined leaves it unchanged (coalesce in SQL).
 */
export async function PATCH(req: NextRequest) {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(`profile-update:${ip}`, {
      limit: RATE_LIMIT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    }).allowed
  ) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429 },
    );
  }

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
  const { displayName, role, username } = (body ?? {}) as {
    displayName?: unknown;
    role?: unknown;
    username?: unknown;
  };

  if (username !== undefined) {
    return NextResponse.json(
      { error: 'Usernames are permanent and cannot be changed.' },
      { status: 400 },
    );
  }

  if (role !== undefined && role !== 'business' && role !== 'lender') {
    return NextResponse.json(
      { error: 'Role must be "business" or "lender".' },
      { status: 400 },
    );
  }

  let name: string | null | undefined;
  if (displayName !== undefined) {
    if (displayName !== null && typeof displayName !== 'string') {
      return NextResponse.json({ error: 'Invalid display name.' }, { status: 400 });
    }
    if (typeof displayName === 'string') {
      const trimmed = displayName.trim();
      if (trimmed.length > 80) {
        return NextResponse.json(
          { error: 'Display names are limited to 80 characters.' },
          { status: 400 },
        );
      }
      name = trimmed; // "" clears the name; non-empty sets it
    } else {
      name = null;
    }
  }

  if (name === undefined && role === undefined) {
    return NextResponse.json(
      { error: 'Nothing to update — provide a display name or a role.' },
      { status: 400 },
    );
  }

  try {
    await updateProfileDisplay(userId, {
      displayName: name,
      role: role as 'business' | 'lender' | undefined,
    });
  } catch (err) {
    console.error('profile/update failed:', err);
    return NextResponse.json(
      { error: 'Could not save your changes. Please try again.' },
      { status: 500 },
    );
  }

  // Re-read so the client stores the authoritative row (display_name falls
  // back to the username when cleared).
  const wallet = session?.user?.walletAddress;
  const profile = wallet ? await getProfileByWallet(wallet) : null;

  // Push the new role/display name into the JWT token (strategy is jwt per
  // ADR-0008 Amendment 002 — token extras would otherwise stay frozen at
  // sign-in until the next wallet login).
  try {
    await updateAuthSession({
      user: {
        name: profile?.display_name ?? profile?.username ?? null,
        role: (profile?.role as 'business' | 'lender' | 'admin' | null) ?? null,
      },
    });
  } catch (err) {
    // Non-fatal: DB row is authoritative; the token catches up next sign-in.
    console.warn('profile/update session refresh failed:', err);
  }

  return NextResponse.json({
    displayName: profile?.display_name ?? null,
    role: profile?.role ?? null,
  });
}
