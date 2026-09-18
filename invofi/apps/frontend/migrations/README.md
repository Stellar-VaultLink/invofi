# Database migrations

Versioned SQL migrations for the InvoFi database (epic #102 — Postgres/Neon;
baseline tracked in #375).

## Why this directory exists

Before #375, the schema was managed by hand in the Supabase SQL editor — the
`wallet_verified` column on `user_profiles` had to be added manually
(docs/08-environment-variables.md) and the database could not be rebuilt from
scratch. These migrations make the schema reproducible: a fresh Postgres 16
reaches full schema parity with the live project by applying the chain in
order.

## How to run

Against the local docker-compose Postgres (`invofi/docker-compose.yml`):

```bash
docker compose -f invofi/docker-compose.yml up -d
for f in invofi/apps/frontend/migrations/*.sql; do
  docker exec -i invofi-postgres psql -U invofi -d invofi -v ON_ERROR_STOP=1 < "$f"
done
```

Against Neon (or any Postgres 16), apply the files in lexical order with
`psql -v ON_ERROR_STOP=1`. The chain is **idempotent** — re-running a file is
safe — but always apply in order so dependencies (e.g. the `update_updated_at_column`
helper) exist before their triggers.

## Convention going forward

1. **Never edit an applied migration.** Every schema change is a new numbered
   file: `0001_<change>.sql`, `0002_<change>.sql`, …
2. One logical change per file, with a header comment naming the issue/ADR
   that motivated it.
3. Write idempotent SQL (`create table if not exists`, `drop policy if exists`
   + `create policy`, `do $$ … end $$` guards) so re-runs and retries are safe.
4. Every new table gets: its indexes, its RLS policies, and (when it has a
   mutable timestamp) the `updated_at` trigger — in the same file.
5. Data backfills are separate migrations from DDL changes.

## The Supabase compatibility shim (0000_baseline.sql)

Supabase provides two primitives the schema's RLS depends on:

- the `auth.users` table every FK references,
- the `auth.uid()` function every policy calls.

`0000_baseline.sql` creates minimal versions of both **only when absent**, so:

- **On Supabase** the real objects already exist and the shim is a no-op —
  applying the chain to a fresh Supabase project reproduces the schema.
- **On Neon / vanilla Postgres** the shim provides the same shape:
  `auth.uid()` reads the `request.jwt.claim.sub` session setting
  (`SET request.jwt.claim.sub = '<uuid>'` in a session plays the role of an
  authenticated JWT). This keeps every policy runnable until epic #102's
  storage layer replaces client-side RLS access with server-layer checks
  (ADR-0009) — after which the policies remain as defense-in-depth.

Note for the Neon data migration (#379 runbook): rows must be re-keyed from
Supabase `auth.users` ids to the new identity provider's user ids — see
ADR-0008 (wallet-first sessions) for the identity model.

## Provenance

`0000_baseline.sql` was reconstructed from the repo's recorded DDL, in this
order: docs/06-supabase.md (base tables + RLS + indexes), the nine runtime
migration files under `src/lib/migrations/` (001 lender preferences; 002
multisig transactions, securitization, invoice documents; 003 encrypted
messages, escrow column; 004 health monitoring, notifications; 005 invoice
reminders), the indexer's `protocol_stats` (apps/indexer/README.md), and the
`sep10_used_challenges` replay-guard table + `wallet_verified` column
(docs/08-environment-variables.md). Two deliberate normalizations, both
documented in the file: `user_profiles.role` is created in its final form
(`business`/`lender`/`admin` — the health migration's `admin` addition folded
in), and the Supabase-only `pg_cron` retention schedules are replaced by
portable `purge_expired_*` functions callable from the keeper.
