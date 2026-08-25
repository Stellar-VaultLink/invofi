import { afterEach, describe, expect, it, vi } from 'vitest';
import { __setXlmUsdPriceForTests, getXlmUsdInfo, refreshXlmUsdPrice, stroopsToUsd, usdPriceFor } from './prices';

describe('prices', () => {
  afterEach(() => {
    __setXlmUsdPriceForTests(null);
    vi.unstubAllGlobals();
  });

  it('treats USDC as a $1 stablecoin', () => {
    expect(usdPriceFor('USDC')).toBe(1);
  });

  it('uses the cached XLM price once set, defaulting to $1 otherwise', () => {
    __setXlmUsdPriceForTests(0.5);
    expect(usdPriceFor('XLM')).toBe(0.5);
    expect(stroopsToUsd(10_000_000n, 'XLM')).toBeCloseTo(0.5, 5);

    __setXlmUsdPriceForTests(null);
    expect(usdPriceFor('XLM')).toBe(1);
  });

  it('falls back without rejecting when the live price feed is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await expect(refreshXlmUsdPrice()).resolves.toBeGreaterThan(0);
    expect(usdPriceFor('XLM')).toBeGreaterThan(0);
  });

  it('uses a fetched price when the feed responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ stellar: { usd: 0.42 } }), { status: 200 })),
    );
    await expect(refreshXlmUsdPrice()).resolves.toBeCloseTo(0.42, 5);
    expect(usdPriceFor('XLM')).toBeCloseTo(0.42, 5);
  });

  it('getXlmUsdInfo reports the default source when nothing is pinned', () => {
    __setXlmUsdPriceForTests(null);
    const info = getXlmUsdInfo();
    expect(info.price).toBeGreaterThan(0);
    expect(['default', 'env']).toContain(info.source);
    expect(info.updatedAt).toBe(0);
  });

  it('getXlmUsdInfo tracks a CoinGecko-fetched price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ stellar: { usd: 0.42 } }), { status: 200 })),
    );
    await refreshXlmUsdPrice();
    const info = getXlmUsdInfo();
    expect(info.price).toBeCloseTo(0.42, 5);
    expect(info.source).toBe('coingecko');
    expect(info.updatedAt).toBeGreaterThan(0);
  });
});