/**
 * Expected network derived from the app's configured Stellar network.
 * NEXT_PUBLIC_* variables are inlined at build time by Next.js.
 */
export const EXPECTED_NETWORK = (
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet'
).toLowerCase();

/**
 * Normalizes a wallet's detected network string to the short form
 * ('mainnet' | 'testnet' | lowercased original). Freighter returns
 * 'PUBLIC' or 'TESTNET' for its built-in networks, or the full
 * network passphrase for custom networks.
 */
function normalizeWalletNetwork(net: string): string {
  const lower = net.toLowerCase();
  if (lower === 'public' || lower.includes('public global')) return 'mainnet';
  if (lower === 'testnet' || lower.includes('test sdf')) return 'testnet';
  return lower;
}

/**
 * Returns true when the wallet's detected network does not match the app's
 * configured network. Accepts the string returned by probeWalletNetwork
 * (e.g. 'PUBLIC', 'TESTNET', or a network passphrase).
 *
 * @param walletNet - The network string returned by the wallet's API, or null
 *                    when the wallet does not expose its network.
 */
export function networkMismatchFor(walletNet: string | null): boolean {
  if (!walletNet) return false;
  return normalizeWalletNetwork(walletNet) !== EXPECTED_NETWORK;
}

/**
 * Returns a human-readable label for the wallet's detected network.
 * Maps 'PUBLIC' → 'mainnet' and 'TESTNET' → 'testnet'.
 */
export function networkLabel(walletNet: string): string {
  return normalizeWalletNetwork(walletNet);
}