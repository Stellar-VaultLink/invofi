/**
 * Automated axe-core accessibility scan (issue #175).
 *
 * Scans the pages listed in the acceptance criteria for serious / critical
 * WCAG violations.  Fails CI when any are found.  Known, accepted violations
 * are tracked in `../axe-waivers.json` and excluded from the assertion.
 *
 * Run locally:  npm run test:a11y
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

// ── Waivers ──────────────────────────────────────────────────────────────────

interface Waiver {
  /** axe rule id, e.g. "color-contrast" */
  ruleId: string;
  /** Page route prefix the waiver applies to, e.g. "/dashboard" or "*" for all */
  page: string;
  /** Short rationale required for every waiver */
  reason: string;
  /** GitHub issue tracking the fix (optional) */
  issue?: string;
}

const WAIVERS_PATH = path.resolve(__dirname, '..', 'axe-waivers.json');
const waivers: Waiver[] = fs.existsSync(WAIVERS_PATH)
  ? JSON.parse(fs.readFileSync(WAIVERS_PATH, 'utf8'))
  : [];

function isWaived(ruleId: string, pageUrl: string): boolean {
  return waivers.some(
    (w) =>
      w.ruleId === ruleId &&
      (w.page === '*' || pageUrl.startsWith(w.page)),
  );
}

// ── Supabase & RPC mocking ──────────────────────────────────────────────────
// Authenticated pages need a seeded Supabase session plus REST stubs so the
// page renders without real credentials.
//
// The Playwright config (playwright.config.ts) sets NEXT_PUBLIC_SUPABASE_URL
// to "https://e2e.supabase.co".  @supabase/ssr derives the cookie key as
// sb-<first-hostline-label>-auth-token → "sb-e2e-auth-token".

const AUTH_STORAGE_KEY = 'sb-e2e-auth-token';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

const SMOKE_USER = {
  id: 'a11y-user-001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'a11y@test.local',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { role: 'lender', display_name: 'A11y Test' },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function encodeSessionCookie(session: object): string {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

/** Seed a signed-in Supabase session and stub all auth/data endpoints. */
async function mockAuth(page: import('@playwright/test').Page): Promise<void> {
  const session = {
    access_token: 'a11y-dummy-access-token',
    refresh_token: 'a11y-dummy-refresh-token',
    token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    expires_in: 3600,
    user: SMOKE_USER,
  };

  await page.context().addCookies([
    {
      name: AUTH_STORAGE_KEY,
      value: encodeSessionCookie(session),
      url: 'http://localhost:3000',
    },
  ]);

  // ── Supabase auth endpoints ──────────────────────────────────────────────
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ json: { user: SMOKE_USER } }),
  );
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      json: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: 'bearer',
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        user: SMOKE_USER,
      },
    }),
  );

  // ── Supabase REST data endpoints ─────────────────────────────────────────
  await page.route('**/rest/v1/invoices**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/rest/v1/financing_offers**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/rest/v1/position_listings**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/rest/v1/user_profiles**', (route) =>
    route.fulfill({ json: [{ id: SMOKE_USER.id, role: 'lender', display_name: 'A11y Test' }] }),
  );
  await page.route('**/rest/v1/invoice_documents**', (route) =>
    route.fulfill({ json: [] }),
  );

  // ── Stellar Horizon (XLM balance on dashboard) ──────────────────────────
  await page.route(`${HORIZON_URL}/accounts/**`, (route) =>
    route.fulfill({
      json: {
        balances: [
          { asset_type: 'native', balance: '1000.0000000' },
        ],
      },
    }),
  );

  // ── Stellar Soroban RPC (portfolio page contract reads) ──────────────────
  await page.route(`${RPC_URL}`, (route) => {
    const body = route.request().postData();
    if (!body) return route.fallback();
    try {
      const json = JSON.parse(body);
      if (json.method === 'getTransaction' || json.method === 'sendTransaction') {
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id: json.id ?? 1,
            result: {
              status: 'SUCCESS',
              result: { auth: [], xdr: '' },
              latestLedger: 5_000_000,
            },
          },
        });
      }
      if (json.method === 'simulateTransaction') {
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id: json.id ?? 1,
            result: {
              transactionData: '',
              minResourceFee: '100',
              results: [],
              events: [],
              latestLedger: 5_000_000,
            },
          },
        });
      }
      if (json.method === 'getEvents') {
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id: json.id ?? 1,
            result: { events: [], latestLedger: 5_000_000, cursor: '' },
          },
        });
      }
    } catch {
      // Non-JSON — fall through
    }
    return route.fallback();
  });
}

// ── Page definitions ─────────────────────────────────────────────────────────

interface PageDef {
  name: string;
  path: string;
  /** Whether the page requires an authenticated Supabase session */
  auth: boolean;
}

const PAGES: PageDef[] = [
  { name: 'Landing',          path: '/',                      auth: false },
  { name: 'Login',            path: '/auth/login',            auth: false },
  { name: 'Register',         path: '/auth/register',         auth: false },
  { name: 'Dashboard',        path: '/dashboard',             auth: true },
  { name: 'Marketplace',      path: '/marketplace',           auth: true },
  { name: 'Invoice Detail',   path: '/invoices/inv_a11y_smoke', auth: true },
  { name: 'Portfolio',        path: '/portfolio',             auth: true },
  { name: 'Settings',         path: '/settings',              auth: true },
];

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe('axe-core accessibility scan', () => {
  for (const pg of PAGES) {
    test(`${pg.name} (${pg.path}) — zero serious/critical violations`, async ({ page }) => {
      if (pg.auth) {
        await mockAuth(page);
      }

      await page.goto(pg.path, { waitUntil: 'networkidle' });
      // Give client-side React hydration a moment to finish.
      await page.waitForTimeout(1_000);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();

      // Filter to serious + critical only, excluding waived rules.
      const violations = results.violations.filter((v) => {
        if (v.impact !== 'serious' && v.impact !== 'critical') return false;
        return !isWaived(v.id, pg.path);
      });

      // Build a readable summary for easier debugging.
      if (violations.length > 0) {
        const summary = violations
          .map((v) => {
            const nodes = v.nodes
              .slice(0, 3)
              .map((n) => `    ${n.html.slice(0, 120)}`)
              .join('\n');
            return `[${v.impact}] ${v.id}: ${v.description}\n  Help: ${v.helpUrl}\n  Nodes (${v.nodes.length}):\n${nodes}`;
          })
          .join('\n\n');
        console.error(`\nA11y violations on ${pg.path}:\n${summary}\n`);
      }

      expect(
        violations,
        `Found ${violations.length} serious/critical a11y violation(s) on ${pg.path}`,
      ).toHaveLength(0);
    });
  }
});
