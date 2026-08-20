import { afterEach, describe, expect, it, vi } from 'vitest';

// Env is read at module load — reset the module registry so each test sees a
// fresh process.env surface.

vi.mock('@invofi/sdk', () => ({
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
}));

async function loadConfig() {
  vi.resetModules();
  return await import('./config');
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  delete process.env.NEXT_PUBLIC_RPC_URL;
  delete process.env.NEXT_PUBLIC_WS_URL;
});

describe('live config', () => {
  it('defaults to the testnet RPC on the testnet network', async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'testnet';
    delete process.env.NEXT_PUBLIC_RPC_URL;
    const { LIVE_RPC_URL, LIVE_NETWORK_PASSPHRASE } = await loadConfig();
    expect(LIVE_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    expect(LIVE_NETWORK_PASSPHRASE).toContain('Test SDF Network');
  });

  it('defaults to the mainnet RPC when the network is mainnet', async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'mainnet';
    delete process.env.NEXT_PUBLIC_RPC_URL;
    const { LIVE_RPC_URL, LIVE_NETWORK_PASSPHRASE } = await loadConfig();
    expect(LIVE_RPC_URL).toBe('https://soroban-rpc.stellar.org');
    expect(LIVE_NETWORK_PASSPHRASE).toContain('Public Global Stellar Network');
  });

  it('honors an explicit RPC override regardless of network', async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'mainnet';
    process.env.NEXT_PUBLIC_RPC_URL = 'https://rpc.example.com';
    const { LIVE_RPC_URL } = await loadConfig();
    expect(LIVE_RPC_URL).toBe('https://rpc.example.com');
  });
});