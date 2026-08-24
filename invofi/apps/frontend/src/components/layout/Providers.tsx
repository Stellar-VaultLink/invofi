'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { WalletProvider } from '@/components/auth/WalletProvider';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';

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
        <NotificationProvider>{children}</NotificationProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

