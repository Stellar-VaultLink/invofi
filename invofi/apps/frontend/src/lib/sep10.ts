'use client';

import { getSupabaseClient } from './supabase';
import { signTransactionWithActiveWallet } from './walletkit';

export interface Sep10ChallengeResponse {
  transaction: string;
  networkPassphrase: string;
}

/** Requests a fresh SEP-10 challenge transaction for `account` from the server. */
export async function requestChallenge(account: string): Promise<Sep10ChallengeResponse> {
  const res = await fetch('/api/auth/sep10/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Could not request a SEP-10 challenge.',
    );
  }
  return data as Sep10ChallengeResponse;
}

/**
 * Signs the challenge XDR with whichever approved wallet (Freighter/LOBSTR)
 * is currently active in the wallets-kit. Reuses the existing signing
 * primitive so wallet login goes through the same code path as any other
 * transaction signature.
 */
export async function signChallenge(xdr: string, networkPassphrase: string): Promise<string> {
  return signTransactionWithActiveWallet(xdr, networkPassphrase);
}

export interface Sep10VerifyResponse {
  account: string;
  email: string;
  tokenHash: string;
}

/**
 * Sends the client-signed challenge to the server for verification, then
 * redeems the returned one-time token for a real Supabase session.
 */
export async function verifyChallenge(signedXdr: string): Promise<Sep10VerifyResponse> {
  const res = await fetch('/api/auth/sep10/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Wallet signature verification failed.',
    );
  }

  const { tokenHash } = data as Sep10VerifyResponse;
  const { error } = await getSupabaseClient().auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  if (error) throw error;

  return data as Sep10VerifyResponse;
}

/**
 * Runs the full SEP-10 login cycle for the given connected wallet account:
 * request challenge → sign with the active wallet → verify with the server
 * → establish a real Supabase session.
 *
 * Throws on any failure (challenge request, wallet rejection, or server
 * verification) — callers must not treat a thrown error as signed-in.
 */
export async function loginWithSep10(account: string): Promise<Sep10VerifyResponse> {
  const { transaction, networkPassphrase } = await requestChallenge(account);
  const signedXdr = await signChallenge(transaction, networkPassphrase);
  return verifyChallenge(signedXdr);
}
