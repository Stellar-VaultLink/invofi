import { describe, expect, it } from 'vitest';
import { safeStroopsFromWire, stroopsFromWire } from './convert';

describe('stroopsFromWire', () => {
  it('passes bigints and numbers through as stroops', () => {
    expect(stroopsFromWire(1_000_000n)).toBe(1_000_000n);
    expect(stroopsFromWire(1_000_000)).toBe(1_000_000n);
  });

  it('rejects unsafe numeric amounts instead of storing a rounded value', () => {
    // 9007199254740993 is above Number.MAX_SAFE_INTEGER — a JSON number this
    // large is already rounded before this function sees it.
    expect(() => stroopsFromWire(9_007_199_254_740_993)).toThrow(RangeError);
    expect(() => stroopsFromWire(1.5)).toThrow(RangeError);
    expect(() => stroopsFromWire(NaN)).toThrow(RangeError);
  });

  it('treats integer strings as raw stroops (wire convention)', () => {
    expect(stroopsFromWire('1000000')).toBe(1_000_000n);
    expect(stroopsFromWire('-500')).toBe(-500n);
  });

  it('treats decimal strings as human units, unlike integer strings', () => {
    expect(stroopsFromWire('1.0')).toBe(10_000_000n);
    expect(stroopsFromWire('1.5')).toBe(15_000_000n);
  });

  it('normalizes empty and nullish values', () => {
    expect(stroopsFromWire('')).toBe(0n);
    expect(stroopsFromWire(null)).toBe(0n);
    expect(stroopsFromWire(undefined)).toBe(0n);
  });

  it('safeStroopsFromWire never throws on malformed values', () => {
    expect(safeStroopsFromWire(9_007_199_254_740_993)).toBe(0n);
    expect(safeStroopsFromWire({} as never)).toBe(0n);
    expect(safeStroopsFromWire('not-a-number')).toBe(0n);
    expect(safeStroopsFromWire(1_000_000)).toBe(1_000_000n);
  });
});