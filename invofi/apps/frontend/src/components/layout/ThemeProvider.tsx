'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

/**
 * Thin wrapper so the rest of the app imports theming from
 * `@/components/layout/ThemeProvider` rather than reaching into next-themes
 * directly (issue #173). Uses the `class` attribute strategy to match
 * `tailwind.config.ts`'s `darkMode: ['class']`.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
