import { describe, expect, it, vi } from 'vitest';
import { APPROVED_WALLETS, silentRestorableWallets, WALLET_IDS } from './approved-wallets';

/**
 * Regression tests for the wallet-connection contract: connecting is
 * user-initiated. The silent-restore path must only ever consider the
 * extension wallets (Freighter, LOBSTR) that answer fetchAddress() without
 * opening UI — never the bridge/web wallets whose fetchAddress() pops a
 * sign-up window on every page load.
 *
 * The wallet SDKs are CommonJS and browser-oriented, so they are mocked
 * wholesale — the logic under test is the allowlist classification.
 */
vi.mock('@stellar/freighter-api', () => ({
  isConnected: async () => ({ isConnected: false }),
  getAddress: async () => ({ address: undefined }),
  getNetwork: async () => ({ network: 'testnet' }),
}));
vi.mock('@lobstrco/signer-extension-api', () => ({
  isConnected: async () => false,
}));
vi.mock('@creit.tech/stellar-wallets-kit/modules/freighter', () => ({
  FREIGHTER_ID: 'freighter',
  FreighterModule: class {},
}));
vi.mock('@creit.tech/stellar-wallets-kit/modules/lobstr', () => ({
  LOBSTR_ID: 'lobstr',
  LobstrModule: class {},
}));
vi.mock('@creit.tech/stellar-wallets-kit/modules/albedo', () => ({
  ALBEDO_ID: 'albedo',
  AlbedoModule: class {},
}));
vi.mock('@creit.tech/stellar-wallets-kit/modules/xbull', () => ({
  XBULL_ID: 'xbull',
  xBullModule: class {},
}));

describe('silentRestorableWallets', () => {
  it('flags only extension wallets as silently restorable', () => {
    const restorable = silentRestorableWallets([
      WALLET_IDS.freighter,
      WALLET_IDS.lobstr,
      WALLET_IDS.albedo,
      WALLET_IDS.xbull,
    ]);
    expect(restorable).toContain(WALLET_IDS.freighter);
    expect(restorable).toContain(WALLET_IDS.lobstr);
    expect(restorable).not.toContain(WALLET_IDS.albedo);
    expect(restorable).not.toContain(WALLET_IDS.xbull);
  });

  it('never returns a wallet that is not installed', () => {
    expect(silentRestorableWallets([])).toEqual([]);
    expect(silentRestorableWallets([WALLET_IDS.albedo])).toEqual([]);
    expect(silentRestorableWallets([WALLET_IDS.freighter])).toEqual([
      WALLET_IDS.freighter,
    ]);
  });

  it('ignores unknown wallet ids', () => {
    expect(silentRestorableWallets(['totally-unknown-wallet'])).toEqual([]);
  });

  it('keeps every approved wallet flagged either way (allowlist contract)', () => {
    for (const w of APPROVED_WALLETS) {
      expect(typeof w.silentRestore).toBe('boolean');
    }
  });
});
