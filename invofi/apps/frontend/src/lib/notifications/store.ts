// ── Notification store — pure reducer (issue #255) ───────────────────────────
// State is held in NotificationProvider via useReducer; this file owns the
// reducer, action types, default state, and the selector helpers that
// components consume via useNotifications().

import type { AppNotification, NotificationCategory, NotificationPreferences } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum notifications kept in memory before the oldest are pruned. */
export const MAX_NOTIFICATIONS = 200;

/** Number of notifications rendered per "page" in the panel. */
export const PAGE_SIZE = 20;

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  offer_new: true,
  offer_accepted: true,
  offer_rejected: true,
  invoice_overdue: true,
  repayment: true,
  dispute: true,
  browserNotifications: false,
};

// ── State ─────────────────────────────────────────────────────────────────────

export interface NotificationState {
  /** All notifications, newest-first. */
  notifications: AppNotification[];
  /** How many are unread. */
  unreadCount: number;
  /** Which page the panel is showing (1-based). */
  page: number;
  /** True when there are more notifications beyond the current page. */
  hasMore: boolean;
  /** User preferences (persisted separately to localStorage). */
  preferences: NotificationPreferences;
}

export function buildInitialState(
  savedPreferences?: Partial<NotificationPreferences>,
): NotificationState {
  return {
    notifications: [],
    unreadCount: 0,
    page: 1,
    hasMore: false,
    preferences: { ...DEFAULT_PREFERENCES, ...savedPreferences },
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type NotificationAction =
  | { type: 'ADD'; notification: AppNotification }
  | { type: 'MARK_READ'; id: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DISMISS'; id: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'LOAD_MORE' }
  | { type: 'SET_PREFERENCES'; preferences: Partial<NotificationPreferences> };

// ── Reducer ───────────────────────────────────────────────────────────────────

export function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case 'ADD': {
      // Deduplicate by id (listenToEvents can fire the same event twice).
      if (state.notifications.some((n) => n.id === action.notification.id)) {
        return state;
      }
      const updated = [action.notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      const unread = updated.filter((n) => !n.read).length;
      return {
        ...state,
        notifications: updated,
        unreadCount: unread,
        hasMore: updated.length > state.page * PAGE_SIZE,
      };
    }

    case 'MARK_READ': {
      const updated = state.notifications.map((n) =>
        n.id === action.id ? { ...n, read: true } : n,
      );
      return {
        ...state,
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    }

    case 'MARK_ALL_READ': {
      const updated = state.notifications.map((n) => ({ ...n, read: true }));
      return { ...state, notifications: updated, unreadCount: 0 };
    }

    case 'DISMISS': {
      const updated = state.notifications.filter((n) => n.id !== action.id);
      return {
        ...state,
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
        hasMore: updated.length > state.page * PAGE_SIZE,
      };
    }

    case 'CLEAR_ALL':
      return { ...state, notifications: [], unreadCount: 0, page: 1, hasMore: false };

    case 'LOAD_MORE': {
      const nextPage = state.page + 1;
      return {
        ...state,
        page: nextPage,
        hasMore: state.notifications.length > nextPage * PAGE_SIZE,
      };
    }

    case 'SET_PREFERENCES':
      return {
        ...state,
        preferences: { ...state.preferences, ...action.preferences },
      };

    default:
      return state;
  }
}

// ── Selectors ─────────────────────────────────────────────────────────────────

/**
 * Returns the slice of notifications currently visible in the panel
 * (respects pagination).
 */
export function selectVisible(state: NotificationState): AppNotification[] {
  return state.notifications.slice(0, state.page * PAGE_SIZE);
}

/**
 * Filters visible notifications by category for tab rendering.
 */
export function selectByCategory(
  state: NotificationState,
  category: NotificationCategory,
): AppNotification[] {
  return selectVisible(state).filter((n) => n.category === category);
}
