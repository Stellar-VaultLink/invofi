import { describe, expect, it } from 'vitest';
import { computeSha256Hex, hashFingerprint } from './hash';

describe('computeSha256Hex', () => {
  it('hashes known input to the expected hex digest', async () => {
    const digest = await computeSha256Hex(new TextEncoder().encode('abc'));
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('handles empty input', async () => {
    const digest = await computeSha256Hex(new Uint8Array(0));
    expect(digest).toHaveLength(64);
    expect(digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces a stable, lowercase, 64-char hex digest', async () => {
    const bytes = new TextEncoder().encode('invoice-proof-document');
    const digest = await computeSha256Hex(bytes);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashFingerprint', () => {
  const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  it('shortens long hashes to the requested prefix', () => {
    expect(hashFingerprint(hash)).toBe('ba7816bf8f01…');
    expect(hashFingerprint(hash, 6)).toBe('ba7816…');
  });

  it('returns short hashes unchanged', () => {
    expect(hashFingerprint('abc')).toBe('abc');
  });

  it('trims surrounding whitespace', () => {
    expect(hashFingerprint(`  ${hash.slice(0, 6)}  `, 6)).toBe('ba7816');
  });
});