/**
 * Component smoke tests for NotificationBell (issue #179).
 *
 * Uses vi.mock to isolate the component from react-query/event-subscription
 * plumbing: the two hooks it consumes (useNotifications, useUnreadCount) are
 * replaced with controllable stubs. Run with `NODE_ENV=test npx vitest run`
 * from apps/frontend.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '@/components/NotificationBell';
import type { AppNotification } from '@/types';

// ── Hook stubs ────────────────────────────────────────────────────────────

const notificationsState = {
  notifications: null as AppNotification[] | null,
  loading: false,
  error: null as string | null,
  markAsRead: vi.fn().mockResolvedValue(undefined),
  markAllRead: vi.fn().mockResolvedValue(undefined),
};

const unreadState = {
  count: 0,
  loading: false,
};

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => notificationsState,
  useUnreadCount: () => unreadState,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    user_id: 'user-1',
    type: 'offer_accepted',
    title: 'Offer accepted',
    body: 'Your offer on invoice inv_001 was accepted (1000 units).',
    payload: { invoiceId: 'inv_001' },
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  notificationsState.notifications = null;
  notificationsState.loading = false;
  notificationsState.error = null;
  notificationsState.markAsRead = vi.fn().mockResolvedValue(undefined);
  notificationsState.markAllRead = vi.fn().mockResolvedValue(undefined);
  unreadState.count = 0;
  unreadState.loading = false;
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('NotificationBell', () => {
  it('renders a bell button with no unread badge by default', () => {
    render(<NotificationBell />);
    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toBeTruthy();
  });

  it('shows unread count badge when there are unread notifications', () => {
    unreadState.count = 3;
    render(<NotificationBell />);
    const button = screen.getByRole('button', { name: 'Notifications (3 unread)' });
    expect(button).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('caps the badge count at 99+', () => {
    unreadState.count = 150;
    render(<NotificationBell />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('renders an empty state when there are no notifications', () => {
    notificationsState.notifications = [];
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('No notifications')).toBeTruthy();
  });

  it('opens the panel and lists notifications on click', () => {
    unreadState.count = 2;
    notificationsState.notifications = [
      makeNotification({ id: 'n1', title: 'Offer accepted', body: 'Your offer on invoice inv_001 was accepted (1000 units).' }),
      makeNotification({ id: 'n2', type: 'invoice_repaid', title: 'Invoice fully repaid', body: 'Invoice inv_002 received a repayment.', read_at: new Date().toISOString() }),
    ];
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
    expect(screen.getByText('Offer accepted')).toBeTruthy();
    expect(screen.getByText('Invoice fully repaid')).toBeTruthy();
  });

  it('calls markAllRead from the panel header', () => {
    unreadState.count = 1;
    notificationsState.notifications = [makeNotification()];
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(notificationsState.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('marks a single notification read when an unread item is clicked', () => {
    unreadState.count = 1;
    notificationsState.notifications = [makeNotification({ id: 'n1' })];
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Offer accepted (unread)' }));
    expect(notificationsState.markAsRead).toHaveBeenCalledWith('n1');
  });
});