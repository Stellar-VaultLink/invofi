import { afterEach, describe, expect, it } from 'vitest';
import {
  buildConnectSrc,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from '../security-headers.mjs';

describe('security headers (issue #148)', () => {
  const ENV_KEYS = [
    'NODE_ENV',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_RPC_URL',
    'NEXT_PUBLIC_HORIZON_URL',
    'NEXT_PUBLIC_WS_URL',
  ];
  const originalEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('sends the baseline browser protections', () => {
    const headers = Object.fromEntries(
      buildSecurityHeaders({ includeHsts: true }).map(h => [h.key, h.value]),
    );

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(headers['Content-Security-Policy']).toBeTruthy();
  });

  it('omits HSTS outside production so local HTTP testnet is not pinned', () => {
    const keys = buildSecurityHeaders({ includeHsts: false }).map(h => h.key);
    expect(keys).not.toContain('Strict-Transport-Security');
  });

  it('defaults HSTS to production-only', () => {
    process.env.NODE_ENV = 'development';
    expect(
      buildSecurityHeaders().some(h => h.key === 'Strict-Transport-Security'),
    ).toBe(false);

    process.env.NODE_ENV = 'production';
    expect(
      buildSecurityHeaders().some(h => h.key === 'Strict-Transport-Security'),
    ).toBe(true);
  });

  it('keeps a self-only default and frame-ancestors none', () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
  });

  it('allows Next.js inline scripts/styles plus Freighter/LOBSTR extension injection', () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline' chrome-extension: moz-extension:/);
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).toMatch(/frame-src 'self' chrome-extension: moz-extension:/);
  });

  it('allowlists known RPC, Horizon, Friendbot, and CoinGecko hosts', () => {
    const connect = buildConnectSrc();
    expect(connect).toContain('https://soroban-testnet.stellar.org');
    expect(connect).toContain('https://horizon-testnet.stellar.org');
    expect(connect).toContain('https://soroban-rpc.stellar.org');
    expect(connect).toContain('https://horizon.stellar.org');
    expect(connect).toContain('https://friendbot.stellar.org');
    expect(connect).toContain('https://api.coingecko.com');
    expect(connect).toContain('chrome-extension:');
    expect(connect).toContain('moz-extension:');
  });

  it('adds deployment-specific Supabase, RPC, Horizon, and websocket origins', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcd.supabase.co';
    process.env.NEXT_PUBLIC_RPC_URL = 'https://rpc.example.test';
    process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon.example.test';
    process.env.NEXT_PUBLIC_WS_URL = 'wss://relay.invofi.dev/live';

    const connect = buildConnectSrc();
    expect(connect).toContain('https://abcd.supabase.co');
    expect(connect).toContain('wss://abcd.supabase.co');
    expect(connect).toContain('https://rpc.example.test');
    expect(connect).toContain('https://horizon.example.test');
    expect(connect).toContain('wss://relay.invofi.dev');
  });
});
