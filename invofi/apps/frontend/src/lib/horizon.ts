import { Horizon } from '@stellar/stellar-sdk';
import { isMockMode } from './mock-mode';
import { mockXlmBalance } from './mock';
import { POSITION_TOKEN_ASSET } from './constants';

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

function horizon() {
  return new Horizon.Server(HORIZON_URL);
}

export interface AccountBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export async function getAccountBalances(publicKey: string): Promise<AccountBalance[]> {
  if (isMockMode()) {
    return [{ asset_type: 'native', balance: mockXlmBalance() }];
  }
  const account = await horizon().loadAccount(publicKey);
  return account.balances as AccountBalance[];
}

export async function getXlmBalance(publicKey: string): Promise<string> {
  if (isMockMode()) return mockXlmBalance();
  const balances = await getAccountBalances(publicKey);
  const native = balances.find(b => b.asset_type === 'native');
  return native?.balance ?? '0';
}

export async function getUsdcBalance(publicKey: string): Promise<string> {
  if (isMockMode()) return '0';
  const USDC_ISSUER = process.env.NEXT_PUBLIC_USDC_ISSUER ?? '';
  const balances = await getAccountBalances(publicKey);
  const usdc = balances.find(
    b => b.asset_code === 'USDC' && (!USDC_ISSUER || b.asset_issuer === USDC_ISSUER),
  );
  return usdc?.balance ?? '0';
}

export interface TxRecord {
  id: string;
  hash: string;
  created_at: string;
  successful: boolean;
  operation_count: number;
}

export async function getRecentTransactions(
  publicKey: string,
  limit = 10,
): Promise<TxRecord[]> {
  if (isMockMode()) return [];
  const response = await horizon()
    .transactions()
    .forAccount(publicKey)
    .limit(limit)
    .order('desc')
    .call();
  return response.records.map(r => ({
    id: r.id,
    hash: r.hash,
    created_at: r.created_at,
    successful: r.successful,
    operation_count: r.operation_count,
  }));
}

export function explorerUrl(hash: string): string {
  const network =
    process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

/** Returns true if the account exists on the network (i.e. has been funded). */
export async function accountExists(publicKey: string): Promise<boolean> {
  if (isMockMode()) return true;
  try {
    await horizon().loadAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fund a testnet account via Stellar Friendbot.
 * Only works on testnet — safe to call; does nothing on mainnet.
 */
export async function fundAccountViaFriendbot(publicKey: string): Promise<void> {
  if (isMockMode()) return;
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  if (network === 'mainnet' || network === 'public') {
    throw new Error('Friendbot is only available on testnet.');
  }
  const res = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 400 usually means already funded — treat as success
    if (res.status !== 400) {
      throw new Error(`Friendbot error ${res.status}: ${body}`);
    }
  }
  // Give Horizon a moment to index the funding transaction
  await new Promise(r => setTimeout(r, 2000));
}

// ── Position-token transfers (issue #127) ────────────────────────────────────
// Position tokens (SEP-41 SAC) are a regular Stellar asset (`POS:ISSUER`), so
// every mint/transfer shows up as a Horizon `payment` operation on that asset.
// The portfolio panel reads these to show a lender their in/out history and
// prove their claim. The mapping helpers are pure so the acceptance criteria
// stay unit-testable without hitting the network.

export interface PositionTransfer {
  id: string;
  hash: string;
  createdAt: string;
  direction: 'in' | 'out';
  counterparty: string;
  amount: string;
}

/** Parse a "CODE:ISSUER" asset string into its parts, or null if malformed. */
export function parsePositionTokenAsset(
  asset: string,
): { code: string; issuer: string } | null {
  const idx = asset.indexOf(':');
  if (idx <= 0) return null;
  const code = asset.slice(0, idx);
  const issuer = asset.slice(idx + 1);
  return code && /^G[A-Z2-7]{55}$/.test(issuer) ? { code, issuer } : null;
}

/** True when a Horizon operation record is a payment of the given POS asset. */
export function isPositionTokenPayment(
  rec: {
    type?: string;
    asset_code?: string | null;
    asset_issuer?: string | null;
  },
  asset: { code: string; issuer: string },
): boolean {
  return (
    rec.type === 'payment' &&
    rec.asset_code === asset.code &&
    rec.asset_issuer === asset.issuer
  );
}

/**
 * Shape of a payment-operation record as returned by Horizon, restricted to
 * the fields this panel cares about. The SDK returns a union of operation
 * types, so callers cast after filtering with `isPositionTokenPayment`.
 */
export interface PositionPaymentRecord {
  id: string;
  transaction_hash: string;
  created_at: string;
  type?: string;
  asset_code?: string | null;
  asset_issuer?: string | null;
  from?: string;
  to?: string;
  amount?: string;
}

/**
 * Map one Horizon payment record to a compact PositionTransfer, resolved
 * against the connected wallet. Returns null when the wallet is neither the
 * sender nor the recipient (e.g. a path-payment intermediary).
 */
export function toPositionTransfer(
  rec: PositionPaymentRecord,
  publicKey: string,
): PositionTransfer | null {
  if (rec.to === publicKey && rec.from && rec.amount !== undefined) {
    return {
      id: rec.id,
      hash: rec.transaction_hash,
      createdAt: rec.created_at,
      direction: 'in',
      counterparty: rec.from,
      amount: rec.amount,
    };
  }
  if (rec.from === publicKey && rec.to && rec.amount !== undefined) {
    return {
      id: rec.id,
      hash: rec.transaction_hash,
      createdAt: rec.created_at,
      direction: 'out',
      counterparty: rec.to,
      amount: rec.amount,
    };
  }
  return null;
}

/**
 * Fetch the connected wallet's recent position-token transfers (in/out) from
 * Horizon. Filters to the POS asset only, newest first. Returns [] in mock
 * mode or when the POS asset is not configured.
 */
export async function getPositionTokenTransfers(
  publicKey: string,
  limit = 20,
): Promise<PositionTransfer[]> {
  if (isMockMode()) return [];
  const asset = parsePositionTokenAsset(POSITION_TOKEN_ASSET);
  if (!asset) return [];
  const response = await horizon()
    .payments()
    .forAccount(publicKey)
    .limit(limit)
    .order('desc')
    .call();
  return response.records
    .filter(rec => isPositionTokenPayment(rec, asset))
    .map(rec => toPositionTransfer(rec as PositionPaymentRecord, publicKey))
    .filter((t): t is PositionTransfer => t !== null);
}
