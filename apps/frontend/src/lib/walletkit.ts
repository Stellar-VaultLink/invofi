'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { getNetwork } from '@stellar/freighter-api';
import { APPROVED_WALLETS, WALLET_IDS } from './approved-wallets';
import { networkMismatchFor } from './network';

export { WALLET_IDS };

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

let _initialized = false;
let activeWalletId: string | null = null;

/**
 * Initializes the kit with exactly the approved wallets. A future third
 * approved wallet requires editing only `approved-wallets.ts`.
 */
export function initWalletKit(): void {
  if (typeof window === 'undefined' || _initialized) return;
  StellarWalletsKit.init({
    modules: APPROVED_WALLETS.map(w => new w.module()),
  });
  _initialized = true;
}

/** Records which approved wallet is currently connected. */
export function setActiveWallet(id: string | null): void {
  activeWalletId = id;
}

/**
 * Signs a transaction with the currently connected wallet via the kit, so
 * signing works identically regardless of which approved wallet connected.
 */
export async function signTransactionWithActiveWallet(
  txXdr: string,
  networkPassphrase: string,
): Promise<string> {
  if (!activeWalletId) {
    throw new Error('No wallet connected — connect a wallet to sign transactions.');
  }
  StellarWalletsKit.setWallet(activeWalletId);
  const result = await StellarWalletsKit.signTransaction(txXdr, { networkPassphrase });
  if (!result.signedTxXdr) {
    throw new Error('Wallet did not return a signed transaction.');
  }
  return result.signedTxXdr;
}

/**
 * Probes the connected wallet's network so the UI can warn on a mismatch.
 * Only Freighter exposes its network today; other wallets report null.
 */
export async function probeWalletNetwork(walletId: string): Promise<string | null> {
  if (walletId !== WALLET_IDS.freighter) return null;
  try {
    const result = await getNetwork();
    if ('error' in result && result.error) return null;
    return (result as { network: string }).network ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks the connected wallet's network against the app's configured network
 * (NEXT_PUBLIC_STELLAR_NETWORK). Wallets that do not expose their network
 * report mismatch: false so the UI stays quiet for them.
 */
export async function checkWalletNetwork(walletId: string): Promise<{
  network: string | null;
  mismatch: boolean;
}> {
  const walletNet = await probeWalletNetwork(walletId);
  return {
    network: walletNet,
    mismatch: networkMismatchFor(walletNet),
  };
}

export { StellarWalletsKit, NETWORK_PASSPHRASE };