/**
 * Locale registry for InvoFi (issue #227).
 *
 * One source of truth: adding a language means adding its tag here, its
 * display names below, and a `messages/<tag>.json` file. Nothing else in the
 * app enumerates locales.
 *
 * This module is imported by middleware (Edge runtime), server components and
 * client components alike, so it must stay dependency-free and side-effect
 * free.
 */

export const locales = [
  'en',
  'ar',
  'de',
  'es',
  'fa',
  'fr',
  'he',
  'ja',
  'ko',
  'pt',
  'tr',
  'zh',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/**
 * Right-to-left scripts. These drive `<html dir>`, which is what actually
 * mirrors the layout — see `docs/i18n.md` for why CSS logical properties are
 * required for that mirroring to be correct.
 */
export const rtlLocales: readonly Locale[] = ['ar', 'fa', 'he'];

/** Cookie holding the reader's chosen locale. Readable by the Edge middleware. */
export const LOCALE_COOKIE = 'INVOFI_LOCALE';

/** One year — a language choice should outlive a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Display names. `native` is what the switcher shows (a reader looking for
 * their language recognises it in their own script, not in English);
 * `english` is the accessible label and the sort key.
 */
export const localeNames: Record<Locale, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  ar: { native: 'العربية', english: 'Arabic' },
  de: { native: 'Deutsch', english: 'German' },
  es: { native: 'Español', english: 'Spanish' },
  fa: { native: 'فارسی', english: 'Persian' },
  fr: { native: 'Français', english: 'French' },
  he: { native: 'עברית', english: 'Hebrew' },
  ja: { native: '日本語', english: 'Japanese' },
  ko: { native: '한국어', english: 'Korean' },
  pt: { native: 'Português', english: 'Portuguese' },
  tr: { native: 'Türkçe', english: 'Turkish' },
  zh: { native: '中文', english: 'Chinese' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Accepts a bare `string` because next-intl's `useLocale()`/`getLocale()`
 * are typed loosely; an unrecognised tag is treated as left-to-right.
 */
export function isRtl(locale: string): boolean {
  return isLocale(locale) && rtlLocales.includes(locale);
}

/** The value for `<html dir>`. */
export function dirFor(locale: string): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/**
 * Picks the best supported locale from an `Accept-Language` header.
 *
 * Implements the parts of RFC 9110 §12.5.4 that matter here: q-values order
 * the candidates, `*` is ignored, and a regional tag falls back to its base
 * language (`pt-BR` → `pt`, `zh-Hans-CN` → `zh`) so readers are not dropped to
 * English just because they sent a region. Returns `defaultLocale` when the
 * header is absent, malformed, or lists nothing we support.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const candidates = acceptLanguage
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map(p => p.trim())
        .find(p => p.startsWith('q='))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter(c => c.tag && c.tag !== '*' && c.quality > 0)
    // Stable sort by descending quality: equal-q tags keep header order, which
    // is the reader's own preference order.
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of candidates) {
    if (isLocale(tag)) return tag;
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }

  return defaultLocale;
}
