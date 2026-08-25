/**
 * End-to-end encryption utilities for InvoFi private invoice messaging (issue #228).
 *
 * All encryption is done in the browser using the built-in Web Crypto API
 * (window.crypto.subtle / globalThis.crypto.subtle).  No external libraries.
 *
 * Key exchange model:
 *   Both parties independently derive the *same* shared secret from their two
 *   wallet addresses (deterministic, symmetric — no out-of-band exchange
 *   needed).  That string secret is then stretched into an AES-256-GCM key via
 *   PBKDF2.  Only parties who know both addresses can derive the key; addresses
 *   are public, so this is weak forward-secrecy — suitable for "private from
 *   casual observers" but not "private from determined on-chain adversaries who
 *   know both addresses".  A full ECDH handshake via Freighter signatures is a
 *   follow-up (tracked in docs/adr/).
 */

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Uint8Array into a value that SubtleCrypto accepts as BufferSource.
 *
 * Returns a fresh Uint8Array copy so that Node.js's SubtleCrypto
 * implementation sees a properly realm-crossed ArrayBuffer.  The return type
 * is `any` because TypeScript 5.6+ generified Uint8Array so that
 * `Uint8Array<ArrayBufferLike>` is no longer assignable to `BufferSource`
 * (see microsoft/TypeScript#61055).  At runtime SubtleCrypto *does* accept
 * Uint8Array — the mismatch is purely a type-level issue.
 */
function toBufferSource(view: Uint8Array): any {
  return new Uint8Array(view);
}

/** Encode an ArrayBuffer to a base64 string. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a base64 string to an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Derive a shared secret string for the conversation between two Stellar
 * addresses.  Sorting ensures both parties produce the same secret regardless
 * of call order.
 */
export function deriveSharedSecret(address1: string, address2: string): string {
  const sorted = [address1, address2].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

/**
 * Derive an AES-256-GCM CryptoKey from a shared secret string using PBKDF2.
 *
 * Salt: the first 16 bytes of the UTF-8 encoded shared secret (deterministic —
 * both parties compute the same salt without communication).
 */
export async function deriveEncryptionKey(sharedSecret: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();

  // Import the raw secret as a PBKDF2 key-derivation key.
  const baseKey = await subtle.importKey(
    'raw',
    toBufferSource(enc.encode(sharedSecret)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  // Use the first 16 bytes of the encoded secret as the salt (deterministic).
  const secretBytes = enc.encode(sharedSecret);
  const salt = secretBytes.slice(0, 16);

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * Returns a base64-encoded string of `[12-byte IV][ciphertext]`.
 */
export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();

  // 12-byte random IV (recommended for AES-GCM).
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    toBufferSource(enc.encode(plaintext)),
  );

  // Concatenate: iv (12 bytes) + ciphertext.
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return arrayBufferToBase64(combined.buffer as ArrayBuffer);
}

/**
 * Decrypt a base64-encoded `[12-byte IV][ciphertext]` back to plaintext.
 *
 * Throws `DOMException` (OperationError) if the key is wrong or the data is
 * corrupt — callers should catch and show a fallback.
 */
export async function decryptMessage(key: CryptoKey, ciphertext: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const dec = new TextDecoder();

  const combined = new Uint8Array(base64ToArrayBuffer(ciphertext));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const plainBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    toBufferSource(encrypted),
  );

  return dec.decode(plainBuffer);
}
