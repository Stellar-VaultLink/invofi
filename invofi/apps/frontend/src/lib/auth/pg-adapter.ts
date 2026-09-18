/**
 * Minimal Auth.js adapter over the `sessions` / `verification_token` tables
 * (migration 0001_wallet_auth.sql) for the wallet-first backend (#376,
 * ADR-0008 decision 4: database session strategy).
 *
 * Deliberately minimal: Auth.js v5 with a Credentials provider only ever calls
 * createUser / getUser / getUserByAccount / linkAccount (from the provider's
 * authorize result — inlined via ensureUser) and createSession/getSession/
 * updateSession/deleteSession. User rows live in `user_profiles` keyed by the
 * wallet-derived id (`ensureUser`), so no separate `users` table is created —
 * `user_profiles.id` IS the Auth.js user id.
 */
import type {
  Adapter,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from 'next-auth/adapters';

import { ensureUser, query } from './pg';

/**
 * AdapterUser requires a non-null `email: string` (Auth.js's email-centric
 * type) — wallet-first users have none, so an empty string stands in for "no
 * email". Nothing in the wallet-first UI reads session.user.email (ADR-0008
 * Amendment 001); the wallet address and display_name are the identity.
 */
function rowToUser(id: string, displayName: string | null): AdapterUser {
  return {
    id,
    name: displayName ?? null,
    email: '',
    emailVerified: null,
    image: null,
  };
}

function rowToSession(row: {
  session_token: string;
  user_id: string;
  expires: Date;
}): AdapterSession {
  return {
    sessionToken: row.session_token,
    userId: row.user_id,
    expires: row.expires,
  };
}

export function PgAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, 'id'>): Promise<AdapterUser> {
      // The wallet provider always pre-creates the profile via ensureUser;
      // createUser is only reached for non-wallet flows (future anonymous
      // demo sessions). Key the row by a fresh UUID in auth.users.
      const id = crypto.randomUUID();
      await query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        user.email ?? null,
      ]);
      await query(
        `insert into user_profiles (id, email, role, display_name, wallet_address)
         values ($1, $2, 'business', $3, null)`,
        [id, user.email ?? null, user.name ?? null],
      );
      return { ...user, id };
    },

    async getUser(id: string): Promise<AdapterUser | null> {
      const rows = await query<{
        id: string;
        display_name: string | null;
        wallet_address: string | null;
      }>(
        `select up.id, up.display_name, up.wallet_address
           from user_profiles up
          where up.id = $1`,
        [id],
      );
      if (rows.length === 0) return null;
      return rowToUser(rows[0].id, rows[0].display_name);
    },

    async getUserByEmail(): Promise<AdapterUser | null> {
      // Wallet-only identity model: email is not a lookup key (ADR-0008
      // Amendment 001). Kept for the Adapter interface.
      return null;
    },

    async getUserByAccount({ providerAccountId }): Promise<AdapterUser | null> {
      // providerAccountId is the Stellar wallet address (G...) — the primary
      // identity key.
      const rows = await query<{ id: string }>(
        `select id from user_profiles where wallet_address = $1`,
        [providerAccountId],
      );
      if (rows.length === 0) return null;
      return this.getUser!(rows[0].id) as Promise<AdapterUser | null>;
    },

    async linkAccount(): Promise<void> {
      // The SEP-10 provider inlines account linking into authorize()
      // (ensureUser already binds wallet_address ↔ profile). Nothing to do.
    },

    async createSession({ sessionToken, userId, expires }): Promise<AdapterSession> {
      await query(
        `insert into sessions (session_token, user_id, expires)
         values ($1, $2, $3)`,
        [sessionToken, userId, expires],
      );
      return { sessionToken, userId, expires };
    },

    async getSessionAndUser(sessionToken: string): Promise<{
      session: AdapterSession;
      user: AdapterUser;
    } | null> {
      const rows = await query<{
        session_token: string;
        user_id: string;
        expires: Date;
        display_name: string | null;
      }>(
        `select s.session_token, s.user_id, s.expires, up.display_name
           from sessions s
           join user_profiles up on up.id = s.user_id
          where s.session_token = $1
            and s.expires > now()`,
        [sessionToken],
      );
      if (rows.length === 0) return null;
      return {
        session: rowToSession(rows[0]),
        user: rowToUser(rows[0].user_id, rows[0].display_name),
      };
    },

    async updateSession(session): Promise<AdapterSession | null> {
      // The beta's updateSession input has an optional userId — return the
      // row's authoritative user_id from the UPDATE so the result is a
      // complete AdapterSession.
      const rows = await query<{ expires: Date; user_id: string }>(
        `update sessions set expires = $2, updated_at = now()
          where session_token = $1
          returning expires, user_id`,
        [session.sessionToken, session.expires],
      );
      if (rows.length === 0) return null;
      return {
        sessionToken: session.sessionToken,
        userId: rows[0].user_id,
        expires: rows[0].expires,
      };
    },

    async deleteSession(sessionToken): Promise<void> {
      await query(`delete from sessions where session_token = $1`, [sessionToken]);
    },

    async createVerificationToken(
      token: VerificationToken,
    ): Promise<VerificationToken | null | undefined> {
      await query(
        `insert into verification_token (identifier, token, expires)
         values ($1, $2, $3)
         on conflict (identifier, token) do update set expires = excluded.expires`,
        [token.identifier, token.token, token.expires],
      );
      return token;
    },

    async useVerificationToken({
      identifier,
      token,
    }): Promise<VerificationToken | null> {
      const rows = await query<{ identifier: string; token: string; expires: Date }>(
        `delete from verification_token
          where identifier = $1 and token = $2
          returning identifier, token, expires`,
        [identifier, token],
      );
      if (rows.length === 0) return null;
      return rows[0];
    },
  };
}

// Re-exported for the provider module — keeps the adapter self-contained as
// the only db entry point the authorize handler needs.
export { ensureUser };
