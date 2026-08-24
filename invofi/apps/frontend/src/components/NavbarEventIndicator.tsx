'use client';

import { useEventSubscription } from '@/hooks/useEventSubscription';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { NotificationBell } from '@/components/notifications/NotificationBell';

/**
 * Client component that renders the connection status indicator and notification
 * bell in the navbar. Extracted to keep Navbar.tsx clean and the event
 * subscription isolated.
 */
export function NavbarEventIndicator() {
  const { status, eventCount } = useEventSubscription();
  return (
    <div className="flex items-center gap-2">
      <NotificationBell />
      <ConnectionIndicator status={status} eventCount={eventCount} />
    </div>
  );
}

