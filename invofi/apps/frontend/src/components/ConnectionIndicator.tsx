'use client';

import type { ConnectionStatus as StatusType } from '@/hooks/useEventSubscription';

interface ConnectionIndicatorProps {
  status: StatusType;
  eventCount?: number;
}

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; pulse: boolean }> = {
  connected:    { label: 'Live',       color: 'bg-green-500', pulse: false },
  connecting:   { label: 'Connecting', color: 'bg-yellow-500', pulse: true },
  reconnecting: { label: 'Reconnecting', color: 'bg-orange-500', pulse: true },
  disconnected: { label: 'Offline',    color: 'bg-red-500',    pulse: false },
};

/**
 * Compact connection-status badge for the header/footer.
 * Shows a colored dot + label and optionally the event count.
 */
export function ConnectionIndicator({ status, eventCount }: ConnectionIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="relative flex h-2.5 w-2.5">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.color}`}
          />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.color}`} />
      </span>
      <span>{config.label}</span>
      {status === 'connected' && typeof eventCount === 'number' && eventCount > 0 && (
        <span className="text-muted-foreground/60">{eventCount} events</span>
      )}
    </div>
  );
}
