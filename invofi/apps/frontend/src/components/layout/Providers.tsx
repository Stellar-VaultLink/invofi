'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { WalletProvider } from '@/components/auth/WalletProvider';

function ThemeMigration() {
  useEffect(() => {
    // Migrate legacy JSON-stringified theme values (stored by the old
    // useLocalStorage hook) to next-themes' plain-string format.
    try {
      const raw = window.localStorage.getItem('theme');
      if (raw && raw.startsWith('"')) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed === 'light' || parsed === 'dark') {
          window.localStorage.setItem('theme', parsed);
        }
      }
    } catch {
      // ignore malformed values
    }
  }, []);
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
      <NextThemesProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <ThemeMigration />
        <WalletProvider>{children}</WalletProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
