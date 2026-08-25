/**
 * Persistent "last wallet" choice (issue #172 / #187): the only wallet state
 * allowed in localStorage is the *public address* — never a key, seed, or
 * signature. The stored entry is a hint that lets a returning user reconnect
 * to the wallet they chose last time without probing every installed wallet
 * first.
 *
 * Extracted from `WalletProvider` into its own module so the read/persist/
 * clear contract can be unit-tested without rendering the provider tree.
 */

export interface LastWalletEntry {
  walletId: string;
  publicKey: string;
}

export const LAST_WALLET_STORAGE_KEY = 'invofi:last-wallet';

const hasWindow = (): boolean => typeof window !== 'undefined';

/**
 * Reads the persisted last-wallet hint. Returns null when nothing is stored,
 * the JSON is malformed, or the shape is invalid (Stellar public addresses
 * start with "G", so anything else is rejected defensively).
 */
export function readLastWallet(): LastWalletEntry | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(LAST_WALLET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastWalletEntry>;
    if (
      typeof parsed.walletId === 'string' &&
      typeof parsed.publicKey === 'string' &&
      parsed.publicKey.startsWith('G') // Stellar public addresses start with G
    ) {
      return { walletId: parsed.walletId, publicKey: parsed.publicKey };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persists the last-selected wallet hint. Best-effort (private mode / quota). */
export function persistLastWallet(walletId: string, publicKey: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      LAST_WALLET_STORAGE_KEY,
      JSON.stringify({ walletId, publicKey } satisfies LastWalletEntry),
    );
  } catch {
    // private mode or quota exceeded — persistence is best-effort
  }
}

/**
 * Clears the persisted last-wallet hint. Called from `disconnect()` so that
 * disconnecting also opts out of the next page load's silent auto-reconnect.
 * Best-effort, never throws.
 */
export function clearLastWallet(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
  } catch {
    // best-effort, mirroring persistLastWallet
  }
}