'use client';

// ── Live portfolio provider (issue #221) ─────────────────────────────────────
// React context + useReducer that owns the live dashboard state. It loads the
// lender's offers from the Supabase mirror, subscribes to the live engine
// (WebSocket relay → Soroban event polling fallback), and re-derives every
// position row (USD value, APY, earned-to-date, repayment progress) on each
// update. Scoped to the portfolio route via `app/portfolio/layout.tsx`.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { FinancingOffer } from '@invofi/sdk';
import { useWallet } from '@/components/auth/WalletProvider';
import { supabase } from '@/lib/supabase';
import { toStroopsBigInt } from '@/lib/utils';
import { LivePortfolioEngine } from '@/lib/live/engine';
import {
  INITIAL_LIVE_PORTFOLIO_STATE,
  livePortfolioReducer,
} from '@/lib/live/reducer';
import {
  LIVE_CONTRACT_IDS,
  LIVE_NETWORK_PASSPHRASE,
  LIVE_RPC_URL,
  LIVE_WS_URL,
} from '@/lib/live/config';
import { refreshXlmUsdPrice } from '@/lib/live/prices';
import type { ConnectionStatus, LivePosition, LiveTransport } from '@/lib/live/types';

export interface LivePortfolioContextValue {
  positions: LivePosition[];
  connection: ConnectionStatus;
  connectionDetail: string | null;
  transport: LiveTransport;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  /** Force an immediate resync (also refreshes the XLM/USD price). */
  refresh: () => void;
}

const LivePortfolioContext = createContext<LivePortfolioContextValue | null>(null);

export function LivePortfolioProvider({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const [state, dispatch] = useReducer(livePortfolioReducer, INITIAL_LIVE_PORTFOLIO_STATE);
  const engineRef = useRef<LivePortfolioEngine | null>(null);

  // Restart the stream only when the authenticated user actually changes
  // (wallet connect / sign-out), not on every Supabase token refresh.
  const [sessionNonce, setSessionNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let lastUserId: string | null = null;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      lastUserId = data.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void supabase.auth.getUser().then(({ data }) => {
        if (cancelled) return;
        const id = data.user?.id ?? null;
        if (id !== lastUserId) {
          lastUserId = id;
          setSessionNonce(nonce => nonce + 1);
        }
      });
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  /** Full-state fetch: the lender's offers from the Supabase mirror. */
  const fetchPositions = useCallback(async (): Promise<FinancingOffer[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('financing_offers')
      .select('*, invoice:invoices(*)')
      .eq('lender_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      // Surface the failure in state (the engine swallows rejections), so the
      // page shows an error banner instead of a misleading empty portfolio.
      dispatch({ type: 'error', error: `Failed to load financing offers: ${error.message}` });
      return [];
    }
    const rows = (data as unknown as FinancingOffer[]) ?? [];
    // Normalize mirror strings to bigint stroops so math/display are consistent.
    return rows.map(offer => ({
      ...offer,
      amount: toStroopsBigInt(offer.amount),
      amount_repaid: toStroopsBigInt(offer.amount_repaid),
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'loading', loading: true });

    const engine = new LivePortfolioEngine({
      wsUrl: LIVE_WS_URL || null,
      contractIds: LIVE_CONTRACT_IDS,
      rpcUrl: LIVE_RPC_URL,
      networkPassphrase: LIVE_NETWORK_PASSPHRASE,
      fetchPositions,
      onPositions: offers => {
        if (!cancelled) dispatch({ type: 'positions', offers });
      },
      onUpdate: update => {
        if (!cancelled) dispatch({ type: 'update', update });
      },
      onConnectionChange: (connection, transport, detail) => {
        if (cancelled) return;
        dispatch({ type: 'connection', connection, transport, detail });
      },
    });
    engineRef.current = engine;

    void engine.start().finally(() => {
      if (!cancelled) dispatch({ type: 'loading', loading: false });
    });

    return () => {
      cancelled = true;
      engine.stop();
      engineRef.current = null;
    };
  }, [fetchPositions, sessionNonce, publicKey]);

  /** Refresh the XLM/USD price once on mount so USD values are real. */
  useEffect(() => {
    let cancelled = false;
    void refreshXlmUsdPrice().then(() => {
      if (!cancelled) engineRef.current?.resyncNow();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    void refreshXlmUsdPrice().then(() => engineRef.current?.resyncNow());
  }, []);

  const value = useMemo<LivePortfolioContextValue>(
    () => ({
      positions: state.positions,
      connection: state.connection,
      connectionDetail: state.connectionDetail,
      transport: state.transport,
      loading: state.loading,
      error: state.error,
      lastUpdatedAt: state.lastUpdatedAt,
      refresh,
    }),
    [state, refresh],
  );

  return <LivePortfolioContext.Provider value={value}>{children}</LivePortfolioContext.Provider>;
}

export function useLivePortfolio(): LivePortfolioContextValue {
  const ctx = useContext(LivePortfolioContext);
  if (!ctx) {
    throw new Error('useLivePortfolio must be used within a LivePortfolioProvider');
  }
  return ctx;
}