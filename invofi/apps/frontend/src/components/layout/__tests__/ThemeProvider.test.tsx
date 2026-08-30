/**
 * ThemeProvider tests (issue #173 — dark mode via next-themes).
 *
 * ThemeProvider is a thin pass-through wrapper around next-themes'
 * `ThemeProvider`, so these tests exercise it end-to-end through the DOM
 * rather than mocking next-themes: they confirm the `class` strategy this
 * app relies on (`tailwind.config.ts`'s `darkMode: ['class']`) is actually
 * wired up, and that theme selection round-trips through localStorage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

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
  window.localStorage.removeItem('theme');
});

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      current: {theme}
    </button>
  );
}

describe('ThemeProvider', () => {
  it('renders its children', () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme">
        <p>hello</p>
      </ThemeProvider>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('applies the `dark` class to <html> and persists the choice under the configured storage key', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme">
        <Probe />
      </ThemeProvider>,
    );

    const button = await screen.findByRole('button');
    await act(async () => {
      button.click();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('defaults to system preference (light, since matchMedia is stubbed to no match)', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme">
        <Probe />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
