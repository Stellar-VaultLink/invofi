'use client';

// ── NotificationPanel (issue #255) ───────────────────────────────────────────
// Slide-in panel that shows categorised notifications.
// Uses existing Radix Tabs and the project's design system — no new deps.

import { useRouter } from 'next/navigation';
import { X, CheckCheck, Trash2, ChevronDown, BellOff } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationItem } from './NotificationItem';
import { useNotifications } from './NotificationProvider';
import type { AppNotification, NotificationCategory } from '@/types';
import { cn } from '@/lib/utils';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <BellOff className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const router = useRouter();
  const {
    visibleNotifications,
    notificationsByCategory,
    unreadCount,
    hasMore,
    markRead,
    markAllRead,
    dismiss,
    clearAll,
    loadMore,
  } = useNotifications();

  const handleNotificationClick = (notification: AppNotification) => {
    if (notification.subjectId) {
      router.push(`/invoices/${notification.subjectId}`);
      onClose();
    }
  };

  const renderList = (items: AppNotification[]) => {
    if (items.length === 0) {
      return <EmptyState label="No notifications here yet." />;
    }
    return (
      <div role="list" className="divide-y divide-border">
        {items.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onMarkRead={markRead}
            onDismiss={dismiss}
            onClick={handleNotificationClick}
          />
        ))}
      </div>
    );
  };

  const categories: Array<{ value: NotificationCategory | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'offer', label: 'Offers' },
    { value: 'repayment', label: 'Repayments' },
    { value: 'alert', label: 'Alerts' },
  ];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          aria-hidden
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Notifications panel"
        aria-modal="true"
        className={cn(
          'fixed right-4 top-[68px] z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background shadow-2xl transition-all duration-200 origin-top-right',
          open
            ? 'scale-100 opacity-100 pointer-events-auto'
            : 'scale-95 opacity-0 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Mark all as read"
                aria-label="Mark all notifications as read"
                id="notification-mark-all-read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            {visibleNotifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Clear all notifications"
                aria-label="Clear all notifications"
                id="notification-clear-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Close notifications panel"
              id="notification-panel-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="flex flex-col">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
            {categories.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-medium data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Scrollable body */}
          <div className="max-h-[420px] overflow-y-auto">
            <TabsContent value="all" className="m-0 p-1">
              {renderList(visibleNotifications)}
            </TabsContent>

            {categories.slice(1).map(({ value }) => (
              <TabsContent key={value} value={value} className="m-0 p-1">
                {renderList(notificationsByCategory(value as NotificationCategory))}
              </TabsContent>
            ))}
          </div>
        </Tabs>

        {/* Load more */}
        {hasMore && (
          <div className="border-t border-border p-2 text-center">
            <button
              onClick={loadMore}
              className="flex w-full items-center justify-center gap-1 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              id="notification-load-more"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Load more
            </button>
          </div>
        )}
      </div>
    </>
  );
}
