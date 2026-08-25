import { describe, it, expect } from 'vitest';
import {
  clampPage,
  pageCountOf,
  paginate,
  rangeLabel,
} from '@/lib/pagination';

describe('pageCountOf', () => {
  it('returns 0 for empty or invalid input', () => {
    expect(pageCountOf(0, 10)).toBe(0);
    expect(pageCountOf(10, 0)).toBe(0);
    expect(pageCountOf(10, -1)).toBe(0);
  });

  it('computes ceil division', () => {
    expect(pageCountOf(5, 10)).toBe(1);
    expect(pageCountOf(10, 10)).toBe(1);
    expect(pageCountOf(11, 10)).toBe(2);
    expect(pageCountOf(512, 25)).toBe(21);
  });
});

describe('clampPage', () => {
  it('clamps into the valid 1-based range', () => {
    expect(clampPage(0, 100, 10)).toBe(1);
    expect(clampPage(3, 100, 10)).toBe(3);
    expect(clampPage(99, 100, 10)).toBe(10);
    expect(clampPage(-5, 100, 10)).toBe(1);
  });

  it('returns 1 when there are no items', () => {
    expect(clampPage(4, 0, 10)).toBe(1);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 55 }, (_, i) => i + 1); // 1..55

  it('returns the first page by default', () => {
    expect(paginate(items, 1, 10)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it('returns the third page', () => {
    expect(paginate(items, 3, 10)).toEqual(Array.from({ length: 10 }, (_, i) => 21 + i));
  });

  it('returns a short last page', () => {
    expect(paginate(items, 6, 10)).toEqual([51, 52, 53, 54, 55]);
  });

  it('clamps an out-of-range page to the last page', () => {
    expect(paginate(items, 99, 10)).toEqual([51, 52, 53, 54, 55]);
  });

  it('returns an empty array when there are no items', () => {
    expect(paginate([], 1, 10)).toEqual([]);
  });
});

describe('rangeLabel', () => {
  it('formats a standard window', () => {
    expect(rangeLabel(1, 10, 55)).toBe('1–10 of 55');
    expect(rangeLabel(6, 10, 55)).toBe('51–55 of 55');
  });

  it('handles the empty case', () => {
    expect(rangeLabel(1, 10, 0)).toBe('0 of 0');
  });
});