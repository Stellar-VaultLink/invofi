/**
 * Unit tests for src/lib/encryption.ts (issue #228).
 *
 * jsdom (the Vitest test environment) exposes globalThis.crypto backed by
 * Node.js's WebCrypto implementation, so we can exercise the real API without
 * any mocking.  If for some reason the global is missing (older Node / unusual
 * CI config) we polyfill it from 'node:crypto' below.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  deriveSharedSecret,
  deriveEncryptionKey,
  encryptMessage,
  decryptMessage,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './encryption';

// ── Polyfill: ensure globalThis.crypto is available ──────────────────────────
// jsdom provides it, but guard for environments where it might be missing.
beforeAll(async () => {
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = await import('node:crypto');
    // @ts-expect-error – polyfill
    globalThis.crypto = webcrypto;
  }
});

// ── deriveSharedSecret ────────────────────────────────────────────────────────

describe('deriveSharedSecret', () => {
  const A = 'GBXXX...ADDRESS_A';
  const B = 'GBYYY...ADDRESS_B';

  it('is symmetric — same secret regardless of argument order', () => {
    expect(deriveSharedSecret(A, B)).toBe(deriveSharedSecret(B, A));
  });

  it('produces a deterministic output', () => {
    const s1 = deriveSharedSecret(A, B);
    const s2 = deriveSharedSecret(A, B);
    expect(s1).toBe(s2);
  });

  it('includes both addresses in the result', () => {
    const secret = deriveSharedSecret(A, B);
    // One address must appear before the colon, the other after.
    const [part1, part2] = secret.split(':');
    expect([part1, part2].sort()).toEqual([A, B].sort());
  });

  it('differs when addresses differ', () => {
    const C = 'GBZZZ...ADDRESS_C';
    expect(deriveSharedSecret(A, B)).not.toBe(deriveSharedSecret(A, C));
  });
});

// ── base64 helpers ────────────────────────────────────────────────────────────

describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 128, 255, 42]);
    const b64 = arrayBufferToBase64(original.buffer);
    const recovered = new Uint8Array(base64ToArrayBuffer(b64));
    expect(Array.from(recovered)).toEqual(Array.from(original));
  });

  it('produces a non-empty string for non-empty input', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    expect(arrayBufferToBase64(buf).length).toBeGreaterThan(0);
  });
});

// ── encrypt / decrypt round-trip ──────────────────────────────────────────────

describe('encryptMessage / decryptMessage', () => {
  it('round-trips a plaintext string', async () => {
    const secret = deriveSharedSecret('ADDR_A', 'ADDR_B');
    const key = await deriveEncryptionKey(secret);

    const plaintext = 'Hello, InvoFi — private message 🔒';
    const ciphertext = await encryptMessage(key, plaintext);
    const recovered = await decryptMessage(key, ciphertext);

    expect(recovered).toBe(plaintext);
  });

  it('produces a base64 string that starts with a 12-byte IV', async () => {
    const key = await deriveEncryptionKey('test-secret-for-iv-check');
    const ciphertext = await encryptMessage(key, 'test');
    // The base64 should decode to at least 12 bytes (IV) + 1 byte (shortest ciphertext).
    const buf = base64ToArrayBuffer(ciphertext);
    expect(buf.byteLength).toBeGreaterThan(12);
  });

  it('two encryptions of the same plaintext produce different ciphertexts (random IV)', async () => {
    const key = await deriveEncryptionKey(deriveSharedSecret('X', 'Y'));
    const p = 'Same plaintext';
    const c1 = await encryptMessage(key, p);
    const c2 = await encryptMessage(key, p);
    // Random IVs mean the two base64 blobs should differ.
    expect(c1).not.toBe(c2);
    // But both decrypt to the same plaintext.
    expect(await decryptMessage(key, c1)).toBe(p);
    expect(await decryptMessage(key, c2)).toBe(p);
  });

  it('different keys produce different ciphertexts', async () => {
    const key1 = await deriveEncryptionKey(deriveSharedSecret('A', 'B'));
    const key2 = await deriveEncryptionKey(deriveSharedSecret('C', 'D'));
    const p = 'Same plaintext, different keys';
    const c1 = await encryptMessage(key1, p);
    const c2 = await encryptMessage(key2, p);
    expect(c1).not.toBe(c2);
  });

  it('decrypting with the wrong key throws', async () => {
    const rightKey = await deriveEncryptionKey(deriveSharedSecret('A', 'B'));
    const wrongKey = await deriveEncryptionKey(deriveSharedSecret('C', 'D'));

    const ciphertext = await encryptMessage(rightKey, 'Secret message');

    await expect(decryptMessage(wrongKey, ciphertext)).rejects.toThrow();
  });

  it('decrypting corrupted data throws', async () => {
    const key = await deriveEncryptionKey('any-secret');
    // A valid base64 blob that is not AES-GCM ciphertext.
    const garbage = btoa('this-is-not-valid-aes-gcm-data-at-all-extra-padding-xyz');
    await expect(decryptMessage(key, garbage)).rejects.toThrow();
  });

  it('handles empty string plaintext', async () => {
    const key = await deriveEncryptionKey('empty-test');
    const ciphertext = await encryptMessage(key, '');
    const recovered = await decryptMessage(key, ciphertext);
    expect(recovered).toBe('');
  });

  it('handles unicode and emoji correctly', async () => {
    const key = await deriveEncryptionKey(deriveSharedSecret('U1', 'U2'));
    const text = '日本語テスト 🌟 émojis & symbols: ©®™';
    expect(await decryptMessage(key, await encryptMessage(key, text))).toBe(text);
  });
});

// ── deriveEncryptionKey ───────────────────────────────────────────────────────

describe('deriveEncryptionKey', () => {
  it('returns a CryptoKey with the correct algorithm', async () => {
    const key = await deriveEncryptionKey('test-key-derivation');
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it('is not extractable (extractable = false)', async () => {
    const key = await deriveEncryptionKey('non-extractable-test');
    expect(key.extractable).toBe(false);
  });

  it('produces the same key for the same input (deterministic derivation)', async () => {
    // We cannot compare CryptoKey objects directly; instead verify they both
    // decrypt the same ciphertext.
    const secret = 'deterministic-secret';
    const k1 = await deriveEncryptionKey(secret);
    const k2 = await deriveEncryptionKey(secret);
    const ciphertext = await encryptMessage(k1, 'verify-determinism');
    expect(await decryptMessage(k2, ciphertext)).toBe('verify-determinism');
  });
});
