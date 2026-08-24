'use client';

// ── NotificationBell (issue #255) ─────────────────────────────────────────────
// Bell icon with unread-count badge; toggles the NotificationPanel on click.

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from './NotificationProvider';
import { NotificationPanel } from './NotificationPanel';

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((v) => !v);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        id="notification-bell"
        onClick={toggle}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          open && 'bg-accent text-foreground',
        )}
        aria-label={
          unreadCount > 0
            ? `Notifications — ${unreadCount} unread`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold leading-none text-white ring-1 ring-background',
              unreadCount > 9 && 'min-w-[20px]',
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel open={open} onClose={close} />
    </div>
  );
}
