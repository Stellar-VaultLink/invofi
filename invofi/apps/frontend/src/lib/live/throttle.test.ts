import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPerKeyThrottle } from './throttle';

describe('createPerKeyThrottle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers the leading edge immediately, then coalesces the window', () => {
    vi.useFakeTimers();
    const delivered: Array<[string, number]> = [];
    const throttle = createPerKeyThrottle<number>(1_000, (key, value) => delivered.push([key, value]));

    throttle('a', 1); // leading edge — delivered now
    throttle('a', 2);
    throttle('a', 3);
    throttle('b', 10); // leading edge — delivered now

    expect(delivered).toEqual([
      ['a', 1],
      ['b', 10],
    ]);

    vi.advanceTimersByTime(1_000);

    expect(delivered).toEqual([
      ['a', 1],
      ['b', 10],
      ['a', 3],
    ]);
  });

  it('delivers at most once per interval per key', () => {
    vi.useFakeTimers();
    const delivered: Array<[string, number]> = [];
    const throttle = createPerKeyThrottle<number>(1_000, (key, value) => delivered.push([key, value]));

    throttle('a', 0); // leading edge at t=0
    for (let i = 1; i < 6; i++) {
      throttle('a', i);
      vi.advanceTimersByTime(100);
    }
    // Window opened at t=0 closes at t=1000, delivering the coalesced latest.
    vi.advanceTimersByTime(1_000);
    expect(delivered).toEqual([
      ['a', 0],
      ['a', 5],
    ]);
  });

  it('keeps per-key windows independent', () => {
    vi.useFakeTimers();
    const delivered: string[] = [];
    const throttle = createPerKeyThrottle<string>(1_000, key => delivered.push(key));

    throttle('a', '1');
    vi.advanceTimersByTime(500);
    throttle('b', '2');
    vi.advanceTimersByTime(500); // a window closes (nothing pending); b not yet due
    throttle('a', '3'); // a window is open again → leading edge
    vi.advanceTimersByTime(1_000); // b window closes (nothing pending)

    expect(delivered).toEqual(['a', 'b', 'a']);
  });

  it('flush delivers pending values immediately and cancels armed timers', () => {
    vi.useFakeTimers();
    const delivered: number[] = [];
    const throttle = createPerKeyThrottle<number>(1_000, (_key, value) => delivered.push(value));

    throttle('a', 1); // leading edge
    throttle('a', 2); // pending
    throttle.flush();
    vi.advanceTimersByTime(2_000);

    expect(delivered).toEqual([1, 2]);
  });

  it('stop cancels timers and drops pending values', () => {
    vi.useFakeTimers();
    const delivered: number[] = [];
    const throttle = createPerKeyThrottle<number>(1_000, (_key, value) => delivered.push(value));

    throttle('a', 1); // leading edge already delivered
    throttle('a', 2); // pending — dropped by stop()
    throttle.stop();
    vi.advanceTimersByTime(2_000);

    expect(delivered).toEqual([1]);
  });
});