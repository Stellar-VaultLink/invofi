'use client';

/**
 * useLenderPreferences
 *
 * Provides read/write access to a lender's matching preferences with a
 * two-tier persistence strategy:
 *
 *   1. localStorage (always) — instant reads, survives page refreshes,
 *      works without a Supabase session.
 *   2. Supabase `lender_preferences` table (when authenticated) — synced
 *      on save and loaded on mount, so preferences survive device switches.
 *
 * The hook is intentionally side-effect free: it does NOT automatically
 * push to Supabase on every change; the caller triggers `save()` explicitly
 * (e.g., on form submit) so network round-trips stay predictable.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  DEFAULT_PREFERENCES,
  deserializePreferences,
  serializePreferences,
} from '@/types/matching';
import type {
  LenderPreferences,
  LenderPreferencesSerialized,
} from '@/types/matching';

const STORAGE_KEY = 'invofi_lender_prefs_v1';

const supabase = createClient();

interface UseLenderPreferencesReturn {
  /** Current preferences (mutable local copy). */
  preferences: LenderPreferences;
  /** Update the local copy (does NOT auto-save to Supabase). */
  setPreferences: (p: LenderPreferences) => void;
  /** Persist to Supabase if the user is authenticated, always writes localStorage. */
  save: (p: LenderPreferences) => Promise<void>;
  /** Reset to defaults and clear both localStorage and Supabase row. */
  reset: () => Promise<void>;
  /** True while the initial Supabase load is in-flight. */
  loading: boolean;
  /** Last save/load error, if any. */
  error: string | null;
  /** True once the hook has finished its initial hydration. */
  hydrated: boolean;
}

export function useLenderPreferences(): UseLenderPreferencesReturn {
  const [serialized, setSerializedStorage] = useLocalStorage<LenderPreferencesSerialized>(
    STORAGE_KEY,
    serializePreferences(DEFAULT_PREFERENCES),
  );

  // Live state (bigint-safe)
  const [preferences, setPreferencesState] = useState<LenderPreferences>(() =>
    deserializePreferences(serialized),
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // On mount: try to load from Supabase if there's an active session
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          // No session — localStorage is the only source of truth
          setPreferencesState(deserializePreferences(serialized));
          return;
        }

        const { data, error: dbError } = await supabase
          .from('lender_preferences')
          .select('*')
          .eq('lender_id', user.id)
          .single();

        if (dbError && dbError.code !== 'PGRST116') {
          // PGRST116 = "no rows returned" — not an error here
          throw dbError;
        }

        if (data && !cancelled) {
          const remote: LenderPreferencesSerialized = {
            riskProfile: data.risk_profile,
            currencyPreference: data.currency_preference,
            minYieldBps: data.min_yield_bps,
            maxAmountStroops: data.max_amount_stroops,
            minAmountStroops: data.min_amount_stroops,
            maxDueDays: data.max_due_days,
          };
          setSerializedStorage(remote);
          setPreferencesState(deserializePreferences(remote));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load preferences');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHydrated(true);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreferences = useCallback((p: LenderPreferences) => {
    setPreferencesState(p);
  }, []);

  const save = useCallback(
    async (p: LenderPreferences) => {
      setError(null);
      const s = serializePreferences(p);

      // Always update localStorage
      setSerializedStorage(s);
      setPreferencesState(p);

      // Persist to Supabase if authenticated
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const row = {
          lender_id: user.id,
          risk_profile: s.riskProfile,
          currency_preference: s.currencyPreference,
          min_yield_bps: s.minYieldBps,
          max_amount_stroops: s.maxAmountStroops,
          min_amount_stroops: s.minAmountStroops,
          max_due_days: s.maxDueDays,
        };

        const { error: upsertError } = await supabase
          .from('lender_preferences')
          .upsert(row, { onConflict: 'lender_id' });

        if (upsertError) throw upsertError;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save preferences');
        // Don't re-throw — the localStorage write already succeeded
      }
    },
    [setSerializedStorage],
  );

  const reset = useCallback(async () => {
    const s = serializePreferences(DEFAULT_PREFERENCES);
    setSerializedStorage(s);
    setPreferencesState(DEFAULT_PREFERENCES);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from('lender_preferences')
          .delete()
          .eq('lender_id', user.id);
      }
    } catch {
      // Best-effort; localStorage is already reset
    }
  }, [setSerializedStorage]);

  return { preferences, setPreferences, save, reset, loading, error, hydrated };
}
