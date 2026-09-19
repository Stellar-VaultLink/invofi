// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { RESERVED_USERNAMES, validateUsername } from './username';

describe('validateUsername', () => {
  it('accepts a normal handle', () => {
    expect(validateUsername('satoshi_trader')).toEqual({
      ok: true,
      username: 'satoshi_trader',
    });
  });

  it('accepts hyphens and digits at any position', () => {
    expect(validateUsername('a-b_c9').ok).toBe(true);
    expect(validateUsername('123').ok).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(validateUsername(null).ok).toBe(false);
    expect(validateUsername(undefined).ok).toBe(false);
    expect(validateUsername(42).ok).toBe(false);
  });

  it('rejects uppercase and mixed case without normalizing silently', () => {
    const result = validateUsername('Satoshi');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/lowercase/i);
  });

  it('trims outer whitespace before validating, rejects inner spaces', () => {
    expect(validateUsername(' satoshi').ok).toBe(true);
    expect(validateUsername('satoshi ').ok).toBe(true);
    expect(validateUsername('sat os hi').ok).toBe(false);
  });

  it('enforces the 3–30 length window', () => {
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('a'.repeat(3)).ok).toBe(true);
    expect(validateUsername('a'.repeat(30)).ok).toBe(true);
    expect(validateUsername('a'.repeat(31)).ok).toBe(false);
  });

  it('rejects reserved paths and authoritative words', () => {
    for (const reserved of ['admin', 'api', 'auth', 'login', 'setup', 'dashboard']) {
      expect(validateUsername(reserved).ok).toBe(false);
    }
    expect(RESERVED_USERNAMES.size).toBeGreaterThan(10);
  });

  it('rejects special characters outside [a-z0-9_-]', () => {
    expect(validateUsername('satoshi!').ok).toBe(false);
    expect(validateUsername('satoshi.trader').ok).toBe(false);
    expect(validateUsername('satoshi$').ok).toBe(false);
  });
});
