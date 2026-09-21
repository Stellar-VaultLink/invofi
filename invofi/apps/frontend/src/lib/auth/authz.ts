// ── Server-layer authorization (ADR-0009, issue #377) ────────────────────────
//
// The PRIMARY authorization gate for the Neon backend: every data-touching
// route handler / server action calls one of these helpers FIRST, before any
// query runs. RLS remains defense-in-depth on four tables only (see
// migrations/0002_authz_guards.sql and rls-context.ts) — this module is the
// gate that must not be forgotten.
//
// Convention for new endpoints (also in docs/09-contributing.md):
//   const identity = await requireUser();          // authenticated + wallet
//   await requireRole('admin');                    // admin-only surface
//   assertSameWallet(body.senderAddress);          // party-scoped write
//
// Identity model (ADR-0008): the Auth.js session user id is derived from the
// SEP-10-proven wallet; `user_profiles.id` == session user id.

import { auth } from '@/lib/auth/config';
import { checkRateLimit } from '@/lib/rate-limit';

export type AuthzIdentity = {
  /** user_profiles.id — wallet-derived Auth.js user id. */
  userId: string;
  /** SEP-10-proven Stellar address (G… address). */
  walletAddress: string;
  /** user_profiles.role — mirrors the DB row. */
  role: 'business' | 'lender' | 'admin' | null;
};

export class AuthzError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthzError';
    this.status = status;
    this.code = code;
  }
}

/** Shape of `auth()`'s session under the wallet-first backend (ADR-0008). */
type WalletSession = {
  user?: {
    id?: string | null;
    walletAddress?: string | null;
    role?: 'business' | 'lender' | 'admin' | null;
    hasProfile?: boolean;
  } | null;
} | null;

/**
 * Require an authenticated, wallet-proven session. Returns the identity the
 * endpoint may authorize against. Throws AuthzError(401) otherwise.
 */
export async function requireUser(): Promise<AuthzIdentity> {
  const session = (await auth()) as WalletSession;
  const user = session?.user;

  if (!user?.id || !user.walletAddress) {
    throw new AuthzError(401, 'unauthenticated', 'Sign in with a wallet to access this resource.');
  }

  return {
    userId: user.id,
    walletAddress: user.walletAddress,
    role: user.role ?? null,
  };
}

/**
 * Require the session's role to include `role` (currently only 'admin' is
 * checked — the reminder_configs gate). Throws AuthzError(403).
 */
export async function requireRole(role: 'admin'): Promise<AuthzIdentity> {
  const identity = await requireUser();
  if (identity.role !== role) {
    throw new AuthzError(403, 'forbidden_role', `This resource requires the '${role}' role.`);
  }
  return identity;
}

/**
 * Party check: the session wallet must equal `walletAddress` (the row's
 * owner/sender column). Throws AuthzError(403) — never leaks existence of
 * other parties' rows.
 */
export function assertSameWallet(walletAddress: string, identity: AuthzIdentity): void {
  if (walletAddress !== identity.walletAddress) {
    throw new AuthzError(403, 'forbidden_party', 'You can only act on your own rows.');
  }
}

/**
 * Party check by user id (rows keyed by uuid rather than wallet).
 * Throws AuthzError(403) on mismatch.
 */
export function assertSameUser(userId: string, identity: AuthzIdentity): void {
  if (userId !== identity.userId) {
    throw new AuthzError(403, 'forbidden_party', 'You can only act on your own rows.');
  }
}

/**
 * Route-handler adapter: run `fn` and map AuthzError to a JSON response.
 * Keeps every endpoint's catch block to one line so the gate is cheap to use.
 *
 *   export async function GET() {
 *     return handleAuthz(async () => { ... });
 *   }
 */
export async function handleAuthz(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthzError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    throw err;
  }
}

/**
 * Session identity if authenticated, else null — for endpoints that serve
 * both public and personalized payloads (e.g. marketplace with saved filters).
 */
export async function getOptionalIdentity(): Promise<AuthzIdentity | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

// ── Rate-limit integration ───────────────────────────────────────────────────
// Re-exported so an endpoint's gate reads as one block: identity, then quota.
// (checkRateLimit takes a RateLimitOptions object — see src/lib/rate-limit.ts.)

export { checkRateLimit };

/**
 * Enforce the endpoint's per-identity rate limit; throws AuthzError(429).
 * Default window mirrors the auth-sensitive routes.
 */
export async function assertRateLimit(
  action: string,
  identity: AuthzIdentity,
  opts?: { limit?: number; windowMs?: number },
): Promise<void> {
  const { allowed } = await checkRateLimit(`authz:${action}:${identity.userId}`, {
    limit: opts?.limit ?? 30,
    windowMs: opts?.windowMs ?? 60_000,
  });
  if (!allowed) {
    throw new AuthzError(429, 'rate_limited', 'Too many requests — slow down.');
  }
}
