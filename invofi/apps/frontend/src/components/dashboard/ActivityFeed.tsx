'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ExternalLink, Inbox, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listenToEvents, replayEvents, type ProtocolEvent, type ProtocolEventName } from '@invofi/sdk';
import { rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { useWallet } from '@/components/auth/WalletProvider';
import { formatWalletAddress, formatAmount } from '@/lib/formatters';
import {
  RPC_URL,
  NETWORK_PASSPHRASE,
  REGISTRY_CONTRACT_ID,
  FINANCING_CONTRACT_ID,
  REPAYMENT_CONTRACT_ID,
  explorerTxUrl,
} from '@/lib/constants';
import { isMockMode } from '@/lib/mock-mode';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_DISPLAY_EVENTS = 50;
const REPLAY_LEDGERS = 1000; // ~1.4 hours @ 5 s/ledger
const CONTRACT_IDS = [REGISTRY_CONTRACT_ID, FINANCING_CONTRACT_ID, REPAYMENT_CONTRACT_ID].filter(Boolean);
const EMPTY_EVENT_TYPES: ProtocolEventName[] = [];

// ── Event display metadata ─────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; emoji: string }> = {
  inv_reg:  { label: 'Invoice Registered',  emoji: '📄' },
  inv_amt:  { label: 'Amount Updated',       emoji: '💰' },
  inv_sts:  { label: 'Status Updated',       emoji: '🔄' },
  inv_cxl:  { label: 'Invoice Cancelled',    emoji: '❌' },
  inv_ovd:  { label: 'Invoice Overdue',      emoji: '⚠️' },
  inv_def:  { label: 'Invoice Defaulted',    emoji: '🚫' },
  inv_dsp:  { label: 'Dispute Raised',       emoji: '⚖️' },
  inv_rsl:  { label: 'Dispute Resolved',     emoji: '✅' },
  off_new:  { label: 'Offer Created',        emoji: '💵' },
  off_wdr:  { label: 'Offer Withdrawn',      emoji: '↩️' },
  off_acc:  { label: 'Offer Accepted',       emoji: '🤝' },
  off_rej:  { label: 'Offer Rejected',       emoji: '👎' },
  off_def:  { label: 'Offer Defaulted',      emoji: '💥' },
  pos_mint: { label: 'Position Token Minted', emoji: '🪙' },
  inv_rep:  { label: 'Invoice Repaid',       emoji: '💸' },
  pool_stk: { label: 'Pool Staked',          emoji: '🏦' },
  pool_un:  { label: 'Pool Unstaked',        emoji: '🏦' },
  pool_pay: { label: 'Pool Payout',          emoji: '💵' },
  reputn:   { label: 'Reputation Recorded',  emoji: '⭐' },
};

// ── Pure helper: event → human-readable description ────────────────────────

/**
 * Produce a one-line human-readable description of a protocol event.
 * Pure function — no side effects, testable without mocking.
 */
export function formatEventDescription(event: ProtocolEvent): string {
  const meta = EVENT_META[event.type];
  if (!meta) return `Unknown event type: ${event.type}`;

  switch (event.type) {
    case 'inv_reg':
      return `${meta.emoji} ${meta.label} — ${formatWalletAddress(event.data.originator)} ${formatAmount(event.data.amount)}`;
    case 'inv_amt':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.newAmount)}`;
    case 'inv_sts':
      return `${meta.emoji} ${meta.label} — ${event.data.newStatus}`;
    case 'inv_cxl':
      return `${meta.emoji} ${meta.label} — by ${formatWalletAddress(event.data.originator)}`;
    case 'inv_ovd':
      return `${meta.emoji} ${meta.label}`;
    case 'inv_def':
      return `${meta.emoji} ${meta.label} — invoice ${event.data.invoiceId.slice(0, 10)}…`;
    case 'inv_dsp':
      return `${meta.emoji} ${meta.label} — by ${formatWalletAddress(event.data.originator)}`;
    case 'inv_rsl':
      return `${meta.emoji} ${meta.label} — ${event.data.newStatus}`;
    case 'off_new':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.amount)} by ${formatWalletAddress(event.data.lender)}`;
    case 'off_wdr':
      return `${meta.emoji} ${meta.label} — by ${formatWalletAddress(event.data.lender)}`;
    case 'off_acc':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.amount)} by ${formatWalletAddress(event.data.lender)}`;
    case 'off_rej':
      return `${meta.emoji} ${meta.label} — for invoice ${event.data.invoiceId.slice(0, 10)}…`;
    case 'off_def':
      return `${meta.emoji} ${meta.label} — invoice ${event.data.invoiceId.slice(0, 10)}…`;
    case 'pos_mint':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.amount)} for ${formatWalletAddress(event.data.lender)}`;
    case 'inv_rep':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.amount)}${event.data.fullyRepaid ? ' (fully)' : ' (partial)'}`;
    case 'pool_stk':
    case 'pool_un':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.amount)} by ${formatWalletAddress((event.data as { staker: string }).staker)}`;
    case 'pool_pay':
      return `${meta.emoji} ${meta.label} — ${formatAmount(event.data.amount)} to ${formatWalletAddress(event.data.recipient)}`;
    case 'reputn':
      return `${meta.emoji} ${meta.label} — ${event.data.score} for ${formatWalletAddress(event.data.address)}`;
  }
}

