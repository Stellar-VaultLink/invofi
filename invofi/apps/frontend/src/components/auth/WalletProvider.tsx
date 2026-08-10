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

function networkMismatchFor(walletNet: string | null): boolean {
  if (!walletNet) return false;
  const n = walletNet.toLowerCase() === 'public' ? 'mainnet' : walletNet.toLowerCase();
  return n !== EXPECTED_NETWORK;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    walletId: null,
    isConnected: false,
    isConnecting: false,
    isInstalled: false,
    networkMismatch: false,
  });

  useEffect(() => {
    initWalletKit();

    (async () => {
      let anyInstalled = false;
      for (const w of APPROVED_WALLETS) {
        if (await w.isInstalled()) {
          anyInstalled = true;
          break;
        }
      }

      if (!anyInstalled) {
        setState(s => ({ ...s, isInstalled: false }));
        setIsCheckingWallet(false);
        return;
      }

      setState(s => ({ ...s, isInstalled: true }));

      // Restore any previously-granted wallet session (Freighter returns the
      // address without prompting when already allowed; others may too).
      for (const w of APPROVED_WALLETS) {
        try {
          if (!(await w.isInstalled())) continue;
          StellarWalletsKit.setWallet(w.id);
          const { address } = await StellarWalletsKit.fetchAddress();
          if (!address) continue;
          const net = await probeWalletNetwork(w.id);
          setActiveWallet(w.id);
          setState({
            publicKey: address,
            walletId: w.id,
            isConnected: true,
            isConnecting: false,
            isInstalled: true,
            networkMismatch: networkMismatchFor(net),
          });
          // Ensure a Supabase session exists for the restored wallet connection.
          await signInWithWallet(address).catch(() => { });
          setIsCheckingWallet(false);
          return;
        } catch {
          // Wallet not granted yet — try the next approved wallet.
        }
      }

      setIsCheckingWallet(false);
    })();
  }, []);

  const connect = useCallback(async (walletId: string): Promise<string> => {
    setState(s => ({ ...s, isConnecting: true }));
    try {
      StellarWalletsKit.setWallet(walletId);
      const result = await StellarWalletsKit.fetchAddress();
      const address = result.address;
      const net = await probeWalletNetwork(walletId);
      setActiveWallet(walletId);
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
