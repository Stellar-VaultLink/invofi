import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('updates only after the configured delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'first' } });
    rerender({ value: 'second' });

    expect(result.current).toBe('first');
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('second');
  });

  it('keeps only the latest rapid update', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'first' } });
    rerender({ value: 'second' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'third' });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('first');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('third');
  });

  it('cleans up a pending timer when unmounted', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'first' } });
    rerender({ value: 'second' });
    unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(vi.getTimerCount()).toBe(0);
  });
});
