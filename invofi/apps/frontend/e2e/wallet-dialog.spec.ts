import { test, expect } from '@playwright/test';

test.describe('wallet connect dialog', () => {
  test('lists the approved Freighter, LOBSTR, and Albedo wallets', async ({ page }) => {
    await page.goto('/auth/login');

    // The navbar also renders a "Connect Wallet" button — target the login
    // card's copy inside <main>.
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Connect Wallet' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible();
    await expect(dialog.getByText('Freighter', { exact: true })).toBeVisible();
    await expect(dialog.getByText('LOBSTR', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Albedo', { exact: true })).toBeVisible();
  });
});