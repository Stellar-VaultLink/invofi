/**
 * Enforces SEP-10 challenge single-use (Task 103 review) — a signature can
 * only ever be replayed if the exact same signed challenge transaction is
 * re-submitted, so recording "this transaction hash has been verified
 * before" and rejecting a repeat is what actually closes the replay window,
 * on top of the existing expiry check in `sep10-server.ts`.
 *
 * Deliberately network-touching (unlike `sep10-server.ts`, which stays pure
 * so it can be unit-tested offline) — this talks to Supabase, so it's kept
 * in its own module and only ever called from the verify Route Handler.
 *
 * Requires a `sep10_used_challenges` table with a UNIQUE (or PRIMARY KEY)
 * constraint on `tx_hash` (see docs/05-authentication.md) — there is no
 * migrations directory in this repo, so it must be created by hand, same as
 * the `wallet_verified` column requirement. Old rows are pruned by a
 * `pg_cron` schedule (see docs/08-environment-variables.md), not by this
 * module — a row past the challenge's own expiry window serves no further
 * replay-protection purpose, since `readChallengeTx` already rejects an
 * expired challenge before this module's check is ever reached.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const TABLE_NAME = 'sep10_used_challenges';

/** Postgres error code for a UNIQUE/PRIMARY KEY constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * Atomically claims `txHash` as used. The INSERT's UNIQUE constraint is the
 * atomicity boundary — concurrent verify requests for the same challenge
 * race on the database's unique index, not on any in-process state, so this
 * is safe across concurrent requests and multiple server instances.
 *
 * Returns `true` when this is the first claim (verification may proceed),
 * `false` when `txHash` was already claimed (replay — caller must reject).
 * Throws on any other failure — callers must treat that as "could not
 * confirm single-use" and fail closed, never proceed to mint a session.
 */
export async function claimSep10ChallengeHash(
  admin: SupabaseClient,
  txHash: string,
): Promise<boolean> {
  const { error } = await admin.from(TABLE_NAME).insert({ tx_hash: txHash });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw new Error(`Failed to record SEP-10 challenge usage: ${error.message}`);
}
