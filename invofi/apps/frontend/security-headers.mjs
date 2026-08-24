/**
 * Browser security headers (issues #148, #186).
 *
 * Strict-but-practical CSP: `default-src 'self'` plus an explicit allowlist
 * for the origins the app must talk to (Stellar RPC, Horizon, Friendbot,
 * Supabase, the optional live-dashboard websocket, CoinGecko). External
 * script/style/img/font origins stay blocked — that is the second line of
 * defense against XSS.
 *
 * `script-src`/`style-src` include 'unsafe-inline' because the Next.js App
 * Router ships its RSC bootstrap as inline <script> tags in the production
 * HTML, and next/font injects inline @font-face styles. A nonce-based policy
 * is the stricter upgrade path, but nonces must be generated per-request in
 * middleware and cannot live in a static `headers()` block.
 *
 * Freighter and LOBSTR inject a page script from `chrome-extension:` /
 * `moz-extension:` to expose their signing APIs. Those schemes are allowlisted
 * on `script-src`, `connect-src`, and `frame-src` so wallet connect/sign is
 * not broken by CSP (issue #148). Do not tighten this without re-testing
 * signing in both extensions.
 *
 * `connect-src` is built from the same env vars the app uses at runtime
 * (`src/lib/constants.ts`, `src/lib/live/config.ts`), with matching defaults,
 * so a deployment that only sets NEXT_PUBLIC_* keeps working without CSP edits.
 *
 * HSTS is production-only. Local `next dev` over HTTP must not be HSTS-pinned,
 * and the issue marks HSTS optional on testnet.
 */

function originOf(url) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function wsOriginOf(url) {
  const origin = originOf(url);
  if (!origin) return '';
  if (origin.startsWith('https:')) return `wss:${origin.slice('https:'.length)}`;
  if (origin.startsWith('http:')) return `ws:${origin.slice('http:'.length)}`;
  return origin;
}

/** Known Stellar HTTP origins, including both testnet and mainnet defaults. */
const KNOWN_STELLAR_ORIGINS = [
  'https://soroban-testnet.stellar.org',
  'https://horizon-testnet.stellar.org',
  'https://soroban-rpc.stellar.org',
  'https://horizon.stellar.org',
  'https://friendbot.stellar.org',
];

/** Wallet extension schemes — Freighter (Chrome) and LOBSTR (Chrome/Firefox). */
const WALLET_EXTENSION_SOURCES = ['chrome-extension:', 'moz-extension:'];

export function buildConnectSrc() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
  const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? '';

  const origins = new Set([
    "'self'",
    ...WALLET_EXTENSION_SOURCES,
    ...KNOWN_STELLAR_ORIGINS,
    originOf(rpcUrl),
    originOf(horizonUrl),
    originOf(supabaseUrl),
    wsOriginOf(supabaseUrl),
    originOf(wsUrl),
    wsOriginOf(wsUrl),
    // Live dashboard XLM/USD feed (src/lib/live/prices.ts). Failures fall
    // back to an env override, but blocking the host still produces a CSP
    // console error on every portfolio load.
    'https://api.coingecko.com',
  ]);
  return [...origins].filter(Boolean).join(' ');
}

/**
 * `next dev` compiles modules with an eval-based devtool, so the dev server's
 * own bootstrap is blocked outright by a policy without 'unsafe-eval' — the
 * app renders a bare shell and every client component dies. Production builds
 * contain no eval, so the allowance is scoped to development only and the
 * shipped policy is unchanged.
 *
 * @param {{ allowEval?: boolean }} [options]
 */
export function buildContentSecurityPolicy({
  allowEval = process.env.NODE_ENV === 'development',
} = {}) {
  const scriptSrc = [
    "script-src 'self' 'unsafe-inline'",
    WALLET_EXTENSION_SOURCES.join(' '),
    ...(allowEval ? ["'unsafe-eval'"] : []),
  ].join(' ');
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${buildConnectSrc()}`,
    `frame-src 'self' ${WALLET_EXTENSION_SOURCES.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * @param {{ includeHsts?: boolean, allowEval?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function buildSecurityHeaders({
  includeHsts = process.env.NODE_ENV === 'production',
  allowEval = process.env.NODE_ENV === 'development',
} = {}) {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy({ allowEval }) },
  ];
  if (includeHsts) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }
  return headers;
}
