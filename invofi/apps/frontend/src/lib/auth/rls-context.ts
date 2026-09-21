// ── Per-request RLS context (ADR-0009, issue #377) ───────────────────────────
//
// The ONLY sanctioned way to query the four defense-in-depth RLS tables:
// encrypted_messages, pending_transactions, transaction_approvals, audit_log
// (plus `notifications`, whose RLS is mirrored as cheap defense-in-depth).
//
// Postgres RLS reads `app.user_id` — set here per-request via set_config(...,
// is_local => true) on the pooled transaction. A local setting is
// transaction-scoped: it reverts on commit/rollback and cannot leak to the
// next request borrowing the pooled client. The 0002 policies read it
// through the app_user_id() SQL helper (migrations/0002_authz_guards.sql) —
// the 0000 shim's auth.uid() (request.jwt.claim.sub) is deliberately left
// untouched for Supabase-era semantics.
//
// A query on these tables that bypasses the wrapper requirement finds no
// context and is refused by the 0002 policies — the failure mode is loud in
// tests, not a silent full-table read.

import { withClient } from '@/lib/auth/pg';

/** Minimal transactional client surface exposed to wrapped queries. */
export interface UserContextTx {
  query: <R extends import('pg').QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<import('pg').QueryResult<R>>;
}

/** Identity accepted by the wrapper — the subset of AuthzIdentity RLS needs. */
export interface UserContextIdentity {
  /** user_profiles.id — what app_user_id() resolves to inside the policies. */
  userId: string;
  /** SEP-10-proven wallet — what app_user_wallet() resolves to. */
  walletAddress: string;
}

/**
 * Run `fn` inside a transaction whose `app.user_id` is bound to the session
 * identity from requireUser(). Commits on success, rolls back on any error.
 *
 *   const identity = await requireUser();
 *   const rows = await withUserContext(identity, (tx) =>
 *     tx.query('select * from encrypted_messages where invoice_id = $1', [id]),
 *   );
 *
 * The policies compare `app_user_id()` against uuid columns and
 * `app_user_wallet()` against the wallet columns — pass the full identity.
 */
export async function withUserContext<T>(
  identity: UserContextIdentity,
  fn: (tx: UserContextTx) => Promise<T>,
): Promise<T> {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      // is_local => true: the settings die with this transaction.
      await client.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'app.user_id',
        identity.userId,
        'app.user_wallet',
        identity.walletAddress,
      ]);
      const tx: UserContextTx = {
        query: (text, values) => client.query(text, values),
      };
      const result = await fn(tx);
      await client.query('commit');
      return result;
    } catch (err) {
      // Rollback must not mask the original error.
      try {
        await client.query('rollback');
      } catch {
        // client already aborted — nothing to do
      }
      throw err;
    }
  });
}
