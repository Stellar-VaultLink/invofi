'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { signOut as supabaseSignOut, signInWithWallet } from '@/lib/supabase';
import {
  StellarWalletsKit,
  initWalletKit,
  setActiveWallet,
  probeWalletNetwork,
} from '@/lib/walletkit';
import { APPROVED_WALLETS } from '@/lib/approved-wallets';
import { isMockMode } from '@/lib/mock-mode';
import { MOCK_WALLET_ADDRESS } from '@/lib/mock';
import type { WalletState } from '@/types';

interface WalletContextValue extends WalletState {
  connect: (walletId: string) => Promise<string>;
  disconnect: () => void;
  isCheckingWallet: boolean;
}

const WalletContext = createContext<WalletContextValue>({
  publicKey: null,
  walletId: null,
  isConnected: false,
  isConnecting: false,
  isInstalled: false,
  networkMismatch: false,
  isCheckingWallet: true,
  connect: async () => '',
  disconnect: () => { },
});

const EXPECTED_NETWORK = (
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet'
).toLowerCase();

// Offline demo mode (#177): auto-connect a mock wallet so protected pages are
// reachable without a browser extension or testnet access.
const MOCK_MODE = isMockMode();

function networkMismatchFor(walletNet: string | null): boolean {
  if (!walletNet) return false;
  const n = walletNet.toLowerCase() === 'public' ? 'mainnet' : walletNet.toLowerCase();
  return n !== EXPECTED_NETWORK;
}

/**
 * Persistent "last wallet" choice (issue #187): the only wallet state allowed
 * in localStorage is the *public address* — never a key, seed, or signature.
 * The stored entry is a hint that lets a returning user reconnect to the
 * wallet they chose last time without probing every installed wallet first.
 */
interface LastWalletEntry {
  walletId: string;
  publicKey: string;
}

const LAST_WALLET_STORAGE_KEY = 'invofi:last-wallet';

function readLastWallet(): LastWalletEntry | null {
  if (typeof window === 'undefined') return null;
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

function persistLastWallet(walletId: string, publicKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LAST_WALLET_STORAGE_KEY,
      JSON.stringify({ walletId, publicKey } satisfies LastWalletEntry),
    );
  } catch {
    // private mode or quota exceeded — persistence is best-effort
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isCheckingWallet, setIsCheckingWallet] = useState(!MOCK_MODE);
  const [state, setState] = useState<WalletState>(
    MOCK_MODE
      ? {
          publicKey: MOCK_WALLET_ADDRESS,
          walletId: 'mock',
          isConnected: true,
          isConnecting: false,
          isInstalled: true,
          networkMismatch: false,
        }
      : {
          publicKey: null,
          walletId: null,
          isConnected: false,
          isConnecting: false,
          isInstalled: false,
          networkMismatch: false,
        },
  );

  /**
   * Attempts to restore a previously-granted wallet session (Freighter returns
   * the address without prompting when already allowed; others may too).
   * Returns true when a connection was restored. Never throws — a wallet that
   * has not been granted access yet simply yields false so the caller can try
   * the next candidate.
   */
  const tryRestoreWallet = useCallback(async (walletId: string): Promise<boolean> => {
    try {
      StellarWalletsKit.setWallet(walletId);
      const { address } = await StellarWalletsKit.fetchAddress();
      if (!address) return false;
      const net = await probeWalletNetwork(walletId);
      setActiveWallet(walletId);
      persistLastWallet(walletId, address);
      setState({
        publicKey: address,
        walletId,
        isConnected: true,
        isConnecting: false,
        isInstalled: true,
        networkMismatch: networkMismatchFor(net),
      });
      // Ensure a Supabase session exists for the restored wallet connection.
      await signInWithWallet(address).catch(() => { });
      setIsCheckingWallet(false);
      return true;
    } catch {
      // Wallet not granted yet — the caller tries the next candidate.
      return false;
    }
  }, []);

  useEffect(() => {
    if (MOCK_MODE) return;

    initWalletKit();

    (async () => {
      const installed = new Set<string>();
      for (const w of APPROVED_WALLETS) {
        if (await w.isInstalled()) {
          installed.add(w.id);
        }
      }

      if (installed.size === 0) {
        setState(s => ({ ...s, isInstalled: false }));
        setIsCheckingWallet(false);
        return;
      }

      setState(s => ({ ...s, isInstalled: true }));

      // Prefer the last-connected wallet so returning users reconnect to the
      // wallet they chose last time; fall back to probing every approved
      // wallet for a previously-granted session.
      const lastWallet = readLastWallet();
      if (lastWallet && installed.has(lastWallet.walletId)) {
        if (await tryRestoreWallet(lastWallet.walletId)) return;
      }
      for (const w of APPROVED_WALLETS) {
        if (!installed.has(w.id)) continue;
        if (await tryRestoreWallet(w.id)) return;
      }

      setIsCheckingWallet(false);
    })();
  }, [tryRestoreWallet]);

  const connect = useCallback(async (walletId: string): Promise<string> => {
    if (MOCK_MODE) return MOCK_WALLET_ADDRESS;
    setState(s => ({ ...s, isConnecting: true }));
    try {
      StellarWalletsKit.setWallet(walletId);
      const result = await StellarWalletsKit.fetchAddress();
      const address = result.address;
      const net = await probeWalletNetwork(walletId);
      setActiveWallet(walletId);
      persistLastWallet(walletId, address);
      setState({
        publicKey: address,
        walletId,
        isConnected: true,
        isConnecting: false,
        isInstalled: true,
        networkMismatch: networkMismatchFor(net),
      });

      // Block until the Supabase session is created so the dashboard's own
      // auth check finds a user immediately after router.push('/dashboard').
      await signInWithWallet(address).catch(() => { });

      return address;
    } catch (err) {
      setState(s => ({ ...s, isConnecting: false }));
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    // The demo stays connected — there is no real wallet to disconnect.
    if (MOCK_MODE) return;
    setActiveWallet(null);
    setState(s => ({
      ...s,
      publicKey: null,
      walletId: null,
      isConnected: false,
      isConnecting: false,
      networkMismatch: false,
    }));
    // Sign out of Supabase so protected routes redirect to login.
    supabaseSignOut().catch(() => { });
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, isCheckingWallet }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
