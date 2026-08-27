'use client';

/**
 * NotificationBell
 *
 * A bell icon for the Navbar with an unread badge and a popover panel that
 * lists the current user's notifications (issue #179). Uses the same
 * "click-outside-to-close" popover pattern as the keyboard-shortcuts help
 * in Navbar.tsx.
 *
 * Behaviour:
 *  - Unread count badge (red dot) on the bell icon.
 *  - Click opens a dropdown listing notifications (newest first).
 *  - Unread items have a blue left indicator; clicking them marks them read.
 *  - "Mark all read" button at the top of the list.
 *  - Empty state when there are no notifications at all.
 *  - Dropdown closes on outside click, Escape key, or Bell re-click.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellDot, CheckCheck, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications, useUnreadCount } from '@/hooks/useNotifications';
import type { AppNotification } from '@/types';

/** Format a relative time string for notification timestamps. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  const { notifications, loading, markAsRead, markAllRead } = useNotifications();
  const { count: unreadCount } = useUnreadCount();

  const hasUnread = unreadCount > 0;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        toggleRef.current &&
        !toggleRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // Delay adding the listener to avoid the same click that opened the panel
    // from immediately closing it.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Focus management: move focus into the panel on open.
  useEffect(() => {
    if (!open) return;
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
  }, [open]);

  const handleItemClick = useCallback(
    async (n: AppNotification) => {
      if (!n.read_at) {
        await markAsRead(n.id);
      }
    },
    [markAsRead],
  );

  return (
    <div className="relative">
      <button
        ref={toggleRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
        aria-label={hasUnread ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        {hasUnread ? (
          <>
            <BellDot className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </>
        ) : (
          <Bell className="h-5 w-5" />
        )}
      </button>

      {open && (
        <>
          {/* Overlay for click-outside on mobile (also catches clicks on the bell itself) */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg border border-border bg-background shadow-lg overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {hasUnread && (
                <button
                  onClick={() => markAllRead()}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                  aria-label="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto" role="list" aria-label="Notification list">
              {!notifications || notifications.length === 0 ? (
                <div className="flex flex-col items-center py-10 px-4 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No notifications</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Events from your invoices and offers will appear here.
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-accent/50 transition-colors',
                      !n.read_at && 'bg-blue-50/50 dark:bg-blue-950/20',
                    )}
                    aria-label={`${n.title}${n.read_at ? '' : ' (unread)'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Unread indicator */}
                      {!n.read_at && (
                        <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                      )}
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm truncate', !n.read_at ? 'font-semibold text-foreground' : 'text-foreground')}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}