import { defineConfig, devices } from '@playwright/test';
import { PLATFORM_ADDRESS } from './e2e/fixtures';

/**
 * E2E smoke suite for the InvoFi frontend (issue #171).
 *
 * The webServer boots `next dev` against the live Stellar testnet contracts and
 * a placeholder Supabase URL. The placeholder Supabase base URL is intercepted
 * by the tests (see e2e/fixtures.ts) so the suite is deterministic without any
 * real Supabase credentials. On-chain reads for the invoice detail / print
 * views are likewise stubbed at the Soroban RPC boundary with fixture data;
 * the account lookup still hits real testnet.
 *
 * Local run:   npm run test:e2e
 * CI run:      .github/workflows/e2e.yml (manual + scheduled)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // `next dev` compiles each route on first request, which can exceed the
  // defaults on a cold start. Give tests and assertions room to wait for it.
  // The expect timeout also absorbs the first-hit compile of a route (a
  // heading assertion on a freshly-compiled page can otherwise outrun 20s).
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Placeholder Supabase base URL — all requests to it are intercepted in
      // tests, so no real project or credentials are required. The subdomain
      // ("e2e") determines the auth storage key (`sb-e2e-auth-token`) used by
      // the session-seeding helper.
      NEXT_PUBLIC_SUPABASE_URL: 'https://e2e.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'placeholder-publishable-key',
      // Live v0.3 contract set on Stellar testnet (matches README's Live Demo).
      NEXT_PUBLIC_REGISTRY_CONTRACT_ID: 'CCV4OSLYRRMYTRMWH4GVWY2QGSFC5PV33KYQEMQF6DOQW3OXDAVBSHSY',
      NEXT_PUBLIC_FINANCING_CONTRACT_ID: 'CBGRA3457ZFXYZNEQLO4YGUQ3OBEWOE6US6ZREHK6NF2DLZYBO73IFVW',
      NEXT_PUBLIC_REPAYMENT_CONTRACT_ID: 'CCDATW5GMVDOPK55Q4MLXV5SGA3VLXPD67ABLBNMHWFF6BLL2IZBUVEP',
      NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
      NEXT_PUBLIC_RPC_URL: 'https://soroban-testnet.stellar.org',
      NEXT_PUBLIC_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      // Escrow rail ON for the suite: role-gated escrow UI (the milestone
      // panel, Epic 3.4) becomes reachable. The flag value is NOT a key —
      // the real TW API key stays server-side in production; every TW call
      // the suite makes is intercepted at the /api/escrow/* proxy boundary
      // (see e2e/fixtures.ts authenticate()).
      NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY: 'e2e-flag',
      NEXT_PUBLIC_TRUSTLESS_WORK_ENV: 'testnet',
      NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS: PLATFORM_ADDRESS,
    },
  },
});
