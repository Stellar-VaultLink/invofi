import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import createNextIntlPlugin from 'next-intl/plugin';
import { buildSecurityHeaders } from './security-headers.mjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
      // The Ledger hardware-wallet module (issue #99) pulls in
      // @ledgerhq/hw-transport-webusb, which references the Node `Buffer`
      // global. Polyfill it in the browser bundle so the module loads and
      // can sign from a device without a server-side Buffer.
      config.resolve.fallback.buffer = require.resolve('buffer/');
      config.plugins.push(
        new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
      );
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
