/**
 * Offline demo-mode flag.
 *
 * The frontend runs fully offline (no Supabase, no Stellar RPC/Horizon) when
 * `NEXT_PUBLIC_USE_MOCK=1` is set. Everything routes through the mock layers in
 * `@/lib/mock` (data + auth), `@/lib/contract` (SDK MockClient), and
 * `@/lib/horizon` (mock balances).
 *
 * `NEXT_PUBLIC_DEMO_MODE=1` (issue #107) also engages the mock stack: the
 * "Try the demo" landing entry points at `/portfolio`, and the portfolio only
 * contains seeded data (and only opens without auth) because the mock layers
 * are active. A demo deployment can therefore be configured with just
 * `NEXT_PUBLIC_DEMO_MODE=1` — `NEXT_PUBLIC_USE_MOCK=1` is implied.
 *
 * Kept in its own tiny module so server code (middleware) can check the flag
 * without pulling the heavier mock client into its bundle.
 */
export function isMockMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCK === '1' ||
    process.env.NEXT_PUBLIC_DEMO_MODE === '1'
  );
}

/**
 * Public try-it demo flag (issue #107).
 *
 * `NEXT_PUBLIC_DEMO_MODE=1` turns the landing page's "Try the demo" entry
 * point on. The demo experience reuses the offline mock layers (seeded
 * invoices, offers, and a position token) so a visiting reviewer can reach a
 * portfolio containing seeded data without creating an account or connecting a
 * wallet. The mode is clearly labeled as testnet-only and never affects
 * production flows — when neither flag is set the landing page renders the
 * default register/marketplace CTAs.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === '1';
}