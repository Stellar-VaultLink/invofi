/**
 * Automated accessibility scan (axe-core) for the InvoFi frontend.
 *
 * Scans every page listed in issue #175 using @axe-core/playwright and fails CI
 * on serious/critical violations. Known, unavoidable violations are documented
 * in a waiver list (see waivers below).
 *
 * The scan runs alongside the Playwright smoke suite as a separate CI job
 * (see .github/workflows/ci.yml) so it does not block the fast-feedback unit
 * test / lint pass.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  authenticate,
  SMOKE_INVOICE,
  SMOKE_INVOICES,
  SMOKE_LISTINGS,
  mockPositionListings,
} from './fixtures';

/**
 * Known-violation waiver list.
 *
 * Every entry documents a specific rule + CSS selector that we accept as a
 * known limitation. Add entries here only when:
 *   1. The violation is a false positive (axe-core heuristic limitations).
 *   2. The element is from a third-party library we cannot patch.
 *   3. The fix would require a cross-cutting refactor tracked in a separate issue.
 *
 * Format: { ruleId: string, selector: string, reason: string }
 */
const WAIVERS = [
  // The Stellar Wallet Kit dialog injects a <style> block with no text
  // contrast requirements — it's a third-party overlay, not our code.
  // Same for the SEP-10 wallet popup buttons.
  {
    ruleId: 'color-contrast',
    selector: '.wallet-kit-dialog, [data-walletkit]',
    reason: 'Third-party wallet kit dialog — upstream fix tracked in #176',
  },
  // The wallet sign-in buttons are rendered by the Stellar Wallets Kit
  // library and use its own styling.
  {
    ruleId: 'button-name',
    selector: '[data-walletkit] button',
    reason: 'Third-party wallet kit buttons — labelled by the library, not our DOM',
  },
  // The Freighter auth redirect may produce a page with duplicate IDs
  // from the extension's injected content script.
  {
    ruleId: 'duplicate-id',
    selector: '#freighter-*',
    reason: 'Freighter extension injects its own elements — not our DOM',
  },
];

/**
 * Runs axe-core on the current page and checks for violations, excluding
 * known waivers.
 */
async function assertNoAccessibilityViolations(page: any) {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Exclude known waivers
    .options({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
    });

  // Apply each waiver
  for (const waiver of WAIVERS) {
    builder.exclude(waiver.selector);
  }

  const results = await builder.analyze();

  // Filter to only serious/critical violations
  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  // Log all violations for debugging
  if (seriousOrCritical.length > 0) {
    console.log(`\n⚠️  ${seriousOrCritical.length} serious/critical a11y violations found:`);
    for (const v of seriousOrCritical) {
      console.log(`  • ${v.id} (${v.impact}) — ${v.help}`);
      console.log(`    ${v.helpUrl}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`    Target: ${node.target}`);
      }
    }
  }

  expect(seriousOrCritical).toHaveLength(0);
}

// ── Public pages ────────────────────────────────────────────────────────────

test.describe('public page accessibility', () => {
  test('landing page has no serious/critical violations', async ({ page }) => {
    await page.goto('/');
    await assertNoAccessibilityViolations(page);
  });

  test('login page has no serious/critical violations', async ({ page }) => {
    await page.goto('/auth/login');
    await assertNoAccessibilityViolations(page);
  });

  test('register page has no serious/critical violations', async ({ page }) => {
    await page.goto('/auth/register');
    await assertNoAccessibilityViolations(page);
  });

  test('register (lender role) page has no serious/critical violations', async ({ page }) => {
    await page.goto('/auth/register?role=lender');
    await assertNoAccessibilityViolations(page);
  });
});

// ── Authenticated pages ─────────────────────────────────────────────────────

test.describe('authenticated page accessibility', () => {
  test('dashboard page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });
    await page.goto('/dashboard');
    await assertNoAccessibilityViolations(page);
  });

  test('marketplace page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });
    await page.goto('/marketplace');
    await assertNoAccessibilityViolations(page);
  });

  test('marketplace positions page has no serious/critical violations', async ({ page }) => {
    await authenticate(page);
    await mockPositionListings(page, SMOKE_LISTINGS);
    await page.goto('/marketplace/positions');
    await assertNoAccessibilityViolations(page);
  });

  test('invoice detail page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoice: SMOKE_INVOICE });
    await page.goto(`/invoices/${SMOKE_INVOICE.id}`);
    await assertNoAccessibilityViolations(page);
  });

  test('portfolio page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });
    await page.goto('/portfolio');
    await assertNoAccessibilityViolations(page);
  });

  test('settings page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });
    await page.goto('/settings');
    await assertNoAccessibilityViolations(page);
  });

  test('transactions page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });
    await page.goto('/transactions');
    await assertNoAccessibilityViolations(page);
  });

  test('profile page has no serious/critical violations', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });
    await page.goto('/profile');
    await assertNoAccessibilityViolations(page);
  });
});