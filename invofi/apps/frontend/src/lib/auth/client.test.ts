import { afterEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const signIn = vi.fn();
const signOut = vi.fn();
vi.mock('next-auth/react', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  signIn: (...a: unknown[]) => signIn(...a),
  signOut: (...a: unknown[]) => signOut(...a),
}));

import {
  getAuthBackend,
  getWalletSessionUser,
  signInWithSep10Challenge,
  signOutWalletSession,
} from './client';

const USER = { id: 'u1', name: 'Demo', email: '', image: null };

describe('lib/auth/client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getSession.mockReset();
    signIn.mockReset();
    signOut.mockReset();
  });

  describe('getAuthBackend', () => {
    it('defaults to supabase when the switch is unset', () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_BACKEND', '');
      expect(getAuthBackend()).toBe('supabase');
    });

    it('selects authjs when NEXT_PUBLIC_AUTH_BACKEND=authjs', () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_BACKEND', 'authjs');
      expect(getAuthBackend()).toBe('authjs');
    });

    it('falls back to supabase for any other value', () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_BACKEND', 'clerk');
      expect(getAuthBackend()).toBe('supabase');
    });
  });

  describe('getWalletSessionUser', () => {
    it('returns the session user', async () => {
      getSession.mockResolvedValueOnce({ user: USER, expires: 'soon' });
      expect(await getWalletSessionUser()).toEqual(USER);
    });

    it('returns null when signed out', async () => {
      getSession.mockResolvedValueOnce(null);
      expect(await getWalletSessionUser()).toBeNull();
    });
  });

  describe('signInWithSep10Challenge', () => {
    it('signs in with the signed XDR and returns the session user', async () => {
      signIn.mockResolvedValueOnce({ error: null, ok: true, status: 200, url: null });
      getSession.mockResolvedValueOnce({ user: USER, expires: 'soon' });

      const user = await signInWithSep10Challenge('AAAA.signed.xdr');

      expect(signIn).toHaveBeenCalledWith(
        'sep10',
        { signedTransactionXdr: 'AAAA.signed.xdr', redirect: false },
      );
      expect(user).toEqual(USER);
    });

    it('maps the generic CredentialsSignin error to the verification copy', async () => {
      signIn.mockResolvedValueOnce({ error: 'CredentialsSignin' });
      await expect(signInWithSep10Challenge('bad')).rejects.toThrow(
        'Wallet signature verification failed.',
      );
    });

    it('throws a fallback message for unknown error codes', async () => {
      signIn.mockResolvedValueOnce({ error: 'SomethingElse' });
      await expect(signInWithSep10Challenge('bad')).rejects.toThrow(
        'Wallet sign-in failed. Please try again.',
      );
    });

    it('throws when signIn returns undefined (network failure shape)', async () => {
      signIn.mockResolvedValueOnce(undefined);
      await expect(signInWithSep10Challenge('xdr')).rejects.toThrow(
        'Wallet sign-in failed. Please try again.',
      );
    });

    it('throws when no session exists after a successful sign-in', async () => {
      signIn.mockResolvedValueOnce({ error: null, ok: true });
      getSession.mockResolvedValueOnce(null);
      await expect(signInWithSep10Challenge('xdr')).rejects.toThrow(
        'did not produce a session',
      );
    });
  });

  describe('signOutWalletSession', () => {
    it('delegates to next-auth signOut without redirecting', async () => {
      signOut.mockResolvedValueOnce('https://invofi.test');
      await signOutWalletSession();
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
    });
  });
});
