import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDemoMode, isMockMode } from './mock-mode';

const ORIGINAL_USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK;
const ORIGINAL_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE;

afterEach(() => {
  if (ORIGINAL_USE_MOCK === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK;
  else process.env.NEXT_PUBLIC_USE_MOCK = ORIGINAL_USE_MOCK;
  if (ORIGINAL_DEMO_MODE === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
  else process.env.NEXT_PUBLIC_DEMO_MODE = ORIGINAL_DEMO_MODE;
  vi.unstubAllEnvs();
});

describe('isMockMode', () => {
  it('is false when neither flag is set', () => {
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(isMockMode()).toBe(false);
  });

  it('is true when NEXT_PUBLIC_USE_MOCK=1', () => {
    process.env.NEXT_PUBLIC_USE_MOCK = '1';
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(isMockMode()).toBe(true);
  });

  it('is true when NEXT_PUBLIC_DEMO_MODE=1 (demo implies mock, issue #107)', () => {
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    process.env.NEXT_PUBLIC_DEMO_MODE = '1';
    expect(isMockMode()).toBe(true);
  });

  it('is false for a non-1 value', () => {
    process.env.NEXT_PUBLIC_USE_MOCK = '0';
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(isMockMode()).toBe(false);
  });
});

describe('isDemoMode', () => {
  it('is false when NEXT_PUBLIC_DEMO_MODE is unset', () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(isDemoMode()).toBe(false);
  });

  it('is true when NEXT_PUBLIC_DEMO_MODE=1', () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = '1';
    expect(isDemoMode()).toBe(true);
  });

  it('mock mode alone does not flip demo mode', () => {
    process.env.NEXT_PUBLIC_USE_MOCK = '1';
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(isDemoMode()).toBe(false);
    expect(isMockMode()).toBe(true);
  });
});
