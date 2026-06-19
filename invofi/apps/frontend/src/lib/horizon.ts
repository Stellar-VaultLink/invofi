import { Horizon } from 'stellar-sdk';

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
  const account = await horizon().loadAccount(publicKey);
  return account.balances as AccountBalance[];
}

export async function getXlmBalance(publicKey: string): Promise<string> {
  const balances = await getAccountBalances(publicKey);
  const native = balances.find(b => b.asset_type === 'native');
  return native?.balance ?? '0';
}

export async function getUsdcBalance(publicKey: string): Promise<string> {
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
