import { getRequestConfig } from 'next-intl/server';
import { getUserLocale } from './locale';
import { loadMessages } from './messages';

/**
 * next-intl request config (issue #227).
 *
 * The app deliberately runs *without* locale-prefixed routes: language is a
 * reader preference held in a cookie, not part of the URL. See `docs/i18n.md`
 * for the reasoning — in short, every app route here is wallet/auth-gated, the
 * Supabase session middleware and the sitemap are keyed on unprefixed paths,
 * and duplicating every route under `[locale]` would fork all existing deep
 * links for no SEO gain.
 */
export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: await loadMessages(locale),
    formats: {
      dateTime: {
        short: { dateStyle: 'medium' },
        long: { dateStyle: 'long', timeStyle: 'short' },
      },
    },
  };
});
