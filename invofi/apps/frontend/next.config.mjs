import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Content Security Policy (issue #186).
 *
 * Strict-but-practical: `default-src 'self'` with an explicit allowlist for
 * the few origins the app must talk to (Stellar RPC, Horizon, Friendbot,
 * Supabase). External script/style/img/font origins are all blocked — that is
 * the second line of defense against XSS that this policy exists to provide.
 *
 * `script-src`/`style-src` include 'unsafe-inline' because the Next.js App
 * Router ships its RSC bootstrap as inline <script> tags in the production
 * HTML (verified against the built output), and next/font injects inline
 * @font-face styles. A nonce-based policy is the stricter upgrade path, but
 * nonces must be generated per-request in middleware and can't live in a
 * static `headers()` block — out of scope here per the issue ("Don't
 * re-architect"). Inline scripts are still limited to same-origin because
 * 'unsafe-inline' does not weaken `script-src 'self'` for *external* scripts.
 *
 * `connect-src` is built from the same env vars the app uses at runtime
 * (src/lib/constants.ts), with matching defaults, so a deployment that only
 * sets NEXT_PUBLIC_* keeps working without CSP edits.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
// Friendbot is testnet-only but harmless to allow on mainnet; the app itself
// refuses to call it outside testnet (src/lib/horizon.ts).
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

const connectSrc = [
  "'self'",
  RPC_URL,
  HORIZON_URL,
  FRIENDBOT_URL,
  ...(SUPABASE_URL ? [SUPABASE_URL] : []),
].join(' ');

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: CONTENT_SECURITY_POLICY,
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };
    }
    // Task 15: @invofi/sdk is consumed from source via tsconfig paths, so its
    // dependencies must resolve to THIS app's copy (the SDK's own
    // node_modules isn't installed in CI). Pin them for webpack too.
    // `idb` (Task 218) is the offline-cache module's only other bare import.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@stellar/stellar-sdk': path.resolve(__dirname, 'node_modules/@stellar/stellar-sdk'),
      idb: path.resolve(__dirname, 'node_modules/idb'),
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
