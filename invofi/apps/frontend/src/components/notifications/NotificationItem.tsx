'use client';

// ── NotificationItem (issue #255) ─────────────────────────────────────────────
// A single row in the notification panel.

import { Bell, CheckCircle, AlertTriangle, TrendingUp, Info, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationCategory } from '@/types';

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  offer: TrendingUp,
  repayment: CheckCircle,
  alert: AlertTriangle,
  info: Info,
};

const CATEGORY_COLOR: Record<NotificationCategory, string> = {
  offer: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40',
  repayment: 'text-green-500 bg-green-50 dark:bg-green-950/40',
  alert: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40',
  info: 'text-muted-foreground bg-muted',
};

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Optional click handler for navigating to the relevant invoice/offer. */
  onClick?: (notification: AppNotification) => void;
}

export function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
  onClick,
}: NotificationItemProps) {
  const Icon = CATEGORY_ICON[notification.category] ?? Bell;
  const colorClass = CATEGORY_COLOR[notification.category];

  const handleClick = () => {
    if (!notification.read) onMarkRead(notification.id);
    onClick?.(notification);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(notification.id);
  };

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
    } catch {
      return '';
    }
  })();

  return (
    <div
      role="listitem"
      className={cn(
        'group relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer',
        notification.read
          ? 'hover:bg-muted/60'
          : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30',
      )}
      onClick={handleClick}
      aria-label={`${notification.title}${notification.read ? '' : ' (unread)'}`}
    >
      {/* Category icon */}
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          colorClass,
        )}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-snug',
            notification.read ? 'text-foreground/70 font-normal' : 'text-foreground font-medium',
          )}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{notification.body}</p>
        {timeAgo && (
          <p className="mt-1 text-[10px] text-muted-foreground/60">{timeAgo}</p>
        )}
      </div>

      {/* Unread dot */}
      {!notification.read && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"
          aria-label="Unread"
        />
      )}

      {/* Dismiss button (visible on hover) */}
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex transition-colors"
        aria-label={`Dismiss notification: ${notification.title}`}
        id={`dismiss-notification-${notification.id}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
