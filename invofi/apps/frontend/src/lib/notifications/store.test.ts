// ── Notification store unit tests (issue #255) ───────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  notificationReducer,
  buildInitialState,
  selectVisible,
  selectByCategory,
  MAX_NOTIFICATIONS,
  PAGE_SIZE,
  DEFAULT_PREFERENCES,
  type NotificationState,
} from '@/lib/notifications/store';
import type { AppNotification } from '@/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  const id = overrides.id ?? `notif-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    title: 'Test notification',
    body: 'Test body',
    category: 'info',
    read: false,
    createdAt: new Date().toISOString(),
    eventType: 'inv_sts',
    ...overrides,
  };
}

function initialState(): NotificationState {
  return buildInitialState();
}

// ── buildInitialState ─────────────────────────────────────────────────────────

describe('buildInitialState', () => {
  it('starts with empty notifications and zero unread count', () => {
    const state = buildInitialState();
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });

  it('merges saved preferences', () => {
    const state = buildInitialState({ offer_new: false, browserNotifications: true });
    expect(state.preferences.offer_new).toBe(false);
    expect(state.preferences.browserNotifications).toBe(true);
    // Other defaults untouched
    expect(state.preferences.repayment).toBe(true);
  });

  it('keeps default preferences when none are saved', () => {
    const state = buildInitialState();
    expect(state.preferences).toEqual(DEFAULT_PREFERENCES);
  });
});

// ── ADD ───────────────────────────────────────────────────────────────────────

describe('ADD action', () => {
  it('prepends a notification and increments unreadCount', () => {
    const state = notificationReducer(initialState(), {
      type: 'ADD',
      notification: makeNotification({ id: 'a' }),
    });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].id).toBe('a');
    expect(state.unreadCount).toBe(1);
  });

  it('deduplicates notifications with the same id', () => {
    let state = initialState();
    const notif = makeNotification({ id: 'dup' });
    state = notificationReducer(state, { type: 'ADD', notification: notif });
    state = notificationReducer(state, { type: 'ADD', notification: notif });
    expect(state.notifications).toHaveLength(1);
    expect(state.unreadCount).toBe(1);
  });

  it('prunes oldest notifications when cap is exceeded', () => {
    let state = initialState();
    for (let i = 0; i < MAX_NOTIFICATIONS + 5; i++) {
      state = notificationReducer(state, {
        type: 'ADD',
        notification: makeNotification({ id: `n-${i}` }),
      });
    }
    expect(state.notifications).toHaveLength(MAX_NOTIFICATIONS);
  });

  it('does not count already-read notifications as unread', () => {
    const state = notificationReducer(initialState(), {
      type: 'ADD',
      notification: makeNotification({ read: true }),
    });
    expect(state.unreadCount).toBe(0);
  });
});

// ── MARK_READ ─────────────────────────────────────────────────────────────────

describe('MARK_READ action', () => {
  it('marks a single notification as read', () => {
    let state = notificationReducer(initialState(), {
      type: 'ADD',
      notification: makeNotification({ id: 'x' }),
    });
    state = notificationReducer(state, { type: 'MARK_READ', id: 'x' });
    expect(state.notifications[0].read).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it('is a no-op for an unknown id', () => {
    const base = notificationReducer(initialState(), {
      type: 'ADD',
      notification: makeNotification({ id: 'y' }),
    });
    const after = notificationReducer(base, { type: 'MARK_READ', id: 'z' });
    expect(after.unreadCount).toBe(1);
    expect(after.notifications[0].read).toBe(false);
  });
});

// ── MARK_ALL_READ ─────────────────────────────────────────────────────────────

describe('MARK_ALL_READ action', () => {
  it('marks all notifications as read and zeroes unreadCount', () => {
    let state = initialState();
    state = notificationReducer(state, { type: 'ADD', notification: makeNotification({ id: '1' }) });
    state = notificationReducer(state, { type: 'ADD', notification: makeNotification({ id: '2' }) });
    state = notificationReducer(state, { type: 'MARK_ALL_READ' });
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.read)).toBe(true);
  });
});

// ── DISMISS ───────────────────────────────────────────────────────────────────

describe('DISMISS action', () => {
  it('removes a notification by id', () => {
    let state = notificationReducer(initialState(), {
      type: 'ADD',
      notification: makeNotification({ id: 'del' }),
    });
    state = notificationReducer(state, { type: 'DISMISS', id: 'del' });
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });
});

// ── CLEAR_ALL ─────────────────────────────────────────────────────────────────

describe('CLEAR_ALL action', () => {
  it('empties the notification list and resets pagination', () => {
    let state = initialState();
    state = notificationReducer(state, { type: 'ADD', notification: makeNotification() });
    state = notificationReducer(state, { type: 'CLEAR_ALL' });
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
    expect(state.page).toBe(1);
    expect(state.hasMore).toBe(false);
  });
});

// ── LOAD_MORE ─────────────────────────────────────────────────────────────────

describe('LOAD_MORE action', () => {
  it('increments the page', () => {
    const state = notificationReducer(initialState(), { type: 'LOAD_MORE' });
    expect(state.page).toBe(2);
  });
});

// ── SET_PREFERENCES ───────────────────────────────────────────────────────────

describe('SET_PREFERENCES action', () => {
  it('partially updates preferences', () => {
    let state = initialState();
    state = notificationReducer(state, {
      type: 'SET_PREFERENCES',
      preferences: { offer_new: false, browserNotifications: true },
    });
    expect(state.preferences.offer_new).toBe(false);
    expect(state.preferences.browserNotifications).toBe(true);
    expect(state.preferences.repayment).toBe(true); // unchanged
  });

  it('full update replaces all listed keys', () => {
    const newPrefs = {
      offer_new: false,
      offer_accepted: false,
      offer_rejected: false,
      invoice_overdue: false,
      repayment: false,
      dispute: false,
      browserNotifications: true,
    };
    const state = notificationReducer(
      initialState(),
      { type: 'SET_PREFERENCES', preferences: newPrefs },
    );
    expect(state.preferences).toEqual(newPrefs);
  });
});

// ── Selectors ─────────────────────────────────────────────────────────────────

describe('selectVisible', () => {
  it('returns at most PAGE_SIZE notifications on page 1', () => {
    let state = initialState();
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      state = notificationReducer(state, {
        type: 'ADD',
        notification: makeNotification({ id: `v-${i}` }),
      });
    }
    expect(selectVisible(state)).toHaveLength(PAGE_SIZE);
  });
});

describe('selectByCategory', () => {
  it('filters notifications by category', () => {
    let state = initialState();
    state = notificationReducer(state, {
      type: 'ADD',
      notification: makeNotification({ id: 'offer-1', category: 'offer' }),
    });
    state = notificationReducer(state, {
      type: 'ADD',
      notification: makeNotification({ id: 'alert-1', category: 'alert' }),
    });
    expect(selectByCategory(state, 'offer')).toHaveLength(1);
    expect(selectByCategory(state, 'alert')).toHaveLength(1);
    expect(selectByCategory(state, 'repayment')).toHaveLength(0);
  });
});
