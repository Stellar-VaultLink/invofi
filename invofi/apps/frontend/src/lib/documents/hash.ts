/**
 * SHA-256 helpers for invoice documents (issue #222).
 *
 * The hash of a document's bytes is stored alongside its IPFS CID so the
 * content can be re-verified on read and, later, anchored on-chain.
 */

function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of a file's bytes, hex-encoded (64 lowercase chars). */
export async function computeSha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return toHex(digest);
}

/** Human-friendly fingerprint of a document hash (e.g. "a1b2c3d4e5f6…"). */
export function hashFingerprint(hash: string, chars = 12): string {
  const trimmed = hash.trim();
  return trimmed.length > chars ? `${trimmed.slice(0, chars)}…` : trimmed;
}