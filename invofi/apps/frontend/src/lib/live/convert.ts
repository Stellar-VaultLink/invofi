// ── Wire-amount conversion (issue #221) ──────────────────────────────────────
// BigInts do not survive JSON, so relay messages carry amounts as integer
// strings that are already in stroops (on-chain i128 values). The general
// `toStroopsBigInt` from `lib/utils` interprets integer strings as *human
// units* (used by the Supabase mirror), which would silently inflate a
// streamed stroop amount by 10⁷. This helper converts wire values explicitly:
// integer strings/numbers → stroops as-is; decimal strings → human units.

import { toStroopsBigInt } from '@/lib/utils';

export function stroopsFromWire(value: bigint | number | string | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    // A JSON number above Number.MAX_SAFE_INTEGER is already rounded before
    // this function sees it — never store a silently-rounded stroop amount.
    // Large wire amounts must arrive as integer strings (on-chain i128).
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`Unsafe numeric wire amount: ${value}`);
    }
    return BigInt(value);
  }
  const s = String(value).trim();
  if (s === '') return 0n;
  // Integer string → already stroops (wire convention).
  if (/^-?\d+$/.test(s)) return BigInt(s);
  // Decimal string → human units from the mirror; convert.
  return toStroopsBigInt(s);
}

/** Like {@link stroopsFromWire} but never throws — malformed values become 0n. */
export function safeStroopsFromWire(value: bigint | number | string | null | undefined): bigint {
  try {
    return stroopsFromWire(value);
  } catch {
    return 0n;
  }
}