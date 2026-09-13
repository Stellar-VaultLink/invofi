'use client';

import { Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { DEFAULT_DISPLAY_CURRENCY_STORAGE_KEY } from '@/lib/formatters';
import { CURRENCIES } from '@/lib/constants';
import type { Currency } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Default display currency switcher (preference setting).
 *
 * Persists the preferred currency to localStorage via `useLocalStorage` and provides
 * a native `<select>` dropdown for choosing between supported currencies (XLM, USDC).
 * The shared formatters use this choice as a fallback when no explicit currency is given.
 */
export function CurrencySwitcher() {
  const t = useTranslations('Settings.currency');
  const [currency, setCurrency] = useLocalStorage<Currency>(
    DEFAULT_DISPLAY_CURRENCY_STORAGE_KEY,
    'XLM',
  );

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Coins className="h-4 w-4 text-gray-400 shrink-0 dark:text-gray-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('label')}</p>
          <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{t('hint')}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          data-testid="currency-switcher"
          aria-label={t('label')}
          value={currency}
          onChange={event => setCurrency(event.target.value as Currency)}
          className={cn(
            'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {CURRENCIES.map(curr => (
            <option key={curr} value={curr}>
              {curr}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
