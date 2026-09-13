'use client';

// ── Escrow status hook (Epic 3.3) ────────────────────────────────────────────
// Loads the Trustless Work read-model snapshot for every USDC offer that has
// a persisted escrow contract id (`financing_offers.escrow_contract_id`,
// migration 003) and exposes parsed `EscrowStatus` objects keyed by offer id.
//
// Read-only by design: the interactive milestone flow (confirm / approve /
// release) stays on the invoice detail page where the actor's role is known.
// A failed or absent read-model row maps to `null` for that offer — never a
// wrong state: the portfolio card renders "unavailable" and offers a refresh.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FinancingOffer } from '@invofi/sdk';
import {
  getEscrowSnapshot,
  isEscrowEnabled,
  parseEscrowStatus,
  type EscrowStatus,
} from '@/lib/escrow';

/**
 * Mirror-backed offer row: `financing_offers` carries the persisted escrow
 * mapping that pure on-chain reads don't have (same shape OfferList uses).
 */
type EscrowOfferRow = FinancingOffer & { escrow_contract_id?: string | null };

export interface EscrowStatusesResult {
  /**
   * Parsed snapshot per offer id. `undefined` = not loaded yet (renders as
   * loading); `null` = the read model has no row or the read failed.
   */
  byOffer: Record<string, EscrowStatus | null>;
  /** Re-read every escrow snapshot (e.g. after a repaired mapping). */
  refresh: () => void;
}

export function useEscrowStatuses(offers: readonly FinancingOffer[]): EscrowStatusesResult {
  const [byOffer, setByOffer] = useState<Record<string, EscrowStatus | null>>({});
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef(new Set<string>());

  const load = useCallback(async (contractId: string, offerId: string) => {
    // Effect re-runs whenever a snapshot lands; without this guard the
    // not-yet-loaded rows would refetch on every intermediate render.
    if (inFlight.current.has(offerId)) return;
    inFlight.current.add(offerId);
    try {
      const snap = await getEscrowSnapshot(contractId);
      setByOffer(prev => ({ ...prev, [offerId]: parseEscrowStatus(snap, contractId) }));
    } catch {
      // Absent row (stale mapping) or transient read failure — map to null
      // so the UI shows "unavailable" instead of blocking on a skeleton.
      setByOffer(prev => ({ ...prev, [offerId]: null }));
    } finally {
      inFlight.current.delete(offerId);
    }
  }, []);

  useEffect(() => {
    if (!isEscrowEnabled()) return;
    for (const o of offers) {
      if (o.currency !== 'USDC') continue;
      const contractId = (o as EscrowOfferRow).escrow_contract_id;
      if (!contractId || byOffer[o.id] !== undefined) continue;
      void load(contractId, o.id);
    }
  }, [offers, byOffer, load, nonce]);

  const refresh = useCallback(() => {
    // Drop all snapshots and re-read. A response still in flight from before
    // the clear may repopulate one row with marginally older data — harmless
    // for a read-only surface, and the guard above keeps it from looping.
    setByOffer({});
    setNonce(n => n + 1);
  }, []);

  return { byOffer, refresh };
}
