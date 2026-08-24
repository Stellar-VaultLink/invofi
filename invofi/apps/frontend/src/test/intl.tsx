import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import messages from '../../messages/en.json';
import { defaultLocale } from '@/i18n/config';

/**
 * Renders a component inside the i18n provider (issue #227).
 *
 * Components that call `useTranslations()` throw without a provider, so every
 * component test needs one. Using the real `messages/en.json` rather than a
 * stub means these tests also fail if a key is renamed or removed from the
 * catalogue without the component being updated.
 */
export function renderWithIntl(ui: ReactElement, options?: RenderOptions): RenderResult {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={defaultLocale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { renderWithIntl as render };
