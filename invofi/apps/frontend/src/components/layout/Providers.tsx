'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { WalletProvider } from '@/components/auth/WalletProvider';
import { useNotificationSeeder } from '@/hooks/useNotifications';

/**
 * Mounts the notification seeder once at the app root. It subscribes to the
 * global protocol event stream and persists user-facing notifications
 * (issue #179). Rendered inside QueryClientProvider so react-query hooks
 * have a client available.
 */
function NotificationSeeder() {
  useNotificationSeeder();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        {children}
        <NotificationSeeder />
      </WalletProvider>
    </QueryClientProvider>
  );
}
