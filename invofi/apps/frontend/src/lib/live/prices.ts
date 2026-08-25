// ── USD pricing (issue #221) ─────────────────────────────────────────────────
// The live dashboard shows every position value in USD. USDC is a stablecoin
// (peg ≈ $1). XLM is priced from a light, cached source: an env override wins,
// otherwise CoinGecko's public endpoint is tried, and both fall back to the
// override's default so the dashboard still renders offline.

import type { Currency } from '@invofi/sdk';
import { STROOPS_PER_XLM } from '@/lib/constants';

const XLM_USD_CACHE_TTL_MS = 5 * 60_000;

const ENV_XLM_USD_PRICE = Number(process.env.NEXT_PUBLIC_XLM_USD_PRICE ?? '');
const DEFAULT_XLM_USD_PRICE = 1;

let cachedXlmUsd: number | null = null;
let cachedXlmUsdAt = 0;

/** Which source produced the currently-cached XLM price (issue #182). */
let lastXlmUsdSource: 'coingecko' | 'env' | 'default' = 'default';

/** Best known XLM price, or the fallback when nothing is cached yet. */
function xlmUsdPrice(): number {
  if (cachedXlmUsd !== null) return cachedXlmUsd;
  if (Number.isFinite(ENV_XLM_USD_PRICE) && ENV_XLM_USD_PRICE > 0) return ENV_XLM_USD_PRICE;
  return DEFAULT_XLM_USD_PRICE;
}

/**
 * USD price for a currency. USDC is treated as $1; XLM uses the cached price
 * (see {@link refreshXlmUsdPrice}).
 */
export function usdPriceFor(currency: Currency): number {
  return currency === 'USDC' ? 1 : xlmUsdPrice();
}

/** Convert stroops to USD at the current price. */
export function stroopsToUsd(stroops: bigint, currency: Currency): number {
  return (Number(stroops) / STROOPS_PER_XLM) * usdPriceFor(currency);
}

/**
 * Refresh the cached XLM/USD price. Tries the CoinGecko public endpoint and
 * falls back to the `NEXT_PUBLIC_XLM_USD_PRICE` env override, then the
 * built-in default. Never rejects — a failure just keeps the last price.
 */
export async function refreshXlmUsdPrice(): Promise<number> {
  if (cachedXlmUsd !== null && Date.now() - cachedXlmUsdAt < XLM_USD_CACHE_TTL_MS) {
    return cachedXlmUsd;
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
    );
    if (res.ok) {
      const json = (await res.json()) as { stellar?: { usd?: number } };
      const price = Number(json?.stellar?.usd);
      if (Number.isFinite(price) && price > 0) {
        cachedXlmUsd = price;
        cachedXlmUsdAt = Date.now();
        lastXlmUsdSource = 'coingecko';
        return price;
      }
    }
  } catch {
    // Network unavailable — fall through to the override / default.
  }
  cachedXlmUsd = xlmUsdPrice();
  cachedXlmUsdAt = Date.now();
  lastXlmUsdSource =
    Number.isFinite(ENV_XLM_USD_PRICE) && ENV_XLM_USD_PRICE > 0 ? 'env' : 'default';
  return cachedXlmUsd;
}

/** Test hook — pin the cached XLM price without a network call. */
export function __setXlmUsdPriceForTests(price: number | null): void {
  cachedXlmUsd = price;
  cachedXlmUsdAt = price === null ? 0 : Date.now();
  lastXlmUsdSource =
    price === null ? 'default' : 'coingecko';
}

/**
 * Snapshot of the reference-rate state for UI labeling (issue #182): the
 * XLM/USD price actually in use, which source produced it, and when it was
 * resolved. Portfolio totals derived from it are marked approximate.
 */
export function getXlmUsdInfo(): {
  price: number;
  source: 'coingecko' | 'env' | 'default';
  updatedAt: number;
} {
  return {
    price: xlmUsdPrice(),
    source: lastXlmUsdSource,
    updatedAt: cachedXlmUsdAt,
  };
}