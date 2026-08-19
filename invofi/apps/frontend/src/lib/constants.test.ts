import { describe, expect, it } from 'vitest';
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
  it('keeps Stellar unit conversion internally consistent', () => {
    expect(STROOPS_PER_XLM).toBe(10 ** XLM_DECIMALS);
    expect(XLM_DECIMALS).toBe(7);
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
});
