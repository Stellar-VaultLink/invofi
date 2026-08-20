import type { Currency } from '@invofi/sdk';
import { Networks } from '@invofi/sdk';

export const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
export const NETWORK_PASSPHRASE = STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';

// 3-contract deployment (Task 6). Falls back to the legacy CONTRACT_ID so a
// deployment that only sets NEXT_PUBLIC_CONTRACT_ID keeps working.
export const REGISTRY_CONTRACT_ID =
  process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? CONTRACT_ID;
export const FINANCING_CONTRACT_ID =
  process.env.NEXT_PUBLIC_FINANCING_CONTRACT_ID ?? CONTRACT_ID;
export const REPAYMENT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_REPAYMENT_CONTRACT_ID ?? CONTRACT_ID;

// Stellar Expert explorer — network-aware deep links for contracts, txs, accounts
export const EXPLORER_BASE =
  STELLAR_NETWORK === 'mainnet'
    ? 'https://stellar.expert/explorer/public'
    : 'https://stellar.expert/explorer/testnet';

export const explorerContractUrl = (contractId: string) => `${EXPLORER_BASE}/contract/${contractId}`;
export const explorerTxUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const explorerAccountUrl = (address: string) => `${EXPLORER_BASE}/account/${address}`;

export const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const XLM_DECIMALS = 7;
export const STROOPS_PER_XLM = 10_000_000;

// Position tokens (Task 7/8) are Stellar assets (SAC) minted to lenders on
// offer acceptance. Holders must establish a trustline before mint/transfer
// can touch their balance — standard Stellar asset behavior. The asset is
// `POS` issued by the protocol deployer; override per deployment via
// NEXT_PUBLIC_POSITION_TOKEN_ASSET.
export const POSITION_TOKEN_ASSET =
  process.env.NEXT_PUBLIC_POSITION_TOKEN_ASSET ??
  'POS:GBDDLOWR6YUEEYUKFKS6ISTCLBQKDPUXAOVJMNJYAACT6UYQGEKYEVZR';

export const INVOICE_STATUSES = ['Pending', 'Financed', 'Repaid', 'Overdue', 'Cancelled', 'Disputed', 'Defaulted'] as const;
export const OFFER_STATUSES = ['Pending', 'Accepted', 'Financed', 'Rejected', 'Repaid', 'Defaulted'] as const;
export const CURRENCIES = ['XLM', 'USDC'] as const;
export const USER_ROLES = ['business', 'lender'] as const;

// Must match GRACE_PERIOD_SECS in invofi-contracts (common/src/lib.rs) — how
// long after due_date a Financed offer stays reclaimable-pending before a
// lender can mark it Defaulted.
export const GRACE_PERIOD_SECS = 604_800; // 7 days

export const RISK_TIERS = {
  A: { label: 'Low Risk', color: 'green', baseRate: 500 },
  B: { label: 'Medium Risk', color: 'yellow', baseRate: 800 },
  C: { label: 'High Risk', color: 'red', baseRate: 1200 },
} as const;

export const QUERY_STALE_TIME = 30_000;
export const QUERY_GC_TIME = 5 * 60_000;

// ── Multi-signature transaction approval (issue #219) ────────────────────────
// High-value operations route through an M-of-N approval queue instead of a
// single signature. Thresholds are per-currency and expressed in human units
// (not stroops); an operation whose amount is strictly greater than the
// threshold for its currency requires multi-sig. All three knobs are
// deployment-overridable via NEXT_PUBLIC_* so an institution can tune them
// without a code change.
const numFromEnv = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const MULTISIG_THRESHOLDS: Record<Currency, number> = {
  XLM: numFromEnv(process.env.NEXT_PUBLIC_MULTISIG_THRESHOLD_XLM, 10_000),
  USDC: numFromEnv(process.env.NEXT_PUBLIC_MULTISIG_THRESHOLD_USDC, 1_000),
};

/** Signatures required before a queued transaction can execute (M of N). */
export const MULTISIG_REQUIRED_SIGNATURES = Math.max(
  2,
  Math.trunc(numFromEnv(process.env.NEXT_PUBLIC_MULTISIG_REQUIRED_SIGNATURES, 3)),
);

/** A queued transaction auto-rejects if not fully approved within this window. */
export const MULTISIG_TIMEOUT_SECS = Math.trunc(
  numFromEnv(process.env.NEXT_PUBLIC_MULTISIG_TIMEOUT_SECS, 24 * 60 * 60),
);

/**
 * Global Horizon HTTP timeout (ms). stellar-sdk v16 has no per-`Server` timeout
 * option, so multisig applies this via `Config.setTimeout` — a stalled node
 * then fails fast instead of leaving approve/execute spinning indefinitely.
 */
export const HORIZON_TIMEOUT_MS = Math.trunc(
  numFromEnv(process.env.NEXT_PUBLIC_HORIZON_TIMEOUT_MS, 20_000),
);
