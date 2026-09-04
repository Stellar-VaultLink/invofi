import { test, expect } from '@playwright/test';

test.describe('authentication pages', () => {
  test('login renders wallet and email sign-in', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    // Wallet sign-in card (opens the wallet-select dialog) plus the email form.
    await expect(page.getByRole('heading', { name: 'Sign in with Wallet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('register renders the role picker and form', async ({ page }) => {
    await page.goto('/auth/register');

    await expect(
      page.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible();
    await expect(page.getByText('Business', { exact: true })).toBeVisible();
    await expect(page.getByText('Lender / Investor', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Full name / Company name')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create Account as Business' }),
    ).toBeVisible();
  });

  test('register preselects the lender role from the query param', async ({ page }) => {
    await page.goto('/auth/register?role=lender');

    await expect(
      page.getByRole('button', { name: 'Create Account as Lender' }),
    ).toBeVisible();
  });
});
