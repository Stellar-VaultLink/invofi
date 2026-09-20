/**
 * Backend switch for the wallet-first auth migration (#376/#102).
 *
 * Deliberately dependency-free: components that only need to know which auth
 * backend is active (e.g. the settings page, ProfileEditor) import from here
 * instead of `@/lib/auth/client`, whose `next-auth/react` import would pull
 * the client session machinery into every chunk that renders them — which is
 * exactly what blew the /settings bundle budget (#108 check, +26%).
 */

export type AuthBackend = 'supabase' | 'authjs';

export function getAuthBackend(): AuthBackend {
  return process.env.NEXT_PUBLIC_AUTH_BACKEND === 'authjs' ? 'authjs' : 'supabase';
}
