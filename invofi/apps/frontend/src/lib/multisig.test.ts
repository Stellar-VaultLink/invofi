// @vitest-environment node
//
// This suite is pure threshold/expiry logic plus real Stellar SDK crypto
// (Keypair, signing, XDR diffing) — no DOM needed. It must run under the node
// environment: jsdom provides its own Uint8Array realm, so the Node `Buffer`
// that `Keypair.random()` produces fails @noble/ed25519's byte check
// ("expected Uint8Array of length 32, got type=object"). Node keeps Buffer and
// Uint8Array in one realm, so signing works.
import { describe, expect, it, vi } from 'vitest';
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

// The module under test imports the Supabase singleton (which builds a browser
// client at load) and the wallet kit. Neither is exercised by the pure/crypto
// functions below, so stub both to keep the import hermetic.
vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('./walletkit', () => ({
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  signTransactionWithActiveWallet: vi.fn(),
}));

import {
  approvalProgress,
  combineSignatures,
  effectiveStatus,
  extractNewSignatures,
  formatThreshold,
  isExpired,
  requiresMultisig,
  secondsUntilExpiry,
  signatureForAddress,
  thresholdStroops,
} from './multisig';
import type { PendingTransaction, TransactionApproval } from '@/types';

const PASSPHRASE = Networks.TESTNET;

/** An unsigned base payment envelope from `source`, as XDR. */
function buildBaseXdr(source: Keypair): string {
  const account = new Account(source.publicKey(), '123456789');
  return new TransactionBuilder(account, { fee: '100', networkPassphrase: PASSPHRASE })
    .addOperation(
      Operation.payment({ destination: source.publicKey(), asset: Asset.native(), amount: '1' }),
    )
    .setTimeout(60)
    .build()
    .toXDR();
}

/** `baseXdr` re-signed by `kp` (wallet behaviour), as XDR. */
function signWith(baseXdr: string, kp: Keypair): string {
  const tx = TransactionBuilder.fromXDR(baseXdr, PASSPHRASE);
  tx.sign(kp);
  return tx.toXDR();
}

function approvalFrom(address: string): TransactionApproval {
  return {
    id: `id-${address}`,
    pending_tx_id: 'tx',
    approver_address: address,
    approver_id: null,
    signature: 'unused-here',
    created_at: '2026-08-18T00:00:00.000Z',
  };
}

describe('threshold logic', () => {
  it('expresses per-currency thresholds in stroops (7 decimals)', () => {
    expect(thresholdStroops('XLM')).toBe(100_000_000_000n); // 10,000 XLM
    expect(thresholdStroops('USDC')).toBe(10_000_000_000n); //  1,000 USDC
  });

  it('requires multi-sig only for amounts strictly above the threshold', () => {
    expect(requiresMultisig('9999.9999999', 'XLM')).toBe(false);
    expect(requiresMultisig('10000', 'XLM')).toBe(false); // exactly at threshold
    expect(requiresMultisig('10000.0000001', 'XLM')).toBe(true);
    expect(requiresMultisig('10001', 'XLM')).toBe(true);

    expect(requiresMultisig('1000', 'USDC')).toBe(false);
    expect(requiresMultisig('1000.0000001', 'USDC')).toBe(true);
  });

  it('accepts stroops as a bigint', () => {
    expect(requiresMultisig(100_000_000_000n, 'XLM')).toBe(false);
    expect(requiresMultisig(100_000_000_001n, 'XLM')).toBe(true);
  });

  it('treats a malformed amount as not high-value instead of throwing', () => {
    // These reach the banner on every keystroke (e.g. "12." mid-typing); the
    // guard must never let toStroopsBigInt's throw escape.
    for (const bad of ['', '12.', '1e5', 'abc', '.', '-5']) {
      expect(() => requiresMultisig(bad, 'XLM')).not.toThrow();
      expect(requiresMultisig(bad, 'XLM')).toBe(false);
    }
  });

  it('formats a human-readable threshold', () => {
    expect(formatThreshold('XLM')).toBe('10,000 XLM');
    expect(formatThreshold('USDC')).toBe('1,000 USDC');
  });
});

