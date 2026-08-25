import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Deferred singleton, mirroring utils/supabase/client.ts — avoids reading
// env vars (and throwing on a missing service-role key) during static
// generation, when no request is actually being handled.
let adminInstance: SupabaseClient | null = null;

/**
 * Server-only Supabase client authenticated with the service-role key.
 *
 * SECURITY: this client bypasses Row Level Security entirely. It must only
 * ever be imported from server-only code — Next.js Route Handlers
 * (`src/app/api/**\/route.ts`) — and NEVER from a Client Component or any
 * module that ends up in the browser bundle. `SUPABASE_SERVICE_ROLE_KEY` is
 * deliberately not prefixed with `NEXT_PUBLIC_` so Next.js refuses to inline
 * it into client bundles.
 */
export function createAdminClient(): SupabaseClient {
  if (!adminInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error(
        'Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    adminInstance = createSupabaseClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminInstance;
}
