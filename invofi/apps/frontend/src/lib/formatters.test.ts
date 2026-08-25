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

  describe('formatAmount', () => {
    it('converts stroops to a two-decimal XLM amount', () => {
      expect(formatAmount(12_345_678)).toBe('1.23 XLM');
      expect(formatAmount(12_345_678, 'XLM')).toBe('1.23 XLM');
    });

    it('handles zero stroops for all supported currencies', () => {
      expect(formatAmount(0)).toBe('0.00 XLM');
      expect(formatAmount(0, 'USDC')).toBe('0.00 USDC');
    });

    it('handles 1 stroop as the smallest unit', () => {
      // 1 stroop = 0.0000001 XLM, rounds to 0.00 at 2 decimal places
      expect(formatAmount(1)).toBe('0.00 XLM');
      expect(formatAmount(1, 'USDC')).toBe('0.00 USDC');
    });

    it('converts exactly 1 XLM (10^7 stroops)', () => {
      // 1e7 stroops = exactly 1 XLM
      expect(formatAmount(10_000_000)).toBe('1.00 XLM');
      expect(formatAmount(10_000_000, 'USDC')).toBe('1.00 USDC');
    });

    it('rounds boundary values correctly', () => {
      // 5,000 stroops = 0.0005 XLM → rounds to 0.00
      expect(formatAmount(5_000)).toBe('0.00 XLM');
      // 5,001 stroops = 0.0005001 XLM → still rounds to 0.00
      expect(formatAmount(5_001)).toBe('0.00 XLM');
      // 50,000 stroops = 0.005 XLM → rounds to 0.01 (rounds up)
      expect(formatAmount(50_000)).toBe('0.01 XLM');
      // 99,999 stroops = 0.0099999 XLM → rounds to 0.01
      expect(formatAmount(99_999)).toBe('0.01 XLM');
      // 999,999 stroops = 0.0999999 XLM → rounds to 0.10
      expect(formatAmount(999_999)).toBe('0.10 XLM');
    });

    it('formats large values with thousands separators', () => {
      // 123,456,789,000 stroops = 12,345.6789 XLM → "12,345.68 XLM"
      expect(formatAmount(123_456_789_000)).toBe('12,345.68 XLM');
      // 1,000,000,000,000 stroops = 100,000 XLM
      expect(formatAmount(1_000_000_000_000)).toBe('100,000.00 XLM');
    });

    it('handles bigint inputs', () => {
      expect(formatAmount(BigInt(10_000_000))).toBe('1.00 XLM');
      expect(formatAmount(BigInt(0))).toBe('0.00 XLM');
      expect(formatAmount(BigInt(12_345_678))).toBe('1.23 XLM');
    });

    it('handles string inputs', () => {
      expect(formatAmount('10000000')).toBe('1.00 XLM');
      expect(formatAmount('0')).toBe('0.00 XLM');
      expect(formatAmount('12345678')).toBe('1.23 XLM');
    });
  });

  describe('formatBasisPoints', () => {
    it('formats typical basis point values', () => {
      expect(formatBasisPoints(525)).toBe('5.25%');
      expect(formatBasisPoints(0)).toBe('0.00%');
      expect(formatBasisPoints(10000)).toBe('100.00%');
      expect(formatBasisPoints(50)).toBe('0.50%');
    });

    it('handles bigint and string basis points', () => {
      expect(formatBasisPoints(BigInt(525))).toBe('5.25%');
      expect(formatBasisPoints('525')).toBe('5.25%');
    });
  });

  describe('formatDuration', () => {
    it('formats durations in days when >= 1 day', () => {
      expect(formatDuration(86_400)).toBe('1 day');
      expect(formatDuration(172_800)).toBe('2 days');
      expect(formatDuration(604_800)).toBe('7 days');
    });

    it('formats durations in hours when < 1 day', () => {
      expect(formatDuration(3_600)).toBe('1 hour');
      expect(formatDuration(7_200)).toBe('2 hours');
      expect(formatDuration(86_399)).toBe('23 hours');
    });

    it('handles zero and very short durations', () => {
      expect(formatDuration(0)).toBe('0 hours');
      expect(formatDuration(1)).toBe('0 hours');
    });

    it('handles bigint and string inputs', () => {
      expect(formatDuration(BigInt(86_400))).toBe('1 day');
      expect(formatDuration('86400')).toBe('1 day');
    });
  });

  describe('formatDate', () => {
    it('formats Unix-second and millisecond dates consistently', () => {
      expect(formatDate(0)).toBe('Jan 1, 1970');
      expect(formatDate(1_704_067_200)).toBe('Jan 1, 2024');
      expect(formatDate(1_704_067_200_000)).toBe('Jan 1, 2024');
    });

    it('handles string and bigint date inputs', () => {
      expect(formatDate('1704067200')).toBe('Jan 1, 2024');
      expect(formatDate(BigInt(1_704_067_200))).toBe('Jan 1, 2024');
    });
  });

  describe('formatRelativeDate', () => {
    it('reports past, present, and future relative dates', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-10T00:00:00Z'));

      expect(formatRelativeDate(1_704_067_200)).toBe('9d overdue');
      expect(formatRelativeDate(1_704_844_800)).toBe('Due today');
      expect(formatRelativeDate(1_704_931_200)).toBe('1d remaining');
    });
  });

  describe('formatWalletAddress', () => {
    it('shortens only addresses long enough to retain both ends', () => {
      expect(formatWalletAddress('GABCDEF1234567890', 4)).toBe('GABC…7890');
      expect(formatWalletAddress('short', 4)).toBe('short');
    });

    it('handles empty and edge-case addresses', () => {
      expect(formatWalletAddress('')).toBe('');
      expect(formatWalletAddress('GABCDEF')).toBe('GABCDEF');
      expect(formatWalletAddress('GABCDEF1234567890123456', 6)).toBe('GABCDE…123456');
    });
  });
});