import { test, expect, type Page } from '@playwright/test';
import { authenticate, mockFreighter, ORIGINATOR } from './fixtures';

/**
 * Wallet-connection contract (ADR-0001 allowlist + the user-initiated
 * connection fix, commit 027c61ca):
 *
 * 1. Connection is USER-INITIATED. Nothing in the app may open a wallet's
 *    auth UI (popup, extension prompt) on page load — not even a "probe".
 * 2. Silent session restore touches exactly ONE wallet: the one persisted in
 *    the last-wallet hint, and only extension wallets whose fetchAddress()
 *    answers without UI (silentRestore flag in lib/approved-wallets.ts).
 * 3. Connecting happens only through the select dialog, and only for the
 *    wallet the user clicked — the other listed wallets are never touched.
 * 4. Disconnect clears the persisted hint, so the next load stays cold.
 *
 * Popups are the observable for (1): bridge/web wallets (Albedo, xBull) open
 * their sign-up window on fetchAddress(), so any forbidden probe would show
 * up as a popup event. Every test collects them and asserts none appeared.
 */

/** Collects popup events for a page — the observable for forbidden probes. */
function trackPopups(page: Page): { popups: Page[] } {
  const popups: Page[] = [];
  page.on('popup', (p) => popups.push(p));
  return { popups };
}

/** The last-wallet hint shape lib/last-wallet.ts persists. */
function lastWalletHint(walletId: string, publicKey: string): string {
  return JSON.stringify({ walletId, publicKey });
}

test.describe('wallet connection is user-initiated', () => {
  test('cold load never connects a wallet and never opens wallet UI', async ({ page }) => {
    // No session, no hint, no wallet mocks — the fully cold first visit.
    const { popups } = trackPopups(page);
    await page.goto('/dashboard');

    // AuthGuard redirects to login, and the header still offers connecting —
    // no wallet was silently attached.
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();

    // Give any misplaced restore loop time to misbehave, then assert the
    // page never opened a wallet popup (the old bug: Albedo/xBull popups on
    // load, one per installed wallet).
    await page.waitForTimeout(3_000);
    expect(popups, 'no wallet UI may open on page load').toHaveLength(0);
  });

  test('a bridge-wallet hint is never silently restored (no popup on load)', async ({ page }) => {
    const { popups } = trackPopups(page);

    // Seed the hint as if the user last chose Albedo — a bridge wallet whose
    // fetchAddress() opens its sign-up window. Restore must skip it entirely.
    await page.addInitScript(
      ([hint]) => window.localStorage.setItem('invofi:last-wallet', hint),
      [lastWalletHint('albedo', ORIGINATOR)] as const,
    );
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();

    await page.waitForTimeout(3_000);
    expect(popups, 'bridge wallets must never be touched without a click').toHaveLength(0);
  });

  test('extension hint restores silently to exactly the chosen wallet', async ({ page }) => {
    const { popups } = trackPopups(page);
    await mockFreighter(page, ORIGINATOR);

    // Extension wallets answer fetchAddress() without UI once access was
    // granted — restoring the freighter hint must stay popup-free.
    await page.addInitScript(
      ([hint]) => window.localStorage.setItem('invofi:last-wallet', hint),
      [lastWalletHint('freighter', ORIGINATOR)] as const,
    );

    // A protected page: session + wallet restore together let the dashboard
    // render with the connected pill in the header.
    await authenticate(page);
    await page.goto('/dashboard');

    // The header shows the connected address (WalletButton formatAddress).
    await expect(page.locator('header').getByText(ORIGINATOR.slice(0, 4))).toBeVisible({
      timeout: 30_000,
    });

    await page.waitForTimeout(2_000);
    expect(popups, 'extension restore must be silent').toHaveLength(0);
  });

  test('dialog connects only the wallet the user clicked, then disconnect clears the hint', async ({
    page,
  }) => {
    const { popups } = trackPopups(page);
    await mockFreighter(page, ORIGINATOR);

    await page.goto('/auth/login');
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Connect Wallet' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible();

    // The user picks exactly one wallet — Freighter. The other rows must not
    // be touched (no popups from Albedo/xBull; their Connect was never
    // clicked and their isInstalled() check is UI-free).
    await dialog.getByRole('button', { name: 'Connect', exact: true }).first().click();

    // Connection lands: the header pill shows the address and the dialog
    // closes.
    await expect(page.locator('header').getByText(ORIGINATOR.slice(0, 4))).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog).not.toBeVisible();
    expect(popups, 'only the chosen wallet may open UI (here: none — silent extension)').toHaveLength(0);

    // The chosen wallet is persisted as the hint for the next visit.
    const stored = await page.evaluate(() => window.localStorage.getItem('invofi:last-wallet'));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ walletId: 'freighter' });

    // Disconnect: back to the cold state — UI resets and the hint is gone so
    // the next page load cannot silently re-attach.
    await page.locator('header').getByTitle('Disconnect wallet').click();
    await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();
    await expect(page.evaluate(() => window.localStorage.getItem('invofi:last-wallet'))).resolves.toBeNull();
  });
});
