import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatAmount,
  formatBasisPoints,
  formatDate,
  formatDuration,
  formatRelativeDate,
  formatWalletAddress,
} from './formatters';

describe('formatters', () => {
  afterEach(() => vi.useRealTimers());

  it('formats stroops as a two-decimal currency amount', () => {
    expect(formatAmount(12_345_678)).toBe('1.23 XLM');
    expect(formatAmount(0, 'USDC')).toBe('0.00 USDC');
    expect(formatAmount(12_345_678, 'XLM')).toBe('1.23 XLM');
  });

  it('formats basis points and durations', () => {
    expect(formatBasisPoints(525)).toBe('5.25%');
    expect(formatDuration(86_400)).toBe('1 day');
    expect(formatDuration(7_200)).toBe('2 hours');
  });

  it('formats Unix-second and millisecond dates consistently', () => {
    expect(formatDate(0)).toBe('Jan 1, 1970');
    expect(formatDate(1_704_067_200)).toBe('Jan 1, 2024');
    expect(formatDate(1_704_067_200_000)).toBe('Jan 1, 2024');
  });

  it('reports past, present, and future relative dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-10T00:00:00Z'));

    expect(formatRelativeDate(1_704_067_200)).toBe('9d overdue');
    expect(formatRelativeDate(1_704_844_800)).toBe('Due today');
    expect(formatRelativeDate(1_704_931_200)).toBe('1d remaining');

  });

  it('shortens only addresses long enough to retain both ends', () => {
    expect(formatWalletAddress('GABCDEF1234567890', 4)).toBe('GABC…7890');
    expect(formatWalletAddress('short', 4)).toBe('short');
  });
});
