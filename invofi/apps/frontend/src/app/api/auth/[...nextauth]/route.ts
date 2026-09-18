/**
 * Auth.js v5 route handlers (issue #376, ADR-0008).
 *
 * Mounts the wallet-first auth backend at /api/auth/*:
 *   POST /api/auth/callback/sep10   — credentials sign-in (the client posts
 *                                     the signed SEP-10 challenge XDR here
 *                                     via next-auth/react's signIn)
 *   GET  /api/auth/session          — current session (SessionProvider polls)
 *   POST /api/auth/signout          — sign out (deletes the session row)
 *
 * Node runtime (the default for Route Handlers) — the pg adapter and the
 * SEP-10 verifier both need Node APIs and DATABASE_URL; nothing here may be
 * deployed to the edge (see docs/05-authentication.md, "Session resolution").
 */
import { handlers } from '@/lib/auth/config';

export const { GET, POST } = handlers;
