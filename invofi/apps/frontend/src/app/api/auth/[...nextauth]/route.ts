/**
 * Auth.js v5 route handlers (issue #376, ADR-0008).
 *
 * Mounts the wallet-first auth backend at /api/auth/*:
 *   POST /api/auth/callback/sep10   — credentials sign-in (the client posts
 *                                     the signed SEP-10 challenge XDR here
 *                                     via next-auth/react's signIn)
 *   GET  /api/auth/session          — current session (SessionProvider polls)
 *   POST /api/auth/signout          — sign out (clears the JWT cookie)
 *
 * Gated on NEXT_PUBLIC_AUTH_BACKEND === 'authjs' (build-time, inlined): on
 * deployments running the legacy Supabase backend the handlers are NOT
 * mounted — Auth.js v5 throws MissingSecret at request time when AUTH_SECRET
 * is unset in production, and an unmounted route answers 404 instead of a
 * misleading 500. The Supabase client never calls /api/auth/*, so nothing
 * user-facing changes on those hosts.
 *
 * Node runtime (the default for Route Handlers) — the pg adapter and the
 * SEP-10 verifier both need Node APIs and DATABASE_URL; nothing here may be
 * deployed to the edge (see docs/05-authentication.md, "Session resolution").
 */
import { handlers } from '@/lib/auth/config';
import { isAuthjsBackendEnabled } from '@/lib/auth/enabled';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

function disabled(): Response {
  return Response.json(
    { error: 'not_found', message: 'Auth backend not enabled on this deployment.' },
    { status: 404 },
  );
}

export async function GET(...args: Parameters<typeof handlers.GET>) {
  if (!isAuthjsBackendEnabled()) return disabled();
  return handlers.GET(...args);
}

export async function POST(...args: Parameters<typeof handlers.POST>) {
  if (!isAuthjsBackendEnabled()) return disabled();
  return handlers.POST(...args);
}
