import { createClient } from '@/utils/supabase/client';
import type { UserProfile, UserRole } from '@/types';

// Singleton browser client — safe to use in 'use client' components
export const supabase = createClient();

export async function signUpWithEmail(
  email: string,
  password: string,
  role: UserRole,
  displayName: string,
) {
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) throw authError;
  if (!authData.user) throw new Error('Sign up failed');

  const { error: profileError } = await supabase.from('user_profiles').insert({
    id: authData.user.id,
    email,
    role,
    display_name: displayName,
    wallet_address: null,
  });
  if (profileError) throw profileError;

  return authData;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
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
