import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';
import { buildSecurityHeaders } from './security-headers.mjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
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
