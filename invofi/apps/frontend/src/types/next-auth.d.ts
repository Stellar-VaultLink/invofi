import type { DefaultSession } from 'next-auth';

/**
 * Wallet-first identity extras on the Auth.js session (issue #380, ADR-0008
 * Amendment 001). The wallet address is the primary identity key; `username`
 * is the immutable public handle set once at profile setup; `role` mirrors
 * `user_profiles.role` and is switchable from settings.
 *
 * The pg adapter (src/lib/auth/pg-adapter.ts) reads these columns at sign-in
 * and the jwt() callback in src/lib/auth/config.ts stashes them in the token
 * (Amendment 002: JWT strategy); the session callback copies them onto
 * session.user from there.
 */
// Augment the SOURCE module — `next-auth/jwt` is a bare `export * from
// '@auth/core/jwt'`, and re-exported names cannot be augmented through the
// re-exporting module.
declare module '@auth/core/jwt' {
  interface JWT {
    /** user_profiles.id (wallet-derived) — mirrors session.user.id. */
    uid?: string;
    /** Stellar address proven via SEP-10, captured at sign-in. */
    walletAddress?: string | null;
    /** Immutable handle; null until the one-time profile setup completes. */
    username?: string | null;
    /** user_profiles.role ('business' | 'lender' | 'admin') at sign-in. */
    role?: 'business' | 'lender' | 'admin' | null;
    /** True once the profile row carried a username at sign-in. */
    hasProfile?: boolean;
  }
}
declare module 'next-auth' {
  interface Session {
    user: {
      /** user_profiles.id — the Auth.js user id (wallet-derived). */
      id: string;
      /** Stellar address proven via SEP-10 (null for non-wallet sessions). */
      walletAddress?: string | null;
      /** Immutable handle; null until the one-time profile setup completes. */
      username?: string | null;
      /** user_profiles.role ('business' | 'lender' | 'admin'). */
      role?: 'business' | 'lender' | 'admin' | null;
      /** True once the profile row carries a username (setup done). */
      hasProfile?: boolean;
    } & DefaultSession['user'];
  }

  /**
   * The adapter hydrates these onto the raw User object; the session
   * callback copies them onto session.user. Declared here so the client
   * bridge's `getWalletSessionUser()` (typed as User) exposes them.
   */
  interface User {
    walletAddress?: string | null;
    username?: string | null;
    role?: 'business' | 'lender' | 'admin' | null;
    hasProfile?: boolean;
  }
}
