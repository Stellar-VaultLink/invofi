/**
 * Build-time gate for the wallet-first Auth.js backend (issue #376).
 *
 * `NEXT_PUBLIC_AUTH_BACKEND=authjs` flips the client bridge AND signals that
 * the server backend is active on this deployment. Auth.js v5 throws
 * MissingSecret at request time when `AUTH_SECRET` is unset in production —
 * so hosts that intentionally run the legacy Supabase backend (no
 * AUTH_SECRET / DATABASE_URL) must not mount the handlers at all.
 *
 * Checking the NEXT_PUBLIC_ var (inlined at build time) rather than the
 * server-only ones keeps this decision identical at build and runtime, which
 * the App Router requires for route-handler gating.
 *
 * Mirrors getAuthBackend() in src/lib/auth/client.ts — both read the same
 * variable; this is the server-side half of the same switch.
 */
export function isAuthjsBackendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_BACKEND === 'authjs';
}
