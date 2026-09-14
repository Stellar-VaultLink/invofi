import { test, expect } from '@playwright/test';
import { authenticate, SMOKE_INVOICE } from './fixtures';

test.describe('print view', () => {
  test('opens the printable invoice document', async ({ page }) => {
    // The print view calls window.print() once data loads — stub it so the
    // headless browser never attempts a real print dialog.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    await authenticate(page, { invoice: SMOKE_INVOICE });

    await page.goto(`/invoices/${SMOKE_INVOICE.id}/print`);

    await expect(page.getByText('INVOICE', { exact: true }).first()).toBeVisible();
    // The id appears in both the metadata grid and the footer.
    await expect(page.getByText(SMOKE_INVOICE.id, { exact: true }).first()).toBeVisible();
    // The print view formats the stroop amount with 2-decimal precision.
    await expect(page.getByText('2.00 XLM', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(SMOKE_INVOICE.originator).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Print \/ Save as PDF/ }),
    ).toBeVisible();
  });
});
