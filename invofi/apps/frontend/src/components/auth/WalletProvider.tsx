'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { signOut as supabaseSignOut, signInWithWallet } from '@/lib/supabase';
import {
  StellarWalletsKit,
  initWalletKit,
  setActiveWallet,
  probeWalletNetwork,
  subscribeToWalletEvents,
} from '@/lib/walletkit';
import { APPROVED_WALLETS } from '@/lib/approved-wallets';
import { isMockMode } from '@/lib/mock-mode';
import { MOCK_WALLET_ADDRESS } from '@/lib/mock';
import {
  LAST_WALLET_STORAGE_KEY,
  readLastWallet,
  persistLastWallet,
  clearLastWallet,
} from '@/lib/last-wallet';
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

/**
 * Normalises a wallet network value (name or passphrase) to the app's
 * internal label so it can be compared with `EXPECTED_NETWORK`.
 */
function normaliseNetwork(walletNet: string | null): string | null {
  if (!walletNet) return null;
  const n = walletNet.toLowerCase();
  if (n === 'public' || n.includes('public global')) return 'mainnet';
  if (n === 'testnet' || (n.includes('test sdf') && n.includes('network'))) return 'testnet';
  return n;
}

function networkMismatchFor(walletNet: string | null): boolean {
  const n = normaliseNetwork(walletNet);
  if (!n) return false;
  return n !== EXPECTED_NETWORK;
}

/**
 * Persistent "last wallet" choice (issue #187): the only wallet state allowed
 * in localStorage is the *public address* — never a key, seed, or signature.
 * See `@/lib/last-wallet` for the read/persist/clear contract (issue #172).
 */

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

  // Always-current view of wallet state for event-listener closures (the kit's
  // STATE_UPDATE callback must read the latest walletId/publicKey without
  // re-subscribing on every state change).
  const stateRef = useRef(state);
  stateRef.current = state;

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
    // Clear the persisted last-wallet hint so a page refresh won't
    // silently re-connect (issue #172).
    clearLastWallet();
    // Sign out of Supabase so protected routes redirect to login.
    supabaseSignOut().catch(() => { });
  }, []);

  useEffect(() => {
    if (MOCK_MODE) return;

    initWalletKit();

    // Listen for wallet account switches and disconnects that happen inside
    // the browser extension while the app is open (issue #111). Without this,
    // the cached address goes stale until a manual page reload.
    const unsubscribe = subscribeToWalletEvents(
      (address, networkPassphrase) => {
        const current = stateRef.current;
        // Ignore events fired before a wallet is connected (kit emits an
        // initial STATE_UPDATE with an undefined address) and dedupe events
        // for the address we already show.
        if (current.walletId === null || current.publicKey === address) return;

        setActiveWallet(current.walletId);
        setState({
          publicKey: address,
          walletId: current.walletId,
          isConnected: true,
          isConnecting: false,
          isInstalled: true,
          networkMismatch: networkMismatchFor(normaliseNetwork(networkPassphrase)),
        });
        // Refresh the persisted last-wallet hint so a page reload lands on
        // the newly selected account (issue #172/#187 contract).
        persistLastWallet(current.walletId, address);
        // Refresh the Supabase session so protected routes and contract reads
        // stay attached to the switched account.
        signInWithWallet(address).catch(() => { });
      },
      () => {
        // Wallet disconnected from the extension side — fall back to the
        // same teardown path the UI's Disconnect button uses.
        disconnect();
      },
    );

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

      // On the sign-in / register pages the point is to *choose* a wallet
      // from the approved list — never silently re-attach the last-used
      // wallet there, or the connect dialog never gets a chance to show.
      // Auto-restore still applies everywhere else so returning users land
      // connected on the dashboard (issue #172 persistence contract).
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/')) {
        setIsCheckingWallet(false);
        return;
      }

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

    return unsubscribe;
  }, [tryRestoreWallet, disconnect]);

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

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, isCheckingWallet }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
