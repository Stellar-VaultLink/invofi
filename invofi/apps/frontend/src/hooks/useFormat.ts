'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import {
  daysUntil,
  formatAddress,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeDays,
} from '@/lib/intl';

/**
 * Binds the reader's active locale to the formatters in `src/lib/intl.ts`.
 *
 * Components should call this rather than importing the pure functions
 * directly, so a language change re-renders every amount and date without any
 * component having to know the locale itself.
 */
export function useFormat() {
  const locale = useLocale();

  return useMemo(
    () => ({
      locale,
      currency: (
        stroops: bigint | number | string | null | undefined,
        code: string,
        options?: { maximumFractionDigits?: number },
      ) => formatCurrency(stroops, code, locale, options),
      number: (value: number | bigint | string | null | undefined, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      percent: (basisPoints: number | bigint | string | null | undefined) =>
        formatPercent(basisPoints, locale),
      date: (timestamp: number | bigint | string | null | undefined, options?: Intl.DateTimeFormatOptions) =>
        formatDate(timestamp, locale, options),
      dateTime: (timestamp: number | bigint | string | null | undefined) =>
        formatDateTime(timestamp, locale),
      relativeDays: (days: number) => formatRelativeDays(days, locale),
      daysUntil,
      address: formatAddress,
    }),
    [locale],
  );
}
