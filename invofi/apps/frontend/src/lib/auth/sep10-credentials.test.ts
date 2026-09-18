// Node environment — the SEP-10 verification path uses node crypto via the
// real SDK; all DB dependencies are injected mocks.
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

import {
  authorizeSep10,
  Sep10AuthorizeError,
  type Sep10AuthorizeDeps,
} from './sep10-credentials';
import {
  buildSep10Challenge,
  verifySep10Challenge,
} from '../sep10-server';

const NETWORK = Networks.TESTNET;

/** Builds a server challenge, signs it as the client wallet, returns the XDR. */
function makeSignedChallenge(serverKeypair: Keypair, clientKeypair: Keypair): string {
  const { transaction } = buildSep10Challenge({
    serverSecret: serverKeypair.secret(),
    clientAccountId: clientKeypair.publicKey(),
    homeDomain: 'invofi.test',
    webAuthDomain: 'invofi.test',
    networkPassphrase: NETWORK,
  });
  const tx = TransactionBuilder.fromXDR(transaction, NETWORK);
  tx.sign(clientKeypair);
  return tx.toEnvelope().toXDR('base64').toString();
}

/** Real deps except the DB-touching ones, which are vi.fn mocks. */
function makeDeps(overrides: Partial<Sep10AuthorizeDeps> = {}): {
  deps: Sep10AuthorizeDeps;
  claim: ReturnType<typeof vi.fn>;
  ensure: ReturnType<typeof vi.fn>;
} {
  const serverKeypair = Keypair.random();
  const claim = vi.fn().mockResolvedValue(true);
  const ensure = vi.fn().mockResolvedValue('11111111-1111-1111-1111-111111111111');
  const deps: Sep10AuthorizeDeps = {
    serverSecret: serverKeypair.secret(),
    verify: verifySep10Challenge,
    config: () => ({
      // Matches the home domain makeSignedChallenge builds challenges with —
      // the real env getters default to 'localhost' when unset.
      homeDomain: 'invofi.test',
      webAuthDomain: 'invofi.test',
      networkPassphrase: NETWORK,
    }),
    claimChallengeHash: claim,
    ensureUser: ensure,
    getUser: async (id) => ({
      id,
      name: 'Demo Originator',
      email: null,
      image: null,
    }),
    ...overrides,
  };
  return { deps, claim, ensure };
}

describe('authorizeSep10', () => {
  it('verifies a correctly signed challenge, claims single-use, and returns the user', async () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();
    const xdr = makeSignedChallenge(serverKeypair, clientKeypair);
    const { deps, claim, ensure } = makeDeps({ serverSecret: serverKeypair.secret() });

    const user = await authorizeSep10({ signedTransactionXdr: xdr }, deps);

    expect(user.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(user.name).toBe('Demo Originator');
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(ensure).toHaveBeenCalledWith(clientKeypair.publicKey(), 'sep10');
  });

  it('throws missing_challenge when credentials are absent', async () => {
    const { deps } = makeDeps();
    await expect(authorizeSep10(undefined, deps)).rejects.toMatchObject({
      code: 'missing_challenge',
    });
  });

  it('throws missing_challenge when the XDR field is not a string', async () => {
    const { deps } = makeDeps();
    await expect(
      authorizeSep10({ signedTransactionXdr: 42 }, deps),
    ).rejects.toMatchObject({ code: 'missing_challenge' });
  });

  it('throws invalid_challenge for a tampered transaction', async () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();
    const xdr = makeSignedChallenge(serverKeypair, clientKeypair);
    const buf = Buffer.from(xdr, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    const { deps, claim, ensure } = makeDeps({ serverSecret: serverKeypair.secret() });

    await expect(
      authorizeSep10({ signedTransactionXdr: tampered }, deps),
    ).rejects.toMatchObject({ code: 'invalid_challenge' });
    expect(claim).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('throws invalid_challenge when the challenge was built for another home domain', async () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();
    // Build with a hostile home domain, then submit to the real config.
    const { transaction } = buildSep10Challenge({
      serverSecret: serverKeypair.secret(),
      clientAccountId: clientKeypair.publicKey(),
      homeDomain: 'evil.example',
      webAuthDomain: 'evil.example',
      networkPassphrase: NETWORK,
    });
    const tx = TransactionBuilder.fromXDR(transaction, NETWORK);
    tx.sign(clientKeypair);
    const { deps } = makeDeps({ serverSecret: serverKeypair.secret() });

    await expect(
      authorizeSep10(
        { signedTransactionXdr: tx.toEnvelope().toXDR('base64').toString() },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'invalid_challenge' });
  });

  it('rejects a replayed challenge (claim returns false) and never creates the user', async () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();
    const xdr = makeSignedChallenge(serverKeypair, clientKeypair);
    const { deps, claim, ensure } = makeDeps({
      serverSecret: serverKeypair.secret(),
      claimChallengeHash: vi.fn().mockResolvedValue(false),
    });

    await expect(
      authorizeSep10({ signedTransactionXdr: xdr }, deps),
    ).rejects.toMatchObject({ code: 'replayed_challenge' });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('fails closed when the replay guard errors (no session minted)', async () => {
    const serverKeypair = Keypair.random();
    const clientKeypair = Keypair.random();
    const xdr = makeSignedChallenge(serverKeypair, clientKeypair);
    const { deps, ensure } = makeDeps({
      serverSecret: serverKeypair.secret(),
      claimChallengeHash: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(
      authorizeSep10({ signedTransactionXdr: xdr }, deps),
    ).rejects.toThrow('db down');
    expect(ensure).not.toHaveBeenCalled();
  });

  it('exposes stable error codes via Sep10AuthorizeError', async () => {
    const err = new Sep10AuthorizeError('x', 'replayed_challenge');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('replayed_challenge');
    expect(err.name).toBe('Sep10AuthorizeError');
  });
});
