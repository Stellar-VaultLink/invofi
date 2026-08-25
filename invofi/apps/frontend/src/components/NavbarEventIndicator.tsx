'use client';

import { useEventSubscription } from '@/hooks/useEventSubscription';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';

/**
 * Client component that renders the connection status indicator in the navbar.
 * Extracted to keep Navbar.tsx clean and the event subscription isolated.
 */
export function NavbarEventIndicator() {
  const { status, eventCount } = useEventSubscription();
  return <ConnectionIndicator status={status} eventCount={eventCount} />;
}
