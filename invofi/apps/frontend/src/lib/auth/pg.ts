/**
 * Minimal pg connection layer for the new auth backend (issue #376, ADR-0008).
 *
 * Server-only: this module (and everything under `src/lib/auth/`) is imported
 * exclusively by Route Handlers and the Auth.js middleware entry — the pg Pool
 * and DATABASE_URL must never reach the client bundle. There is deliberately
 * no `NEXT_PUBLIC_` surface here.
 *
 * Scope note: this is the *auth* slice of the #102 storage migration only.
 * The data-access swap (mirrors, listings, documents) is the rest of epic
 * #102 and lands separately; Supabase remains the live backend until
 * cutover. Two server-only env vars feed this layer: `DATABASE_URL`
 * (Neon/local Postgres) and `STELLAR_SERVER_SECRET` (the SEP-10 server
 * signing key consumed by the challenge/verify routes).
 */
import { createHash } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let _pool: Pool | null = null;

/** Lazily-created singleton pool (Auth.js handlers are hot paths). */
export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not configured — the wallet-first auth backend (#376) needs it. ' +
          'See docs/08-environment-variables.md.',
      );
    }
    _pool = new Pool({
      connectionString,
      // Serverless-safe defaults (Neon): small pool, fast idle teardown.
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return _pool;
}

/** Run a single parameterized query. */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/**
 * Borrow a client for multi-statement work (e.g. transactional upserts in the
 * adapter). Callers MUST call `release()`.
 */
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Test seam: close the pool so vitest workers exit cleanly. */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Find the user_profiles row for a Stellar wallet address, creating it (and
 * its auth.users identity row) on first sight.
 *
 * The wallet address is the primary identity key (ADR-0008 Amendment 001):
 * the synthetic auth.users id is derived as UUIDv5 from it so the same wallet
 * always maps to the same profile across environments and replays — no
 * dependent lookup, no race between the two inserts.
 *
 * `source` distinguishes how the wallet was proven:
 *  - `sep10`  — the SEP-10 challenge was cryptographically verified
 *               (sets wallet_verified = true; the only path that may)
 *  - `linked` — blind-trust link from an existing session's settings page
 *               (wallet_verified left as-is/false)
 */
export async function ensureUser(
  walletAddress: string,
  source: 'sep10' | 'linked',
): Promise<string> {
  const userId = uuidV5FromWallet(walletAddress);

  await query(
    `insert into auth.users (id, email)
     values ($1, null)
     on conflict (id) do nothing`,
    [userId],
  );

  await query(
    `insert into user_profiles (id, email, role, display_name, wallet_address, wallet_verified)
     values ($1, null, 'business', null, $2, $3)
     on conflict (id) do update set
       wallet_address = excluded.wallet_address,
       wallet_verified = user_profiles.wallet_verified or excluded.wallet_verified`,
    [userId, walletAddress, source === 'sep10'],
  );

  return userId;
}

/** UUIDv5 in the RFC-4122 "DNS-like" custom namespace, from a wallet address. */
export function uuidV5FromWallet(walletAddress: string): string {
  return uuidV5(WALLET_NAMESPACE, walletAddress.toLowerCase());
}

const WALLET_NAMESPACE = '6f0a0a3a-2f5e-4c1e-9a4b-1f6e2d3c4b5a';

/** Dependency-free UUIDv5 (SHA-1 based, per RFC 4122 §4.3). */
export function uuidV5(namespace: string, name: string): string {
  const nsBytes = namespace.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(nsBytes)) throw new Error('invalid UUID namespace');

  const hash = createHash('sha1');
  hash.update(Buffer.from(nsBytes, 'hex'));
  hash.update(Buffer.from(name, 'utf8'));
  const h = hash.digest();

  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = h.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
