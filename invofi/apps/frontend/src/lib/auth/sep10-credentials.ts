/**
 * The SEP-10 Credentials provider's authorize handler (issue #376, ADR-0008
 * decision 2). This is the heart of the wallet-first backend: it verifies the
 * client-signed SEP-10 challenge server-side, enforces single-use (replay
 * guard, same behavior as the legacy Supabase path), and binds the proven
 * wallet address to a profile row.
 *
 * Isolated and unit-testable by design: all I/O (SDK verification, replay
 * guard, user upsert) arrives as injectable dependencies. The route-level
 * wiring passes the real implementations.
 *
 * The client-visible SEP-10 contract is UNCHANGED from the Supabase flow
 * (ADR-0008): GET /api/auth/sep10/challenge mints the challenge, the wallet
 * signs it, and the signed XDR lands here. Only the session-minting step
 * behind it changes.
 */
import type { User } from 'next-auth';

export interface Sep10Credentials {
  /** Base64 XDR of the challenge transaction, signed by server + client. */
  signedTransactionXdr?: unknown;
}

export interface Sep10AuthorizeDeps {
  /** Server Stellar secret key (S...). Never reaches the client. */
  serverSecret: string;
  /** SEP-10 build/verify — the pure functions from lib/sep10-server.ts. */
  verify: (params: {
    signedTransactionXdr: string;
    serverSecret: string;
    homeDomain: string;
    webAuthDomain: string;
    networkPassphrase: string;
  }) => { clientAccountId: string; transactionHash: string };
  /** Home/web-auth domain + network getters (lib/sep10-server.ts). */
  config: () => { homeDomain: string; webAuthDomain: string; networkPassphrase: string };
  /**
   * Single-use claim on the challenge hash. `false` = replay — reject.
   * Thrown errors = "could not confirm" — fail closed.
   */
  claimChallengeHash: (txHash: string) => Promise<boolean>;
  /** Find-or-create the profile row; returns the Auth.js user id. */
  ensureUser: (walletAddress: string, source: 'sep10' | 'linked') => Promise<string>;
  /** Optional adapter-level user lookup (used to preserve display_name). */
  getUser: (id: string) => Promise<User | null>;
}

/** Error type the route layer maps to user-facing messages. */
export class Sep10AuthorizeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'missing_challenge'
      | 'invalid_challenge'
      | 'replayed_challenge',
  ) {
    super(message);
    this.name = 'Sep10AuthorizeError';
  }
}

export async function authorizeSep10(
  credentials: Sep10Credentials | undefined,
  deps: Sep10AuthorizeDeps,
): Promise<User> {
  if (
    !credentials ||
    typeof credentials.signedTransactionXdr !== 'string' ||
    credentials.signedTransactionXdr.length === 0
  ) {
    throw new Sep10AuthorizeError(
      'Missing signed SEP-10 challenge transaction.',
      'missing_challenge',
    );
  }

  // 1. Server-side cryptographic verification (shape, expiry, signers).
  let verified: { clientAccountId: string; transactionHash: string };
  try {
    const cfg = deps.config();
    verified = deps.verify({
      signedTransactionXdr: credentials.signedTransactionXdr,
      serverSecret: deps.serverSecret,
      homeDomain: cfg.homeDomain,
      webAuthDomain: cfg.webAuthDomain,
      networkPassphrase: cfg.networkPassphrase,
    });
  } catch (err) {
    throw new Sep10AuthorizeError(
      `SEP-10 verification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      'invalid_challenge',
    );
  }

  // 2. Single-use enforcement — atomic claim on the challenge hash.
  //    Must succeed BEFORE any session is minted; failures fail closed.
  const firstUse = await deps.claimChallengeHash(verified.transactionHash);
  if (!firstUse) {
    throw new Sep10AuthorizeError(
      'This SEP-10 challenge was already used.',
      'replayed_challenge',
    );
  }

  // 3. Bind the proven wallet to a profile row (SEP-10-verified ⇒
  //    wallet_verified = true, preserving the legacy distinction).
  const userId = await deps.ensureUser(verified.clientAccountId, 'sep10');
  const user = await deps.getUser(userId);

  return (
    user ?? {
      id: userId,
      name: null,
      email: null,
      image: null,
    }
  );
}
