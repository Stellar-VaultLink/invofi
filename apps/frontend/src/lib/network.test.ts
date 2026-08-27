import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// EXPECTED_NETWORK is computed at module load, so each test block that changes
// the env must reset module state and re-import dynamically.
async function loadNetwork() {
  vi.resetModules();
  return await import('./network');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('networkMismatchFor', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
  });

  it('returns false for null (wallet does not expose network)', async () => {
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor(null)).toBe(false);
  });

  it('returns false when wallet matches testnet', async () => {
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor('TESTNET')).toBe(false);
  });

  it('returns true when wallet is on mainnet but app expects testnet', async () => {
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor('PUBLIC')).toBe(true);
  });

  it('handles mixed case input', async () => {
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor('public')).toBe(true);
    expect(networkMismatchFor('testnet')).toBe(false);
  });

  it('returns true for mainnet passphrase when app expects testnet', async () => {
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor('Public Global Stellar Network ; September 2015')).toBe(true);
  });

  it('returns false for testnet passphrase when app expects testnet', async () => {
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor('Test SDF Network ; September 2015')).toBe(false);
  });

  it('respects app configured mainnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    const { networkMismatchFor } = await loadNetwork();
    expect(networkMismatchFor('TESTNET')).toBe(true);
    expect(networkMismatchFor('PUBLIC')).toBe(false);
  });
});

describe('networkLabel', () => {
  it('maps PUBLIC to mainnet', async () => {
    const { networkLabel } = await loadNetwork();
    expect(networkLabel('PUBLIC')).toBe('mainnet');
  });

  it('passes through TESTNET', async () => {
    const { networkLabel } = await loadNetwork();
    expect(networkLabel('TESTNET')).toBe('testnet');
  });

  it('normalizes testnet passphrase to testnet', async () => {
    const { networkLabel } = await loadNetwork();
    expect(networkLabel('Test SDF Network ; September 2015')).toBe('testnet');
  });
});