/**
 * Format a relative timestamp from a ledger sequence number.
 * Ledgers are produced ≈ every 5 seconds, so `ledger * 5` gives seconds.
 */
export function ledgerToRelativeTime(ledger: number): string {
  // Ledger timestamps are not exact; use a rough estimate.
  const now = Date.now();
  const eventTime = now - ((ledger - 1) * 5 * 1000); // approximate
  const diffSec = Math.floor((now - eventTime) / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Dashboard activity feed (issue #105).
 *
 * Reads recent protocol events via `replayEvents` (initial load) and
 * `listenToEvents` (live updates). Renders a chronological, human-readable
 * list with links to the relevant invoice detail page and Stellar Expert.
 *
 * Displays the last N events globally (or per connected account once
 * account-scoped filtering is available in the SDK). Shows an empty state
 * when no events exist and refreshes without a full page reload.
 */
export function ActivityFeed() {
  const { publicKey } = useWallet();
  const [events, setEvents] = useState<ProtocolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Dedup key for a protocol event.
  const eventKey = (e: ProtocolEvent) => `${e.txHash}:${e.type}:${e.subjectId}`;

  // Append a single event to the list (with dedup + cap).
  const addEvent = (e: ProtocolEvent) => {
    if (!mountedRef.current) return;
    const key = eventKey(e);
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    setEvents(prev => {
      const next = [e, ...prev];
      return next.slice(0, MAX_DISPLAY_EVENTS);
    });
  };

  // Append multiple events (from replay), sorted by ledger.
  const addEvents = (newEvents: ProtocolEvent[]) => {
    if (!mountedRef.current) return;
    const deduped: ProtocolEvent[] = [];
    for (const e of newEvents) {
      const key = eventKey(e);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      deduped.push(e);
    }
    setEvents(prev => {
      const combined = [...prev, ...deduped];
      // Sort descending by ledger (newest first).
      combined.sort((a, b) => b.ledger - a.ledger);
      return combined.slice(0, MAX_DISPLAY_EVENTS);
    });
  };

  useEffect(() => {
    if (isMockMode()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 1. Get the latest ledger to compute the replay window.
        const server = new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
        const { sequence: latestLedger } = await server.getLatestLedger();
        if (cancelled) return;

        const fromLedger = Math.max(1, latestLedger - REPLAY_LEDGERS);

        // 2. Replay recent events for initial display.
        const initialEvents = await replayEvents({
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          from: fromLedger,
          to: latestLedger,
          contractIds: CONTRACT_IDS,
        });
        if (cancelled) return;

        if (initialEvents.length > 0) {
          addEvents(initialEvents);
        }

        // 3. Start live polling for new events.
        const stop = listenToEvents({
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          contractIds: CONTRACT_IDS,
          startLedger: latestLedger + 1,
          pollIntervalMs: 10_000, // 10 seconds
          onEvent: addEvent,
          onError: () => {
            // Silently ignore polling errors — the feed continues.
          },
        });
        stopRef.current = stop;
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load activity feed');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isMockMode()) {
    return null; // Activity feed is not available in offline demo mode.
  }

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
        <CardDescription>
          {publicKey
            ? 'Protocol events for your account'
            : 'Connect a wallet to see account-specific events. Showing global events.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading events…
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Unable to load activity feed.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No protocol activity yet.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Events will appear here as protocol actions occur.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <li
                key={eventKey(event)}
                className="flex items-start gap-3 px-2 py-2.5 rounded-md hover:bg-accent/50 transition-colors"
              >
                <span className="text-base leading-5 mt-0.5 shrink-0">
                  {EVENT_META[event.type]?.emoji ?? '📋'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    {formatEventDescription(event)}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {ledgerToRelativeTime(event.ledger)}
                    </span>
                    <span className="text-xs text-muted-foreground/60 font-mono">
                      #{event.subjectId}
                    </span>
                    <a
                      href={explorerTxUrl(event.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Explorer
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}