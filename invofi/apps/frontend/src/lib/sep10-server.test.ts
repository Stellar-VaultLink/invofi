// This suite exercises @stellar/stellar-sdk's Ed25519 keypair generation and
// signing directly (no DOM needed) — jsdom's crypto.getRandomValues shim
// returns a value @noble/ed25519 doesn't accept, so run this file under the
// real Node environment instead of the project-wide jsdom default.
// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  buildSep10Challenge,
  verifySep10Challenge,
  getServerNetworkPassphrase,
  getSep10HomeDomain,
  getSep10WebAuthDomain,
} from './sep10-server';

const NETWORK_PASSPHRASE = Networks.TESTNET;
const HOME_DOMAIN = 'invofi.test';
const WEB_AUTH_DOMAIN = 'invofi.test';

/** Signs a server-built challenge XDR as the given client keypair (simulating a wallet). */
function signAsClient(challengeXdr: string, keypair: Keypair): string {
  const transaction = TransactionBuilder.fromXDR(challengeXdr, NETWORK_PASSPHRASE);
  transaction.sign(keypair);
  return transaction.toEnvelope().toXDR('base64').toString();
}

/** Flips the final byte of the XDR (inside the last signature) to simulate tampering. */
function corruptSignature(xdrBase64: string): string {
  const buf = Buffer.from(xdrBase64, 'base64');
  buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;
  return buf.toString('base64');
}

describe('sep10-server', () => {
  afterEach(() => vi.useRealTimers());

  it('builds a challenge and verifies a correctly signed response', () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();

    const { transaction, networkPassphrase } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    expect(networkPassphrase).toBe(NETWORK_PASSPHRASE);
    expect(typeof transaction).toBe('string');

    const signedXdr = signAsClient(transaction, clientKeypair);

    const result = verifySep10Challenge({
      signedTransactionXdr: signedXdr,
      serverSecret: serverKeypair.secret(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    expect(result.clientAccountId).toBe(clientKeypair.publicKey());
    expect(result.transactionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same transactionHash for repeated verification of the same signed challenge', () => {
    // The replay guard (sep10-replay-guard.ts) relies on this hash being
    // stable across calls for the *same* challenge — it's what gets recorded
    // as "used" and checked on a resubmission.
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();

    const { transaction } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const signedXdr = signAsClient(transaction, clientKeypair);

    const params = {
      signedTransactionXdr: signedXdr,
      serverSecret: serverKeypair.secret(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    };
    const first = verifySep10Challenge(params);
    const second = verifySep10Challenge(params);

    expect(second.transactionHash).toBe(first.transactionHash);
  });

  it('returns different transactionHashes for two distinct challenges', () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();

    const challengeA = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const challengeB = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const resultA = verifySep10Challenge({
      signedTransactionXdr: signAsClient(challengeA.transaction, clientKeypair),
      serverSecret: serverKeypair.secret(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const resultB = verifySep10Challenge({
      signedTransactionXdr: signAsClient(challengeB.transaction, clientKeypair),
      serverSecret: serverKeypair.secret(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    expect(resultA.transactionHash).not.toBe(resultB.transactionHash);
  });

  it('rejects an unrecognized clientAccountId', () => {
    const serverKeypair = Keypair.random();

    expect(() =>
      buildSep10Challenge({
        serverSecret: serverKeypair.secret(),
        clientAccountId: 'not-a-real-account',
        homeDomain: HOME_DOMAIN,
        webAuthDomain: WEB_AUTH_DOMAIN,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    ).toThrow();
  });

  it('rejects a challenge signed by the wrong signer', () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();
    const impostorKeypair = Keypair.random();

    const { transaction } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    // Signed by an account that isn't the one the challenge was issued to.
    const signedByImpostor = signAsClient(transaction, impostorKeypair);

    expect(() =>
      verifySep10Challenge({
        signedTransactionXdr: signedByImpostor,
        serverSecret: serverKeypair.secret(),
        homeDomain: HOME_DOMAIN,
        webAuthDomain: WEB_AUTH_DOMAIN,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    ).toThrow();
  });

  it('rejects an expired challenge', () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const { transaction } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
      timeoutSeconds: 1,
    });

    const signedXdr = signAsClient(transaction, clientKeypair);

    // Move well past the 1-second challenge window. Note: the SDK's
    // `readChallengeTx` applies a fixed 5-minute grace period on top of the
    // transaction's own timebounds (`Utils.validateTimebounds(tx, 60 * 5)`),
    // so we must advance further than timeout + 5 minutes, not just past
    // the requested 1-second timeout itself.
    vi.setSystemTime(new Date('2024-01-01T00:10:00Z'));

    expect(() =>
      verifySep10Challenge({
        signedTransactionXdr: signedXdr,
        serverSecret: serverKeypair.secret(),
        homeDomain: HOME_DOMAIN,
        webAuthDomain: WEB_AUTH_DOMAIN,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    ).toThrow();
  });

  it('rejects a tampered transaction (signature no longer matches the payload)', () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();

    const { transaction } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: HOME_DOMAIN,
      webAuthDomain: WEB_AUTH_DOMAIN,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const signedXdr = signAsClient(transaction, clientKeypair);
    const tamperedXdr = corruptSignature(signedXdr);

    expect(() =>
      verifySep10Challenge({
        signedTransactionXdr: tamperedXdr,
        serverSecret: serverKeypair.secret(),
        homeDomain: HOME_DOMAIN,
        webAuthDomain: WEB_AUTH_DOMAIN,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    ).toThrow();
  });

  it('rejects a challenge built for a different home domain', () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();

    const { transaction } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: 'evil.example',
      webAuthDomain: 'evil.example',
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const signedXdr = signAsClient(transaction, clientKeypair);

    expect(() =>
      verifySep10Challenge({
        signedTransactionXdr: signedXdr,
        serverSecret: serverKeypair.secret(),
        homeDomain: HOME_DOMAIN,
        webAuthDomain: WEB_AUTH_DOMAIN,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
    ).toThrow();
  });

  describe('env-driven config getters', () => {
    const ORIGINAL_ENV = { ...process.env };
    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it('falls back to sensible defaults when unset', () => {
      delete process.env.NEXT_PUBLIC_SEP10_HOME_DOMAIN;
      delete process.env.NEXT_PUBLIC_SEP10_WEB_AUTH_DOMAIN;
      delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;

      expect(getSep10HomeDomain()).toBe('localhost');
      expect(getSep10WebAuthDomain()).toBe('localhost');
      expect(getServerNetworkPassphrase()).toBe(Networks.TESTNET);
    });

    it('reads configured values, defaulting web-auth domain to the home domain', () => {
      process.env.NEXT_PUBLIC_SEP10_HOME_DOMAIN = 'invofi.app';
      delete process.env.NEXT_PUBLIC_SEP10_WEB_AUTH_DOMAIN;
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'mainnet';

      expect(getSep10HomeDomain()).toBe('invofi.app');
      expect(getSep10WebAuthDomain()).toBe('invofi.app');
      expect(getServerNetworkPassphrase()).toBe(Networks.PUBLIC);
    });
  });
});
