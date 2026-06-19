import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // stellar-sdk ships a browser-compatible build. We only need to tell
  // webpack to skip the Node.js built-ins it doesn't need in the browser.
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
    return config;
  },
};

export default nextConfig;
