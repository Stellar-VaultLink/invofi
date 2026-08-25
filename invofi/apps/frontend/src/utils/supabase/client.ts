import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMockMode } from '@/lib/mock-mode';
import { createMockSupabaseClient } from '@/lib/mock';

// Deferred client factory to avoid build-time initialization during static generation
let clientInstance: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!clientInstance) {
    // Offline demo mode (#177): serve the in-memory mock client so no
    // Supabase project or env vars are required.
    if (isMockMode()) {
      clientInstance = createMockSupabaseClient();
      return clientInstance;
    }

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
