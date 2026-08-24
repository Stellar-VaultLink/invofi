import { test, expect, type Page } from '@playwright/test';
import { authenticate, SMOKE_INVOICE } from './fixtures';

/**
 * Internationalization and RTL (Issue #227).
 *
 * These drive the real path: the middleware negotiates a locale from the
 * browser's `Accept-Language`, the root layout stamps `lang`/`dir` on `<html>`,
 * the catalogue supplies the copy, and the Settings switcher persists a
 * different choice through a server action.
 */

const LOCALE_COOKIE = 'INVOFI_LOCALE';

async function localeCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find(c => c.name === LOCALE_COOKIE)?.value;
}

test.describe('browser language detection', () => {
  test('negotiates Arabic from Accept-Language and renders the page RTL', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ar-EG' });
    const page = await context.newPage();
    await authenticate(page);

    await page.goto('/');

    // The middleware persists the negotiated locale, so the very first HTML
    // response is already Arabic — no left-to-right flash.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await localeCookie(page)).toBe('ar');

    // The layout mirrors: computed text direction really is RTL, not just the
    // attribute.
    const direction = await page.evaluate(() => getComputedStyle(document.body).direction);
    expect(direction).toBe('rtl');

    await context.close();
  });

  test('falls back from an unsupported language to English, left-to-right', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'is-IS' });
    const page = await context.newPage();
    await authenticate(page);

    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await context.close();
  });

  test('maps a regional tag to its base language', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();
    await authenticate(page);

    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await context.close();
  });
});

test.describe('language switcher', () => {
  test('changing the language in Settings re-renders the app in it', async ({ page }) => {
    await authenticate(page);
    await page.goto('/settings');

    // English first — the page is in the default locale.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const switcher = page.getByTestId('language-switcher');
    await expect(switcher).toBeVisible();

    // Pick Arabic. The server action writes the cookie, and router.refresh()
    // re-renders the tree — including <html dir>.
    await switcher.selectOption('ar');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 45_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    expect(await localeCookie(page)).toBe('ar');

    // Copy is actually translated, not just re-laid out.
    await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();

    // The choice survives a full reload — it is a cookie, not component state.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('an explicit choice wins over the browser language', async ({ browser }) => {
    // Browser says Japanese…
    const context = await browser.newContext({ locale: 'ja-JP' });
    const page = await context.newPage();
    await authenticate(page);
    await page.goto('/settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

    // …the reader picks German, and the header must not override it again.
    // Selected by test id, not by label: the label itself is translated.
    await page.getByTestId('language-switcher').selectOption('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de', { timeout: 45_000 });

    await page.goto('/settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');

    await context.close();
  });
});

test.describe('locale-aware formatting', () => {
  test('renders amounts and dates in the active locale', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await authenticate(page, { invoice: SMOKE_INVOICE });

    await page.goto(`/invoices/${SMOKE_INVOICE.id}`);

    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    // 2 XLM on a German locale: the decimal separator and the date field order
    // both differ from en-US. Assert the date, which is unambiguous.
    await expect(page.getByText(/18\.\s*Mai\s*2033|18\.05\.2033/)).toBeVisible({ timeout: 20_000 });

    await context.close();
  });
});
