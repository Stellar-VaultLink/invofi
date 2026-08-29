import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  negotiateLocale,
} from '@/i18n/config';

/**
 * Rate-limit config for auth and wallet-sign endpoints (roadmap v0.4).
 *
 * Applied at the Vercel middleware layer so abuse is throttled *before* it
 * reaches a Route Handler or the Supabase auth backend. Uses the in-memory
 * token-bucket limiter from `lib/rate-limit.ts` (fixed-window, per-IP).
 *
 * Tune via the constants below — there is intentionally no env-var indirection
 * so the limits are visible and reviewable in one place.
 */
const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Paths that are throttled. These cover both the SEP-10 wallet-sign endpoints
 * (`/api/auth/sep10/*`) and the email/password auth pages (`/auth/login`,
 * `/auth/register`) — the two surfaces where a burst of requests could be
 * abused (credential stuffing, challenge spam, etc.).
 */
const RATE_LIMITED_PATHS = [
  '/api/auth/sep10/challenge',
  '/api/auth/sep10/verify',
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

  const response = await updateSession(request);
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
