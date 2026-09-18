'use client';

/**
 * Client bridge to the wallet-first Auth.js backend (issue #376, ADR-0008).
 *
 * The backend is selected at build time by `NEXT_PUBLIC_AUTH_BACKEND`:
 *   - `authjs`    — the new Auth.js v5 backend (this bridge's functions talk
 *                   to /api/auth/*)
 *   - `supabase`  — the live Supabase Auth (default; the bridge is inert and
 *                   callers keep using supabase.auth directly)
 *
 * This switch exists because auth and data cannot be cut over in one commit:
 * the mirror/RLS data layer still derives `auth.uid()` from the Supabase JWT
 * (epic #102). When the storage cutover lands, the `supabase` branch and this
 * switch are deleted and the bridge becomes unconditional.
 */
import { getSession, signIn, signOut } from 'next-auth/react';
import type { User } from 'next-auth';

export type AuthBackend = 'supabase' | 'authjs';

export function getAuthBackend(): AuthBackend {
  return process.env.NEXT_PUBLIC_AUTH_BACKEND === 'authjs' ? 'authjs' : 'supabase';
}

/** Current Auth.js session user, or null when signed out / unavailable. */
export async function getWalletSessionUser(): Promise<User | null> {
  const session = await getSession();
  return (session?.user as User | undefined) ?? null;
}

/** Auth.js wraps every credentials failure in `CredentialsSignin`. */
const ERROR_COPY: Record<string, string> = {
  CredentialsSignin: 'Wallet signature verification failed.',
  // Separator/missing-cookie style failures are session faults, not proof faults.
  SessionRequired: 'Your session expired — please connect your wallet again.',
};

function mapSignInError(code?: string | null): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return 'Wallet sign-in failed. Please try again.';
}

/**
 * Establishes the Auth.js session from a client-signed SEP-10 challenge XDR.
 * The server verifies the challenge (and enforces single-use) inside the
 * provider's authorize handler — nothing here is trusted without that proof.
 *
 * Throws with a user-facing message on any failure; callers must not treat a
 * thrown error as signed-in.
 */
export async function signInWithSep10Challenge(signedXdr: string): Promise<User> {
  const res = await signIn('sep10', {
    signedTransactionXdr: signedXdr,
    redirect: false,
  });
  if (!res || res.error) {
    throw new Error(mapSignInError(res?.error));
  }
  // The credentials response does not carry the user — fetch the session
  // the just-set cookie now resolves to.
  const user = await getWalletSessionUser();
  if (!user) {
    throw new Error('Wallet sign-in did not produce a session. Please try again.');
  }
  return user;
}

/** Clears the Auth.js session (deletes the session row via the adapter). */
export async function signOutWalletSession(): Promise<void> {
  await signOut({ redirect: false });
}
