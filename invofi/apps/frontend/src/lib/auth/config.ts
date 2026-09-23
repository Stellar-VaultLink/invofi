/**
 * Auth.js v5 (NextAuth v5) configuration — the wallet-first backend
 * (issue #376, ADR-0008 + Amendment 001).
 *
 * Ships with exactly one provider: the custom SEP-10 Credentials provider.
 * No email/password, no OAuth, no anonymous provider (the mock/offline demo
 * mode keeps its own Supabase-free path until #102's storage swap lands).
 *
 * NOT yet wired into the app's middleware/session context — this module lands
 * as the foundation; the cutover (removing supabase.auth and @supabase/ssr)
 * is the next slice of #376. Nothing imports it yet besides its tests, which
 * is why it is excluded from the client bundle.
 *
 * Route handlers when wired (Auth.js v5 conventions):
 *   src/app/api/auth/[...nextauth]/route.ts → export const { handlers, auth, signIn, signOut }
 *
 * Session resolution note (ADR-0008 Amendment 002): sessions are JWTs. Auth.js
 * rejects database sessions when a Credentials provider is present (v5 throws
 * UnsupportedStrategy at runtime), so the token carries the wallet extras
 * (walletAddress / username / role / hasProfile) captured at sign-in; the
 * adapter remains for user upsert + logout-everywhere revocation. Middleware
 * resolves sessions statelessly — refresh (updateAge) happens when `auth()`
 * runs in the Node runtime (RSC / route handlers).
 */
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { PgAdapter } from './pg-adapter';

/** One shared adapter instance (handler + authorize path use the same pool). */
const adapter = PgAdapter();
import {
  authorizeSep10,
  type Sep10Credentials,
} from './sep10-credentials';
import {
  getSep10HomeDomain,
  getSep10WebAuthDomain,
  getServerNetworkPassphrase,
  verifySep10Challenge,
} from '../sep10-server';

/** Replay-guard single-use claim (pg-backed; migration 0000 creates the table). */
async function claimChallengeHash(txHash: string): Promise<boolean> {
  const { query } = await import('./pg');
  try {
    await query(
      `insert into sep10_used_challenges (tx_hash) values ($1)`,
      [txHash],
    );
    return true;
  } catch (err) {
    // Postgres UNIQUE_VIOLATION — this challenge hash was already used.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === '23505'
    ) {
      return false;
    }
    // Fail closed: we could not confirm single-use.
    throw err;
  }
}

export const authConfig: NextAuthConfig = {
  adapter,
  session: {
    // JWT sessions (ADR-0008 Amendment 002): Auth.js v5 hard-rejects the
    // database strategy when a Credentials provider is registered — the
    // wallet-first SEP-10 flow signs in through Credentials, so JWT is the
    // only valid strategy. The DB adapter still upserts users (profile ids,
    // #380 extras) and logout-everywhere still works by bumping the user's
    // tokenVersion... but the simple revocation lever is clearing their
    // sessions row set; per-user JWT revocation lands with #382 (token
    // versioning) if it becomes necessary.
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // refresh once a day (middleware calls auth())
  },
  providers: [
    Credentials({
      id: 'sep10',
      name: 'Stellar Wallet (SEP-10)',
      // The client submits the signed challenge XDR; the wallet-signing UX is
      // unchanged from the Supabase flow.
      credentials: {
        signedTransactionXdr: { label: 'Signed SEP-10 challenge XDR', type: 'text' },
      },
      authorize: async (credentials) => {
        // Same server signing key the legacy SEP-10 routes use
        // (SEP10_SERVER_SIGNING_SECRET — docs/08-environment-variables.md).
        const serverSecret = process.env.SEP10_SERVER_SIGNING_SECRET;
        if (!serverSecret) {
          throw new Error(
            'SEP10_SERVER_SIGNING_SECRET is not configured — cannot verify SEP-10 challenges.',
          );
        }
        try {
          return await authorizeSep10(credentials as Sep10Credentials | undefined, {
            serverSecret,
            verify: verifySep10Challenge,
            config: () => ({
              homeDomain: getSep10HomeDomain(),
              webAuthDomain: getSep10WebAuthDomain(),
              networkPassphrase: getServerNetworkPassphrase(),
            }),
            claimChallengeHash,
            ensureUser: async (wallet) => {
              const { ensureUser } = await import('./pg');
              return ensureUser(wallet, 'sep10');
            },
            getUser: async (id) => adapter.getUser!(id),
          });
        } catch (err) {
          // Returning null (not throwing) keeps the standard Auth.js
          // credentials contract: the client's signIn() resolves with
          // error: 'CredentialsSignin' instead of a 500, which the client
          // bridge maps to the user-facing copy. The underlying reason is
          // logged server-side for ops (missing config vs replay vs tamper).
          console.warn(
            'SEP-10 sign-in rejected:',
            err instanceof Error ? err.message : err,
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    // At sign-in (Credentials) the authorize() return value lands as `user`;
    // stash the #380 extras (walletAddress / username / role / hasProfile) in
    // the JWT so every later session() call can read them — under JWT the
    // session callback does NOT receive the DB user, only this token does.
    jwt({ token, user, trigger, session }) {
      if (user) {
        const extras = user as typeof user & {
          walletAddress?: string | null;
          username?: string | null;
          role?: 'business' | 'lender' | 'admin' | null;
          hasProfile?: boolean;
        };
        token.uid = user.id;
        token.walletAddress = extras.walletAddress ?? null;
        token.username = extras.username ?? null;
        token.role = extras.role ?? null;
        token.hasProfile = extras.hasProfile ?? false;
      }
      // Server-side mutations (profile setup / update) push refreshed extras
      // through unstable_update() so the token never goes stale mid-session.
      if (trigger === 'update' && session?.user) {
        const u = session.user as Partial<{
          name: string | null;
          walletAddress: string | null;
          username: string | null;
          role: 'business' | 'lender' | 'admin' | null;
          hasProfile: boolean;
        }>;
        if (u.name !== undefined) token.name = u.name;
        if (u.walletAddress !== undefined) token.walletAddress = u.walletAddress;
        if (u.username !== undefined) token.username = u.username;
        if (u.role !== undefined) token.role = u.role;
        if (u.hasProfile !== undefined) token.hasProfile = u.hasProfile;
      }
      return token;
    },
    // Session shape preserved so existing UI code keeps working
    // (ADR-0008 constraint): session.user.id is the profile id, and the
    // wallet address rides along for the components that read it.
    //
    // #380 extras come from the token (see jwt() above) — the one-time setup
    // flow gates on `hasProfile` without a second query.
    session({ session, token }) {
      session.user.id = (token.uid as string | undefined) ?? token.sub ?? '';
      session.user.walletAddress = token.walletAddress ?? null;
      session.user.username = token.username ?? null;
      session.user.role = token.role ?? null;
      session.user.hasProfile = token.hasProfile ?? false;
      return session;
    },
  },
  pages: {
    // The wallet-connect dialog drives sign-in; Auth.js's built-in pages are
    // unused (no email flow to render).
    signIn: '/auth/login',
    error: '/auth/login',
  },
  trustHost: true,
  // NextAuth v5 requires an explicit secret; AUTH_SECRET (server-only env).
  secret: process.env.AUTH_SECRET,
};

// Lazy singleton — importing NextAuth() at module scope starts nothing until
// the route handler module requests it.
export const { handlers, auth, signIn, signOut, unstable_update: updateAuthSession } =
  NextAuth(authConfig);
