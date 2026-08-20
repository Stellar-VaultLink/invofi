// ── Live dashboard config (issue #221) ───────────────────────────────────────
// Reads the same env surface as `lib/contract.ts` so the live engine watches
// the same contracts the app talks to. `NEXT_PUBLIC_WS_URL` is optional — when
// unset the dashboard runs on the polling fallback.

import { Networks } from '@invofi/sdk';

export const LIVE_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as
  | 'testnet'
  | 'mainnet';

/** Soroban RPC endpoint, derived from the network when not explicitly set. */
export const LIVE_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (LIVE_NETWORK === 'mainnet'
    ? 'https://soroban-rpc.stellar.org'
    : 'https://soroban-testnet.stellar.org');

export const LIVE_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? '';

export const LIVE_NETWORK_PASSPHRASE =
  LIVE_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

const LEGACY_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const REGISTRY_ID = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? LEGACY_CONTRACT_ID;
const FINANCING_ID = process.env.NEXT_PUBLIC_FINANCING_CONTRACT_ID ?? LEGACY_CONTRACT_ID;
const REPAYMENT_ID = process.env.NEXT_PUBLIC_REPAYMENT_CONTRACT_ID ?? LEGACY_CONTRACT_ID;

/** Contract IDs to watch, deduped (legacy deployments route all three to one). */
export const LIVE_CONTRACT_IDS = [...new Set([REGISTRY_ID, FINANCING_ID, REPAYMENT_ID])].filter(Boolean);