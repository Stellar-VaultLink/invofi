'use client';

// ── Live connection status pill (issue #221) ─────────────────────────────────
// Always-visible indicator of the dashboard's data source:
//   • green  — streaming over WebSocket
//   • blue   — polling fallback (Soroban events + Supabase resync)
//   • amber  — connecting / reconnecting (with backoff detail)
//   • red    — no live source available

import { useLivePortfolio } from './LivePortfolioProvider';
import type { ConnectionStatus } from '@/lib/live/types';
import { cn } from '@/lib/utils';

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; className: string }> = {
  connected: {
    label: 'Live · WebSocket',
    dot: 'bg-green-500',
    className:
      'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
  },
  polling: {
    label: 'Live · Polling',
    dot: 'bg-blue-500',
    className:
      'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  },
  connecting: {
    label: 'Connecting…',
    dot: 'bg-amber-500 animate-pulse',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  reconnecting: {
    label: 'Reconnecting…',
    dot: 'bg-amber-500 animate-pulse',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-red-500',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  },
};

export function ConnectionStatus() {
  const { connection, connectionDetail } = useLivePortfolio();
  const meta = STATUS_META[connection];

  return (
    <div
      role="status"
      aria-live="polite"
      title={connectionDetail ?? meta.label}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
        meta.className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
      {connectionDetail && <span className="opacity-70">· {connectionDetail}</span>}
    </div>
  );
}