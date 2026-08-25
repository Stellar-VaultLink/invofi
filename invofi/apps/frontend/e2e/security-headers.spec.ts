import { test, expect, type Page } from '@playwright/test';

/**
 * Runtime check that next.config.mjs actually serves the #148 header baseline
 * on document responses. Freighter/LOBSTR cannot be signed against in CI
 * (no extension), so the CSP assertions below lock the wallet-injection
 * allowlist that those extensions need.
 */

const ROUTES = ['/', '/auth/login', '/marketplace'];

const REQUIRED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
} as const;

async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Content Security Policy|CSP/i.test(text)) violations.push(text);
  });
  page.on('pageerror', err => {
    if (/Content Security Policy|CSP/i.test(err.message)) violations.push(err.message);
  });
  return violations;
}

test.describe('security headers', () => {
  for (const route of ROUTES) {
    test(`serves the baseline on ${route}`, async ({ page }) => {
      const violations = await collectCspViolations(page);
      const response = await page.goto(route);
      expect(response, `no response for ${route}`).toBeTruthy();

      const headers = response!.headers();
      for (const [name, value] of Object.entries(REQUIRED_HEADERS)) {
        expect(headers[name], `${name} on ${route}`).toBe(value);
      }

      const csp = headers['content-security-policy'] ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline' chrome-extension: moz-extension:");
      expect(csp).toContain('https://soroban-testnet.stellar.org');
      expect(csp).toContain('https://horizon-testnet.stellar.org');
      expect(csp).toContain('https://e2e.supabase.co');
      expect(csp).toContain('wss://e2e.supabase.co');

      // Dev (`next dev`) is HTTP, so HSTS is intentionally omitted.
      expect(headers['strict-transport-security']).toBeUndefined();

      await page.waitForLoadState('domcontentloaded');
      expect(violations, `CSP console errors on ${route}`).toEqual([]);
    });
  }
});