describe('approvalProgress', () => {
  const required = (n: number) => ({ required_signatures: n });

  it('counts distinct approvers toward the requirement', () => {
    const p = approvalProgress(required(3), [approvalFrom('A'), approvalFrom('B')]);
    expect(p.received).toBe(2);
    expect(p.required).toBe(3);
    expect(p.remaining).toBe(1);
    expect(p.thresholdMet).toBe(false);
    expect(p.ratio).toBeCloseTo(2 / 3);
    expect(p.approvers).toEqual(['A', 'B']);
  });

  it('dedupes repeated approvals from the same address', () => {
    const p = approvalProgress(required(3), [approvalFrom('A'), approvalFrom('A')]);
    expect(p.received).toBe(1);
    expect(p.approvers).toEqual(['A']);
  });

  it('reports the threshold met once enough distinct approvals exist', () => {
    const p = approvalProgress(required(3), ['A', 'B', 'C'].map(approvalFrom));
    expect(p.thresholdMet).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.ratio).toBe(1);
  });

  it('never reports negative remaining or ratio above 1 when over-approved', () => {
    const p = approvalProgress(required(3), ['A', 'B', 'C', 'D'].map(approvalFrom));
    expect(p.received).toBe(4);
    expect(p.remaining).toBe(0);
    expect(p.ratio).toBe(1);
  });
});

describe('expiry', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');
  const at = (offsetMs: number) => ({ expires_at: new Date(now + offsetMs).toISOString() });

  it('detects an elapsed approval window', () => {
    expect(isExpired(at(-1000), now)).toBe(true);
    expect(isExpired(at(1000), now)).toBe(false);
  });

  it('reports whole seconds until expiry, floored at zero', () => {
    expect(secondsUntilExpiry(at(3_600_000), now)).toBe(3600);
    expect(secondsUntilExpiry(at(-5000), now)).toBe(0);
  });

  it('treats an unparseable deadline as not-expired with zero seconds', () => {
    expect(isExpired({ expires_at: 'not-a-date' }, now)).toBe(false);
    expect(secondsUntilExpiry({ expires_at: 'not-a-date' }, now)).toBe(0);
  });

  it('folds the timeout into the effective status without mutating terminal states', () => {
    const base = { expires_at: new Date(now - 1000).toISOString() };
    expect(effectiveStatus({ ...base, status: 'Executed' }, now)).toBe('Executed');
    expect(effectiveStatus({ ...base, status: 'Rejected' }, now)).toBe('Rejected');
    expect(effectiveStatus({ ...base, status: 'Expired' }, now)).toBe('Expired');
    // A pending row past its deadline reads as Expired…
    expect(effectiveStatus({ ...base, status: 'Pending' }, now)).toBe('Expired');
    // …but stays Pending while the window is open.
    expect(
      effectiveStatus({ status: 'Pending', expires_at: new Date(now + 1000).toISOString() }, now),
    ).toBe('Pending');
  });
});

