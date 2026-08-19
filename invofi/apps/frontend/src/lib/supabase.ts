import { createClient } from '@/utils/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '@/types';

// Singleton browser client — lazy initialization to avoid build-time errors during static generation
let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient();
  }
  return _supabase;
}

export const supabase: SupabaseClient = getSupabaseClient(); // For backward compatibility

export async function signUpWithEmail(
  email: string,
  password: string,
  role: UserRole,
  displayName: string,
) {
  // Store role + displayName in user_metadata so we can create the profile
  // after email confirmation when no session exists yet.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, display_name: displayName },
    },
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error('Sign up failed — please try again.');

  // If Supabase immediately returns a session (email confirmation disabled),
  // insert the profile now. Otherwise it will be created on first sign-in.
  if (authData.session) {
    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id: authData.user.id,
      email,
      role,
      display_name: displayName,
      wallet_address: null,
    });
    if (profileError) {
      console.warn('Profile insert failed:', profileError.message);
    }
  }

  return authData;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Ensure a profile row exists. Handles the case where registration
  // succeeded but the profile insert was deferred (email confirmation flow).
  if (data.user) {
    await ensureProfile(data.user.id, data.user.email ?? '', data.user.user_metadata);
  }

  return data;
}

async function ensureProfile(
  userId: string,
  email: string,
  meta: Record<string, unknown> = {},
) {
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (!existing) {
    await supabase.from('user_profiles').insert({
      id: userId,
      email,
      role: (meta.role as UserRole) ?? 'business',
      display_name: (meta.display_name as string) ?? null,
      wallet_address: null,
    });
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as UserProfile;
}

export async function linkWalletAddress(userId: string, walletAddress: string) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ wallet_address: walletAddress })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Sign in (or resume) using a Stellar wallet address as the identity.
 * Tries three paths in order:
 *  1. Already have a session → just link the wallet address to the profile.
 *  2. Anonymous sign-in (if enabled on the Supabase project).
 *  3. Password-based account keyed to the wallet address, with a device-local
 *     random password stored in localStorage so the account persists across
 *     page refreshes without requiring a real email address.
 */
export async function signInWithWallet(walletAddress: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await supabase
      .from('user_profiles')
      .update({ wallet_address: walletAddress })
      .eq('id', user.id);
    return;
  }

  // Path 2: anonymous sign-in
  const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
  if (!anonError && anonData.user) {
    await supabase.from('user_profiles').upsert({
      id: anonData.user.id,
      email: null,
      role: 'business' as const,
      display_name: null,
      wallet_address: walletAddress,
    });
    return;
  }

  // Path 3: password-based fallback — anonymous auth is disabled on this project.
  // We derive a stable "email" from the wallet address and store a random device
  // password so the same account is recovered on page reload.
  //
  // Security (issue #187): the device password is a credential and must never
  // live in localStorage — it is readable by any XSS and persists across
  // sessions. sessionStorage keeps the same-tab reload recovery the original
  // localStorage approach provided (it survives page refreshes) without
  // persisting the secret to other tabs or browser restarts. The primary
  // persistence mechanism remains the Supabase session cookie, which is shared
  // across tabs, so the device password is only consulted when no session
  // exists (e.g. after session expiry).
  if (typeof window === 'undefined') return;

  const walletEmail = `${walletAddress.slice(0, 32).toLowerCase()}@stellar.wallet`;
  const pwKey = `invofi_wlt_${walletAddress}`;
  let devicePw = sessionStorage.getItem(pwKey);

  if (!devicePw) {
    devicePw = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: walletEmail,
      password: devicePw,
      options: { data: { wallet_address: walletAddress, role: 'business' } },
    });

    if (!signUpError && signUpData.user && signUpData.session) {
      sessionStorage.setItem(pwKey, devicePw);
      await supabase.from('user_profiles').upsert({
        id: signUpData.user.id,
        email: walletEmail,
        role: 'business' as const,
        display_name: null,
        wallet_address: walletAddress,
      });
      return;
    }
    // Sign-up failed (e.g., email already taken from another device) — don't
    // store the password; fall through to the sign-in attempt.
  }

  if (devicePw) {
    await supabase.auth.signInWithPassword({ email: walletEmail, password: devicePw });
  }
}