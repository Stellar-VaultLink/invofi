'use client';

// ADR-0001 (approved-wallet allowlist): this file is the single extension
// point for wallet support. Approving a third wallet means adding one entry
// to APPROVED_WALLETS — no other code changes.
import { FreighterModule, FREIGHTER_ID } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { LobstrModule, LOBSTR_ID } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { AlbedoModule, ALBEDO_ID } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { xBullModule, XBULL_ID } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { isConnected as isLobstrConnected } from '@lobstrco/signer-extension-api';
import { isConnected as isFreighterConnected } from '@stellar/freighter-api';

const hasWindow = (): boolean => typeof window !== 'undefined';

// Detection mirrors the kit modules' own availability checks (see
// stellar-wallets-kit modules/freighter + modules/lobstr): the official signer
// APIs handle postMessage handshakes, which raw window-global checks miss.
async function hasFreighterExtension(): Promise<boolean> {
  if (!hasWindow()) return false;
  try {
    const result = await isFreighterConnected();
    return !!result?.isConnected;
  } catch {
    return false;
  }
}

async function hasLobstrExtension(): Promise<boolean> {
  if (!hasWindow()) return false;
  try {
    return await isLobstrConnected();
  } catch {
    return false;
  }
}

// Albedo is a web wallet (SEP-0009 style intent handler at albedo.link): the
// SDK module works from any tab without an installed extension, so it is
// always available when the page is loaded.
function hasAlbedoAvailable(): Promise<boolean> {
  return Promise.resolve(hasWindow());
}

// xBull is a hot/wallet-connect style wallet (bridge at xbull.app): like
// Albedo the SDK module pairs over a bridge rather than an installed browser
// extension, so it is always available when the page is loaded.
function hasXBullAvailable(): Promise<boolean> {
  return Promise.resolve(hasWindow());
}

export const APPROVED_WALLETS = [
  {
    id: FREIGHTER_ID,
    name: 'Freighter',
    description: 'Official Stellar browser wallet by SDF',
    installUrl: 'https://freighter.app',
    module: FreighterModule,
    isInstalled: hasFreighterExtension,
  },
  {
    id: LOBSTR_ID,
    name: 'LOBSTR',
    description: 'Popular Stellar wallet with extension support',
    installUrl: 'https://lobstr.co/extension',
    module: LobstrModule,
    isInstalled: hasLobstrExtension,
  },
  {
    id: ALBEDO_ID,
    name: 'Albedo',
    description: 'Web wallet with built-in signing (no extension required)',
    installUrl: 'https://albedo.link/',
    module: AlbedoModule,
    isInstalled: hasAlbedoAvailable,
  },
  {
    id: XBULL_ID,
    name: 'xBull',
    description: 'Browser wallet and bridge wallet for Stellar',
    installUrl: 'https://xbull.app',
    module: xBullModule,
    isInstalled: hasXBullAvailable,
  },
] as const;

export type ApprovedWallet = (typeof APPROVED_WALLETS)[number];
export type ApprovedWalletId = ApprovedWallet['id'];

/** Stable app-internal identifiers, derived from the allowlist. */
export const WALLET_IDS = {
  freighter: FREIGHTER_ID,
  lobstr: LOBSTR_ID,
  albedo: ALBEDO_ID,
  xbull: XBULL_ID,
} as const;