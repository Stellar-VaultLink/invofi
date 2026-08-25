import { Horizon } from '@stellar/stellar-sdk';
import { isMockMode } from './mock-mode';
import { mockXlmBalance } from './mock';

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
