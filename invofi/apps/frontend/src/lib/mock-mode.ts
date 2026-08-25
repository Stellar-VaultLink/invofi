/**
 * Offline demo-mode flag.
 *
 * The frontend runs fully offline (no Supabase, no Stellar RPC/Horizon) when
 * `NEXT_PUBLIC_USE_MOCK=1` is set. Everything routes through the mock layers in
 * `@/lib/mock` (data + auth), `@/lib/contract` (SDK MockClient), and
 * `@/lib/horizon` (mock balances).
 *
 * Kept in its own tiny module so server code (middleware) can check the flag
 * without pulling the heavier mock client into its bundle.
 */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === '1';
}
