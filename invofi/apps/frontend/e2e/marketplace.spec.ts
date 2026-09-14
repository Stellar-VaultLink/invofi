import { test, expect } from '@playwright/test';
import { authenticate, SMOKE_INVOICES } from './fixtures';

test.describe('marketplace', () => {
  test('loads invoices for an authenticated lender', async ({ page }) => {
    await authenticate(page, { invoices: SMOKE_INVOICES });

    await page.goto('/marketplace');

    await expect(
      page.getByRole('heading', { name: 'Invoice Marketplace' }),
    ).toBeVisible();

    // The page opens on the "Suggested for me" ranked view, which needs a
    // preferences row to rank against — the mirror here is empty, so switch
    // to the traditional "Browse all" list that renders the mirror rows.
    await page.getByRole('button', { name: 'Browse all', exact: true }).click();

    // Each mirrored invoice renders a card with its amount and a Make Offer CTA.
    // Amounts are stroop strings in the mirror; cards render human units.
    await expect(page.getByText(SMOKE_INVOICES[0].id)).toBeVisible();
    await expect(page.getByText('10,000.00 XLM')).toBeVisible();
    await expect(page.getByText('2,500,000.00 USDC')).toBeVisible();
    await expect(page.getByRole('link', { name: /Make Offer/ })).toHaveCount(
      SMOKE_INVOICES.length,
    );
  });
});
