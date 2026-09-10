'use server';

import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  defaultLocale,
  isLocale,
  negotiateLocale,
  type Locale,
} from './config';

/**
 * The reader's active locale.
 *
 * Precedence: an explicit choice (cookie) beats the browser's
 * `Accept-Language`, which beats English. The middleware normally persists the
 * negotiated value on the first request; re-negotiating here keeps the very
 * first render correct even on paths the middleware skips (static assets
 * aside, that is mainly the case in tests and previews).
 */
export async function getUserLocale(): Promise<Locale> {
  const chosen = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  try {
    return negotiateLocale(headers().get('accept-language'));
  } catch {
    return defaultLocale;
  }
}

/**
 * Persists an explicit language choice. Called from the settings switcher as a
 * server action, so the next render (and every later visit) uses it.
 */
export async function setUserLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  cookies().set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
  });
}
