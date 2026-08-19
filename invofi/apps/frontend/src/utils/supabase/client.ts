import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Deferred client factory to avoid build-time initialization during static generation
let clientInstance: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!clientInstance) {
    // Only read environment variables when actually creating the client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // Supabase renamed "anon key" to "publishable key" in late 2024.
    // Accept either env var name so both old and new deployments work.
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    clientInstance = createBrowserClient(url, key);
  }
  return clientInstance;
}