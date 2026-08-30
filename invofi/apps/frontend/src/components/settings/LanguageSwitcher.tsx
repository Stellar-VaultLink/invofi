'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Loader2 } from 'lucide-react';
import { setUserLocale } from '@/i18n/locale';
import { dirFor, localeNames, locales, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

/**
 * Language picker (issue #227).
 *
 * Writing the choice is a server action, so the cookie is set on a real
 * response and the *next server render* — not just the client — uses the new
 * locale. `router.refresh()` re-fetches the RSC payload so the whole tree,
 * including `<html lang>` and `<html dir>`, updates without a full reload.
 *
 * A native `<select>` is used deliberately: the browser renders each option in
 * its own script and direction, and it is keyboard- and screen-reader-native
 * without shipping another dropdown primitive.
 */
export function LanguageSwitcher() {
  const t = useTranslations('Settings.language');
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onChange = (value: string) => {
    startTransition(async () => {
      await setUserLocale(value as Locale);
      router.refresh();
    });
  };

  // Sorted by English name so the list order is stable across languages.
  const options = [...locales].sort((a, b) =>
    localeNames[a].english.localeCompare(localeNames[b].english, 'en'),
  );

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Globe className="h-4 w-4 text-gray-400 shrink-0 dark:text-gray-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('label')}</p>
          <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{t('hint')}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" aria-hidden />}
        <select
          // Stable hook for e2e: the accessible name is translated, so tests
          // cannot select on it once the language changes.
          data-testid="language-switcher"
          aria-label={t('label')}
          value={activeLocale}
          disabled={isPending}
          onChange={event => onChange(event.target.value)}
          className={cn(
            'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {options.map(locale => (
            <option key={locale} value={locale} lang={locale} dir={dirFor(locale)}>
              {localeNames[locale].native} — {localeNames[locale].english}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
