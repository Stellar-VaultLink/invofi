import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isForbiddenStorageKey, useLocalStorage } from './useLocalStorage';

describe('isForbiddenStorageKey', () => {
  it('flags keys containing secret-like words', () => {
    expect(isForbiddenStorageKey('secret')).toBe(true);
    expect(isForbiddenStorageKey('wallet-privateKey')).toBe(true);
    expect(isForbiddenStorageKey('seed')).toBe(true);
    expect(isForbiddenStorageKey('mnemonic')).toBe(true);
    expect(isForbiddenStorageKey('signature')).toBe(true);
    expect(isForbiddenStorageKey('devicePassword')).toBe(true);
    expect(isForbiddenStorageKey('devicePw')).toBe(true);
    expect(isForbiddenStorageKey('recoveryPhrase')).toBe(true);
  });

  it('allows non-secret keys', () => {
    expect(isForbiddenStorageKey('theme')).toBe(false);
    expect(isForbiddenStorageKey('dashboard-invoice-view')).toBe(false);
    expect(isForbiddenStorageKey('invofi:last-wallet')).toBe(false);
    expect(isForbiddenStorageKey('invofi:invoice-draft:GABC123')).toBe(false);
  });
});

describe('useLocalStorage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns and persists its initial value', () => {
    const { result } = renderHook(() => useLocalStorage('theme', 'light'));
    expect(result.current[0]).toBe('light');
    expect(window.localStorage.getItem('theme')).toBe('"light"');
  });

  it('reads persisted JSON and writes state updates', () => {
    window.localStorage.setItem('draft', JSON.stringify({ amount: '12.50' }));
    const { result } = renderHook(() => useLocalStorage('draft', { amount: '0' }));
    expect(result.current[0]).toEqual({ amount: '12.50' });
    act(() => result.current[1]({ amount: '25.00' }));
    expect(window.localStorage.getItem('draft')).toBe('{"amount":"25.00"}');
  });

  it('falls back to the initial value when persisted JSON is malformed', () => {
    window.localStorage.setItem('view', '{bad json');
    const { result } = renderHook(() => useLocalStorage('view', 'grid'));
    expect(result.current[0]).toBe('grid');
  });

  it('refuses writes for forbidden keys', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useLocalStorage('wallet-secret', 'value'));
    act(() => result.current[1]('new-value'));
    expect(window.localStorage.getItem('wallet-secret')).toBeNull();
    expect(error).toHaveBeenCalled();
  });
});