describe('signature extraction and combination', () => {
  it('extracts nothing when no signature was added', () => {
    const kp = Keypair.random();
    const base = buildBaseXdr(kp);
    expect(extractNewSignatures(base, base, PASSPHRASE)).toEqual([]);
  });

  it('extracts exactly the wallet-added signature', () => {
    const kp = Keypair.random();
    const base = buildBaseXdr(kp);
    const sigs = extractNewSignatures(base, signWith(base, kp), PASSPHRASE);
    expect(sigs).toHaveLength(1);
  });

  it('extracts only the newly-added signature even when the base already has one', () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const base = buildBaseXdr(kp1);
    const singleSigned = signWith(base, kp1);
    const doubleSigned = signWith(singleSigned, kp2);

    const added = extractNewSignatures(singleSigned, doubleSigned, PASSPHRASE);
    expect(added).toHaveLength(1);
    // It must be kp2's signature, not kp1's.
    const kp2Sig = extractNewSignatures(base, signWith(base, kp2), PASSPHRASE)[0];
    expect(added[0]).toBe(kp2Sig);
  });

  it('combines collected signatures onto the envelope, ignoring duplicates', () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const base = buildBaseXdr(kp1);
    const s1 = extractNewSignatures(base, signWith(base, kp1), PASSPHRASE)[0];
    const s2 = extractNewSignatures(base, signWith(base, kp2), PASSPHRASE)[0];

    const combined = combineSignatures(base, [s1, s2, s1], PASSPHRASE);
    const tx = TransactionBuilder.fromXDR(combined, PASSPHRASE);
    const b64 = tx.signatures.map(s => s.toXDR('base64'));

    expect(tx.signatures).toHaveLength(2); // duplicate s1 dropped
    expect(new Set(b64)).toEqual(new Set([s1, s2]));
  });

  it('produces signatures that verify against the transaction hash', () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const base = buildBaseXdr(kp1);
    const s1 = extractNewSignatures(base, signWith(base, kp1), PASSPHRASE)[0];
    const s2 = extractNewSignatures(base, signWith(base, kp2), PASSPHRASE)[0];

    const tx = TransactionBuilder.fromXDR(combineSignatures(base, [s1, s2], PASSPHRASE), PASSPHRASE);
    const hash = tx.hash();

    for (const kp of [kp1, kp2]) {
      const hint = kp.signatureHint();
      const match = tx.signatures.find(s => Buffer.compare(Buffer.from(s.hint()), hint) === 0);
      expect(match).toBeDefined();
      expect(kp.verify(hash, match!.signature())).toBe(true);
    }
  });
});

describe('signatureForAddress (approval → approver binding)', () => {
  it('returns the newly-added signature that verifies under the address', () => {
    const kp = Keypair.random();
    const base = buildBaseXdr(kp);
    const signed = signWith(base, kp);

    const sig = signatureForAddress(base, signed, kp.publicKey(), PASSPHRASE);
    expect(sig).not.toBeNull();
    // It is exactly the signature the wallet added.
    expect(sig).toBe(extractNewSignatures(base, signed, PASSPHRASE)[0]);
  });

  it('rejects a signature that belongs to a different key than claimed', () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const base = buildBaseXdr(kp1);
    const signedByKp2 = signWith(base, kp2);

    // The envelope carries kp2's signature, but the caller claims kp1 → no match.
    expect(signatureForAddress(base, signedByKp2, kp1.publicKey(), PASSPHRASE)).toBeNull();
    // …and kp2 is correctly matched.
    expect(signatureForAddress(base, signedByKp2, kp2.publicKey(), PASSPHRASE)).not.toBeNull();
  });

  it('ignores signatures already present on the base envelope', () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const base = buildBaseXdr(kp1);
    const singleSigned = signWith(base, kp1); // base + kp1
    const doubleSigned = signWith(singleSigned, kp2); // base + kp1 + kp2

    // Relative to the kp1-signed envelope, only kp2's signature is "new".
    expect(signatureForAddress(singleSigned, doubleSigned, kp1.publicKey(), PASSPHRASE)).toBeNull();
    expect(
      signatureForAddress(singleSigned, doubleSigned, kp2.publicKey(), PASSPHRASE),
    ).not.toBeNull();
  });

  it('returns null for an address that is not a valid ed25519 public key', () => {
    const kp = Keypair.random();
    const base = buildBaseXdr(kp);
    const signed = signWith(base, kp);
    expect(signatureForAddress(base, signed, 'not-a-stellar-key', PASSPHRASE)).toBeNull();
  });

  it('returns null when the wallet added no signature at all', () => {
    const kp = Keypair.random();
    const base = buildBaseXdr(kp);
    expect(signatureForAddress(base, base, kp.publicKey(), PASSPHRASE)).toBeNull();
  });
});
