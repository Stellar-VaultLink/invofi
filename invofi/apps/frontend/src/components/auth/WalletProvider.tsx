'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  isFreighterInstalled,
  getFreighterPublicKey,
  connectFreighter,
} from '@/lib/freighter';
import type { WalletState } from '@/types';

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  publicKey: null,
  isConnected: false,
  isConnecting: false,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    isConnected: false,
    isConnecting: false,
  });

  // Restore session on mount
  useEffect(() => {
    isFreighterInstalled().then(async installed => {
      if (!installed) return;
      const key = await getFreighterPublicKey();
      if (key) {
        setState({ publicKey: key, isConnected: true, isConnecting: false });
      }
    });
  }, []);

  const connect = useCallback(async () => {
    setState(s => ({ ...s, isConnecting: true }));
    try {
      const key = await connectFreighter();
      setState({ publicKey: key, isConnected: true, isConnecting: false });
    } catch {
      setState(s => ({ ...s, isConnecting: false }));
      throw new Error('Failed to connect wallet. Make sure Freighter is installed.');
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ publicKey: null, isConnected: false, isConnecting: false });
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
