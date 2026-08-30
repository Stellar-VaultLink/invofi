/**
 * Theme toggle tests for Navbar (issue #173 — dark mode via next-themes).
 *
 * The Navbar pulls in a lot of unrelated app plumbing (wallet state,
 * notifications, keyboard shortcuts, i18n, routing), so those are stubbed
 * out here the same way NotificationBell.test.tsx isolates its component —
 * this file only exercises the theme toggle button, wrapped in the real
 * next-themes `ThemeProvider` so persistence and `resolvedTheme` behave
 * exactly as they do in the app.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Navbar } from '@/components/layout/Navbar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/auth/WalletButton', () => ({
  WalletButton: () => <div data-testid="wallet-button" />,
}));

vi.mock('@/components/auth/WalletProvider', () => ({
  useWallet: () => ({ networkMismatch: false }),
}));

vi.mock('@/components/NavbarEventIndicator', () => ({
  NavbarEventIndicator: () => null,
}));

vi.mock('@/components/NotificationBell', () => ({
  NotificationBell: () => null,
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    helpOpen: false,
    setHelpOpen: vi.fn(),
    shortcuts: [],
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue(undefined) } },
}));

// next-themes reads the system preference via matchMedia; jsdom doesn't
// implement it, so stub a "light" system preference.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  document.documentElement.classList.remove('dark');
});

function renderNavbar() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme">
      <Navbar />
    </ThemeProvider>,
  );
}

describe('Navbar theme toggle', () => {
  it('defaults to the system (light) theme and shows the moon icon', async () => {
    renderNavbar();
    const toggle = await screen.findByRole('button', { name: 'toggleTheme' });
    expect(toggle).toBeTruthy();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('switches to dark mode on click, applying the `dark` class and persisting to localStorage', async () => {
    renderNavbar();
    const toggle = await screen.findByRole('button', { name: 'toggleTheme' });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('toggles back to light mode on a second click', async () => {
    renderNavbar();
    const toggle = await screen.findByRole('button', { name: 'toggleTheme' });

    fireEvent.click(toggle);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));

    fireEvent.click(toggle);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  it('persists the selected theme across remounts (simulating a reload)', async () => {
    const { unmount } = renderNavbar();
    const toggle = await screen.findByRole('button', { name: 'toggleTheme' });
    fireEvent.click(toggle);
    await waitFor(() => expect(window.localStorage.getItem('theme')).toBe('dark'));
    unmount();

    renderNavbar();
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
