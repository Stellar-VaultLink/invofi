'use client';

/**
 * useNotifications
 *
 * A keep-style polling hook for the in-app notification center (issue #179).
 *
 * Polls the `notifications` Supabase table every 15 seconds (matching the
 * useRealtimeInvoices fallback interval) for the current user's notifications.
 * The event subscription layer (useEventSubscription) also invalidates the
 * query cache when relevant protocol events arrive, so the UI updates without
 * waiting for the next poll tick under normal conditions.
 *
 * Exposes `markAsRead` and `markAllRead` mutations that invalidate the cache
 * on success so the unread badge + list update immediately.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEventSubscription } from '@/hooks/useEventSubscription';
import { createClient } from '@/utils/supabase/client';
import {
  fetchNotifications,
  markAsRead,
  markAllRead,
  unreadCount,
  notificationDraftFromEvent,
  insertNotification,
  type NotificationDraft,
} from '@/lib/notifications';
import type { AppNotification, NotificationType } from '@/types';

const NOTIFICATION_QUERY_KEY = ['notifications'] as const;
const UNREAD_QUERY_KEY = ['notifications', 'unread'] as const;
const POLL_INTERVAL_MS = 15_000;

/** Event types that should trigger a notification cache refresh. */
const NOTIFICATION_EVENT_TYPES = new Set([
  'off_new', 'off_acc', 'off_rej', 'off_wdr',
  'inv_rep', 'inv_cxl', 'inv_ovd', 'inv_def',
]);

// ── useNotifications ────────────────────────────────────────────────────────

interface UseNotificationsReturn {
  /** All notifications, newest first. Null when still loading. */
  notifications: AppNotification[] | null;
  /** True during the initial load. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Mark one notification as read. */
  markAsRead: (id: string) => Promise<void>;
  /** Mark all notifications as read. */
  markAllRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const queryClient = useQueryClient();
  const { status: connectionStatus } = useEventSubscription();
  const isLive = connectionStatus === 'connected';

  // Invalidate notifications on every relevant protocol event.
  const lastEventRef = useRef<string | null>(null);
  const { lastEvent } = useEventSubscription();

  useEffect(() => {
    if (!lastEvent) return;
    const key = `${lastEvent.txHash}:${lastEvent.type}`;
    if (key === lastEventRef.current) return;
    lastEventRef.current = key;

    if (NOTIFICATION_EVENT_TYPES.has(lastEvent.type as NotificationType)) {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY });
    }
  }, [lastEvent, queryClient]);

  const query = useQuery({
    queryKey: NOTIFICATION_QUERY_KEY,
    queryFn: async () => {
      const result = await fetchNotifications();
      return result;
    },
    refetchInterval: isLive ? false : POLL_INTERVAL_MS,
  });

  // ── Mutations ───────────────────────────────────────────────────────────

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await markAsRead(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await markAllRead();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY });
    },
  });

  return {
    notifications: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllRead: markAllReadMutation.mutateAsync,
  };
}

// ── useUnreadCount ──────────────────────────────────────────────────────────

interface UseUnreadCountReturn {
  count: number;
  loading: boolean;
}

export function useUnreadCount(): UseUnreadCountReturn {
  const queryClient = useQueryClient();
  const { lastEvent } = useEventSubscription();

  const lastEventRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastEvent) return;
    const key = `${lastEvent.txHash}:${lastEvent.type}`;
    if (key === lastEventRef.current) return;
    lastEventRef.current = key;

    if (NOTIFICATION_EVENT_TYPES.has(lastEvent.type as NotificationType)) {
      queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY });
    }
  }, [lastEvent, queryClient]);

  const query = useQuery({
    queryKey: UNREAD_QUERY_KEY,
    queryFn: async () => {
      const count = await unreadCount();
      return count;
    },
    // Re-fetch every 30 seconds even when no user interaction occurs.
    refetchInterval: 30_000,
  });

  return {
    count: query.data ?? 0,
    loading: query.isLoading,
  };
}

// ── useNotificationSeeder ────────────────────────────────────────────────────

/**
 * Seed notifications from protocol events (issue #179).
 *
 * Listens to the global event stream and persists a notification whenever a
 * relevant event arrives (offer created/accepted, repayment, cancellation,
 * overdue, default).  Each event is mapped through
 * {@link notificationDraftFromEvent} into a display-ready draft.
 *
 * Wallet targeting: the draft's `forWallet` field (when present) records
 * which wallet the event is *about* — e.g. the lender whose offer was
 * accepted.  The seeder persists the notification for the *current* session
 * user and lets the UI render it; per-wallet routing is intentionally
 * simple (a single shared inbox per authenticated account).  Events with no
 * `forWallet` (repayment, overdue, default) are seeded for everyone.
 *
 * Idempotent: dedups by txHash + type so the same event never creates two
 * notifications.
 */
export function useNotificationSeeder() {
  const { lastEvent } = useEventSubscription();
  const queryClient = useQueryClient();
  const seededRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!lastEvent) return;

    const dedupKey = `${lastEvent.txHash}:${lastEvent.type}`;
    if (seededRef.current.has(dedupKey)) return;
    seededRef.current.add(dedupKey);

    // Bound the set to prevent unbounded growth.
    if (seededRef.current.size > 500) {
      const first = seededRef.current.values().next().value;
      if (first !== undefined) seededRef.current.delete(first);
    }

    const draft = notificationDraftFromEvent(lastEvent);
    if (!draft) return;

    insertNotification(draft).then((ok) => {
      if (ok) {
        queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY });
      }
    });
  }, [lastEvent, queryClient]);
}