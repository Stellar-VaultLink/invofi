/**
 * Username validation rules for the wallet-first identity (issue #380,
 * ADR-0008 Amendment 001). Pure module — shared by the server setup route
 * (`/api/profile/setup`) and the client setup page so both sides enforce
 * the exact same rules. Server remains authoritative: the DB's partial
 * unique index is the final concurrency arbiter.
 */

export type SetupRole = 'business' | 'lender';

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;

/** Paths/authoritative words a handle must never collide with. */
export const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'auth', 'login', 'register', 'setup', 'dashboard', 'settings',
  'profile', 'invoices', 'invoice', 'marketplace', 'portfolio', 'stats',
  'securitize', 'transactions', 'documents', '403', '404', 'root', 'support',
  'invofi', 'stellar', 'system', 'official', 'team', 'help', 'about', 'terms',
  'privacy', '_next', 'static', 'favicon.ico', 'monitoring',
]);

export interface UsernameCheck {
  ok: boolean;
  username: string;
  error?: string;
}

/** Validates + normalizes a requested handle. */
export function validateUsername(raw: unknown): UsernameCheck {
  if (typeof raw !== 'string') {
    return { ok: false, username: '', error: 'A username is required.' };
  }
  const username = raw.trim().toLowerCase();
  if (username !== raw.trim()) {
    return { ok: false, username, error: 'Use only lowercase letters, numbers, "-" and "_".' };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      username,
      error: 'Usernames are 3–30 characters: lowercase letters, numbers, "-" or "_".',
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, username, error: 'That username is reserved.' };
  }
  return { ok: true, username };
}
