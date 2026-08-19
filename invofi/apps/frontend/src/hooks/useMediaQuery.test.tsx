import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

type MatchMediaController = { setMatches: (matches: boolean) => void; removeEventListener: ReturnType<typeof vi.fn> };

function installMatchMedia(initialMatches = false): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const removeEventListener = vi.fn((_: 'change', listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener));
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return matches; },
    media: '',
    onchange: null,
    addEventListener: (_: 'change', listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  })));
  return {
    setMatches(next) {
      matches = next;
      listeners.forEach(listener => listener({ matches: next } as MediaQueryListEvent));
    },
    removeEventListener,
  };
}

describe('useMediaQuery', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('adopts the browser match state after mounting', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('responds to media-query changes', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'));
    expect(result.current).toBe(false);
    act(() => media.setMatches(true));
    expect(result.current).toBe(true);
  });

  it('removes its listener when unmounted', () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledOnce();
  });
});
