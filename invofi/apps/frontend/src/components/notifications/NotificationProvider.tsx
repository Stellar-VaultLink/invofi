'use client';

// ── NotificationProvider (issue #255) ────────────────────────────────────────
// React context provider that:
//  1. Manages notification state via useReducer + notificationReducer.
//  2. Subscribes to Soroban contract events via useEventSubscription.
//  3. Converts each incoming ProtocolEvent to an AppNotification via eventMap.
//  4. Fires an in-app toast and (optionally) a browser Notification.
//  5. Persists user preferences to localStorage.
//
// Consume via the useNotifications() hook exported at the bottom.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { useEventSubscription } from '@/hooks/useEventSubscription';
import { toast } from '@/components/ui/use-toast';
import {
  notificationReducer,
  buildInitialState,
  selectVisible,
  selectByCategory,
  PAGE_SIZE,
  type NotificationState,
  type NotificationAction,
} from '@/lib/notifications/store';
import { mapEventToNotification } from '@/lib/notifications/eventMap';
import {
  sendBrowserNotification,
  getBrowserNotificationPermission,
} from '@/lib/notifications/browserNotifications';
import type {
  AppNotification,
  NotificationCategory,
  NotificationPreferences,
} from '@/types';

// ── Preferences persistence ───────────────────────────────────────────────────

const PREFS_KEY = 'invofi:notification-preferences';

function loadSavedPreferences(): Partial<NotificationPreferences> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<NotificationPreferences>) : {};
  } catch {
    return {};
  }
}

function savePreferences(prefs: NotificationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or quota — best-effort.
  }
}

// ── Context value shape ───────────────────────────────────────────────────────

export interface NotificationsContextValue {
  /** All notifications visible within the current page (paginated). */
  visibleNotifications: AppNotification[];
  /** Notifications in a specific category (for tab rendering). */
  notificationsByCategory: (category: NotificationCategory) => AppNotification[];
  /** Total unread count (for the bell badge). */
  unreadCount: number;
  /** Whether there are more notifications to load. */
  hasMore: boolean;
  /** Current notification preferences. */
  preferences: NotificationPreferences;
  /** Mark a single notification as read. */
  markRead: (id: string) => void;
  /** Mark all notifications as read. */
  markAllRead: () => void;
  /** Remove a single notification. */
  dismiss: (id: string) => void;
  /** Remove all notifications. */
  clearAll: () => void;
  /** Load the next page of notifications. */
  loadMore: () => void;
  /** Update one or more preference keys. */
  setPreferences: (prefs: Partial<NotificationPreferences>) => void;
  /** Raw state, exposed for tests/advanced consumers. */
  _state: NotificationState;
  _dispatch: React.Dispatch<NotificationAction>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// ── Toast variant helpers ─────────────────────────────────────────────────────

const CATEGORY_VARIANT: Record<NotificationCategory, 'default' | 'destructive'> = {
  offer: 'default',
  repayment: 'default',
  alert: 'destructive',
  info: 'default',
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    notificationReducer,
    undefined,
    () => buildInitialState(loadSavedPreferences()),
  );

  // Subscribe to the Soroban event bus. The hook internally handles
  // exponential-backoff reconnection and deduplication.
  const { lastEvent } = useEventSubscription();

  // React to new events from the event bus.
  useEffect(() => {
    if (!lastEvent) return;

    const notification = mapEventToNotification(lastEvent, state.preferences);
    if (!notification) return;

    dispatch({ type: 'ADD', notification });

    // Fire in-app toast.
    toast({
      title: notification.title,
      description: notification.body,
      variant: CATEGORY_VARIANT[notification.category],
    });

    // Fire OS-level browser notification if permitted and preference is on.
    if (
      state.preferences.browserNotifications &&
      getBrowserNotificationPermission() === 'granted'
    ) {
      sendBrowserNotification({
        title: notification.title,
        body: notification.body,
        tag: notification.id,
      });
    }
    // We intentionally omit `state.preferences` from the dependency array:
    // we only want to re-run when lastEvent changes, reading preferences from
    // the latest state at that point is safe because the closure captures it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  // Persist preferences whenever they change.
  useEffect(() => {
    savePreferences(state.preferences);
  }, [state.preferences]);

  const markRead = useCallback((id: string) => dispatch({ type: 'MARK_READ', id }), []);
  const markAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_READ' }), []);
  const dismiss = useCallback((id: string) => dispatch({ type: 'DISMISS', id }), []);
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);
  const loadMore = useCallback(() => dispatch({ type: 'LOAD_MORE' }), []);
  const setPreferences = useCallback(
    (prefs: Partial<NotificationPreferences>) =>
      dispatch({ type: 'SET_PREFERENCES', preferences: prefs }),
    [],
  );

  const notificationsByCategory = useCallback(
    (category: NotificationCategory) => selectByCategory(state, category),
    [state],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      visibleNotifications: selectVisible(state),
      notificationsByCategory,
      unreadCount: state.unreadCount,
      hasMore: state.hasMore,
      preferences: state.preferences,
      markRead,
      markAllRead,
      dismiss,
      clearAll,
      loadMore,
      setPreferences,
      _state: state,
      _dispatch: dispatch,
    }),
    [
      state,
      notificationsByCategory,
      markRead,
      markAllRead,
      dismiss,
      clearAll,
      loadMore,
      setPreferences,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Access the notification system from any client component.
 * Must be used inside `NotificationProvider`.
 */
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside <NotificationProvider>');
  }
  return ctx;
}

// Re-export PAGE_SIZE so the panel can show "Showing X of Y".
export { PAGE_SIZE };
