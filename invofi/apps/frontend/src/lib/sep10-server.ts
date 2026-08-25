/**
 * SEP-10 (Stellar Web Authentication) challenge build/verify — server-only,
 * pure functions with no network calls, so they are fully unit-testable
 * offline (see `sep10-server.test.ts`).
 *
 * These are consumed by the Route Handlers under
 * `src/app/api/auth/sep10/{challenge,verify}/route.ts`. Never import this
 * module from client code — `buildSep10Challenge` and `verifySep10Challenge`
 * both take the server's Stellar secret key as a parameter, and it must
 * never reach the browser bundle.
 *
 * Reference: https://stellar.org/protocol/sep-10
 */
import { Keypair, StrKey, WebAuth } from '@stellar/stellar-sdk';

/** Default challenge validity window, per SEP-10 convention. */
export const SEP10_DEFAULT_TIMEOUT_SECONDS = 300;

export function getServerNetworkPassphrase(): string {
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';
}

/**
 * The domain the challenge asserts as the party requesting authentication.
 * Falls back to `localhost` for local development where the var is unset —
 * fails fast instead of silently asserting `localhost` in production, where
 * that would no longer identify this application to the signing wallet.
 */
export function getSep10HomeDomain(): string {
  const configured = process.env.NEXT_PUBLIC_SEP10_HOME_DOMAIN;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_SEP10_HOME_DOMAIN must be configured in production.');
  }
  return 'localhost';
}

/**
 * The domain that issued the challenge. Per SEP-10 this may differ from the
 * home domain (e.g. an `auth.` subdomain); defaults to the home domain when
 * not configured separately.
 */
export function getSep10WebAuthDomain(): string {
  return process.env.NEXT_PUBLIC_SEP10_WEB_AUTH_DOMAIN ?? getSep10HomeDomain();
}

export interface Sep10ChallengeParams {
  /** Server Stellar secret key (S...) — never exposed to the client. */
  serverSecret: string;
  /** The client's Stellar account (G...) requesting to authenticate. */
  clientAccountId: string;
  homeDomain: string;
  webAuthDomain: string;
  networkPassphrase: string;
  timeoutSeconds?: number;
}

export interface Sep10Challenge {
  /** Base64 XDR of the challenge transaction, already signed by the server. */
  transaction: string;
  networkPassphrase: string;
}

/**
 * Builds a SEP-10 challenge transaction signed by the server's key. The
 * client must add its own signature (see `signTransactionWithActiveWallet`
 * in `lib/walletkit.ts`) before it can be verified.
 */
export function buildSep10Challenge(params: Sep10ChallengeParams): Sep10Challenge {
  const {
    serverSecret,
    clientAccountId,
    homeDomain,
    webAuthDomain,
    networkPassphrase,
    timeoutSeconds = SEP10_DEFAULT_TIMEOUT_SECONDS,
  } = params;

  if (!StrKey.isValidEd25519PublicKey(clientAccountId)) {
    throw new Error('clientAccountId must be a valid Stellar public key (G...).');
  }

  const serverKeypair = Keypair.fromSecret(serverSecret);
  const transaction = WebAuth.buildChallengeTx(
    serverKeypair,
    clientAccountId,
    homeDomain,
    timeoutSeconds,
    networkPassphrase,
    webAuthDomain,
  );

  return { transaction, networkPassphrase };
}

export interface Sep10VerifyParams {
  /** Base64 XDR of the challenge transaction, signed by both server and client. */
  signedTransactionXdr: string;
  serverSecret: string;
  homeDomain: string;
  webAuthDomain: string;
  networkPassphrase: string;
}

export interface Sep10VerifyResult {
  /** The Stellar account (G...) proven to control the signing key. */
  clientAccountId: string;
  /**
   * Hex-encoded hash of the challenge transaction (its signature base —
   * stable regardless of which/how many signatures are attached). Callers
   * use this to enforce single-use: see `claimSep10ChallengeHash` in
   * `sep10-replay-guard.ts`. This module stays network-free, so it only
   * computes the hash — it does not check or record anything.
   */
  transactionHash: string;
}

/**
 * Verifies a client-signed SEP-10 challenge transaction. Confirms:
 *  - the transaction is structurally a challenge this server could have
 *    issued (correct source account, sequence number 0, matching home /
 *    web-auth domain — via `WebAuth.readChallengeTx`),
 *  - it has not expired (timebounds, checked against the current time —
 *    `WebAuth.readChallengeTx` throws `InvalidSep10ChallengeError` for an
 *    expired challenge),
 *  - the claimed client account actually signed it (`WebAuth
 *    .verifyChallengeTxSigners`).
 *
 * Throws on any failure — callers must treat a thrown error as "not
 * verified" and never fall back to trusting the claimed account.
 */
export function verifySep10Challenge(params: Sep10VerifyParams): Sep10VerifyResult {
  const { signedTransactionXdr, serverSecret, homeDomain, webAuthDomain, networkPassphrase } =
    params;

  const serverKeypair = Keypair.fromSecret(serverSecret);
  const serverAccountId = serverKeypair.publicKey();

  // Validates challenge shape, sequence-number-zero convention, expiry, and
  // home/web-auth domain — and that the server itself signed it.
  const { tx, clientAccountID } = WebAuth.readChallengeTx(
    signedTransactionXdr,
    serverAccountId,
    networkPassphrase,
    homeDomain,
    webAuthDomain,
  );

  // Confirms the claimed client account is among the transaction's signers
  // (i.e. the wallet actually holds the private key for that address).
  const signersFound = WebAuth.verifyChallengeTxSigners(
    signedTransactionXdr,
    serverAccountId,
    networkPassphrase,
    [clientAccountID],
    homeDomain,
    webAuthDomain,
  );

  if (!signersFound.includes(clientAccountID)) {
    throw new Error('Challenge transaction was not signed by the claimed Stellar account.');
  }

  return { clientAccountId: clientAccountID, transactionHash: tx.hash().toString('hex') };
}
