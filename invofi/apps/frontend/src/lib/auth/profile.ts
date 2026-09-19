/**
 * Server-side profile queries for the wallet-first identity model
 * (issue #380, ADR-0008 Amendment 001). Server-only — uses the pg layer
 * (`src/lib/auth/pg.ts`) and must never be imported from client code.
 *
 * Identity rules enforced here:
 *  - `username` is unique (partial unique index in 0001_wallet_auth.sql),
 *    immutable once set; the validation rules live in `./username` (shared
 *    with the client setup page).
 *  - `role` is switchable ('business' | 'lender'); 'admin' is provisioned
 *    out-of-band, never through these functions.
 *  - `display_name` is editable; it is the business name when role='business'.
 */
import { query } from './pg';

export type SetupRole = 'business' | 'lender';

export interface WalletProfile {
  id: string;
  username: string | null;
  role: SetupRole | 'admin';
  display_name: string | null;
}

/** The profile row for a proven wallet address, or null when unknown. */
export async function getProfileByWallet(walletAddress: string): Promise<WalletProfile | null> {
  const rows = await query<{
    id: string;
    username: string | null;
    role: WalletProfile['role'];
    display_name: string | null;
  }>(
    `select id, username, role, display_name
       from user_profiles
      where wallet_address = $1`,
    [walletAddress],
  );
  return rows[0] ?? null;
}

/**
 * One-time setup: claims the handle and sets role/display_name atomically.
 *
 * The partial unique index (`user_profiles_username_key`) is the concurrency
 * boundary — a racing claim on the same handle fails with 23505 and this
 * returns false. Refuses to run twice (username already set) so the handle's
 * immutability does not depend on the caller.
 */
export async function claimUsername(
  userId: string,
  username: string,
  role: SetupRole,
  displayName: string | null,
): Promise<{ ok: true } | { ok: false; reason: 'taken' | 'already_set' }> {
  try {
    const rows = await query<{ username: string }>(
      `update user_profiles
          set username = $2,
              role = $3,
              display_name = $4,
              updated_at = now()
        where id = $1 and username is null
        returning username`,
      [userId, username, role, displayName],
    );
    if (rows.length === 0) return { ok: false, reason: 'already_set' };
    return { ok: true };
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === '23505'
    ) {
      return { ok: false, reason: 'taken' };
    }
    throw err;
  }
}

/** Editable profile fields (display_name, role — never the username). */
export async function updateProfileDisplay(
  userId: string,
  patch: { displayName?: string | null; role?: SetupRole },
): Promise<void> {
  await query(
    `update user_profiles
        set display_name = coalesce($2, display_name),
            role = coalesce($3, role),
            updated_at = now()
      where id = $1`,
    [userId, patch.displayName ?? null, patch.role ?? null],
  );
}
