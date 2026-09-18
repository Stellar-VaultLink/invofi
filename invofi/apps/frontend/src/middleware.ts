import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  negotiateLocale,
} from '@/i18n/config';

/**
 * Middleware responsibilities after the wallet-first auth migration (#376,
 * ADR-0008):
 *
 *  1. **Rate limiting** — auth/wallet-sign endpoints are throttled at the
 *     edge BEFORE they reach a Route Handler (unchanged behavior).
 *  2. **Locale negotiation** — write the best `Accept-Language` match to the
 *     locale cookie on first visit (unchanged behavior, issue #227).
 *
 *  **Session refresh is NOT done here anymore.** The new auth backend uses
 *  Auth.js database sessions (ADR-0008): resolving or refreshing a session
 *  requires a DB round-trip, which edge middleware cannot perform. Instead
 *  `auth()` runs in the Node runtime — RSC pages and route handlers — where
 *  Auth.js applies the session's `updateAge` sliding refresh. Every guarded
 *  surface resolves its session server-side or via `/api/auth/session`; see
 *  docs/05-authentication.md, "Session resolution".
 */
const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Paths that are throttled. These cover the SEP-10 wallet-sign endpoints
 * (`/api/auth/sep10/*`, `/api/auth/callback/sep10`) and the auth pages
 * (`/auth/login`, `/auth/register`) — the surfaces where a burst of requests
 * could be abused (challenge spam, credential stuffing).
 */
const RATE_LIMITED_PATHS = [
  '/api/auth/sep10/challenge',
  '/api/auth/sep10/verify',
  '/api/auth/callback/sep10',
  '/auth/login',
  '/auth/register',
];

function isRateLimitedPath(pathname: string): boolean {
  return RATE_LIMITED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isRateLimitedPath(pathname)) {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`middleware:${pathname}:${clientIp}`, {
      limit: AUTH_RATE_LIMIT,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      console.warn(`Rate limit exceeded for ${pathname} from IP ${clientIp}`);
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
        },
      );
    }
  }

  const response = NextResponse.next();
  persistNegotiatedLocale(request, response);
  return response;
}

/**
 * Browser-language auto-detection (issue #227).
 *
 * On a reader's first request there is no locale cookie, so the best supported
 * match for their `Accept-Language` header is written to one. Doing it here
 * rather than in a Server Component means the very first HTML response already
 * carries the right `lang`/`dir`, so an Arabic reader never sees a flash of
 * left-to-right English.
 *
 * An existing cookie is never overwritten: once a reader has chosen a language
 * in Settings, their browser's header must not silently override it.
 */
function persistNegotiatedLocale(request: NextRequest, response: NextResponse): void {
  if (isLocale(request.cookies.get(LOCALE_COOKIE)?.value)) return;

  response.cookies.set(LOCALE_COOKIE, negotiateLocale(request.headers.get('accept-language')), {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
  });
}

export const config = {
  matcher: [
    // Skip static files, Next.js internals, and Sentry tunnel route
    '/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
