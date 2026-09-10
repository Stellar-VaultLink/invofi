import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENCIES,
  EXPLORER_BASE,
  GRACE_PERIOD_SECS,
  STELLAR_NETWORK,
  STROOPS_PER_XLM,
  XLM_DECIMALS,
  explorerAccountUrl,
  explorerContractUrl,
  explorerTxUrl,
} from './constants';

describe('protocol constants', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  });

  it('keeps Stellar unit conversion internally consistent', () => {
    expect(STROOPS_PER_XLM).toBe(10 ** XLM_DECIMALS);
    expect(XLM_DECIMALS).toBe(7);
    // 1 XLM in stroops, plus a couple of manual edge checks
    expect(STROOPS_PER_XLM).toBe(10_000_000);
    expect(1e7).toBe(10_000_000);
  });

  it('uses the testnet explorer by default', () => {
    expect(STELLAR_NETWORK).toBe('testnet');
    expect(EXPLORER_BASE).toBe('https://stellar.expert/explorer/testnet');
  });

  it('builds explorer links and preserves protocol-facing values', () => {
    expect(explorerContractUrl('contract-id')).toBe(`${EXPLORER_BASE}/contract/contract-id`);
    expect(explorerTxUrl('tx-hash')).toBe(`${EXPLORER_BASE}/tx/tx-hash`);
    expect(explorerAccountUrl('account-id')).toBe(`${EXPLORER_BASE}/account/account-id`);
    expect(CURRENCIES).toEqual(['XLM', 'USDC']);
    expect(GRACE_PERIOD_SECS).toBe(7 * 24 * 60 * 60);
  });

  it('builds mainnet explorer links when the network is configured as mainnet', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'mainnet';
    const mainnet = await import('./constants');
    expect(mainnet.STELLAR_NETWORK).toBe('mainnet');
    expect(mainnet.EXPLORER_BASE).toBe('https://stellar.expert/explorer/public');
    expect(mainnet.explorerTxUrl('tx-hash')).toBe(
      'https://stellar.expert/explorer/public/tx/tx-hash',
    );
  });
});