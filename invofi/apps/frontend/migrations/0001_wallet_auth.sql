-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — Wallet-first auth schema (issue #376, ADR-0008 + Amendment 001)
--
-- Foundation for the Auth.js v5 (NextAuth v5) replacement of Supabase Auth:
--   * `sessions`        — database-session strategy (ADR-0008 decision 4)
--   * `verification_token` — Auth.js-standard table (provider flows)
--   * `user_profiles.username` — unique, immutable handle set at the one-time
--     profile-setup step (ADR-0008 Amendment 001)
--   * `user_profiles.email` made nullable — wallet-only sign-in has no email
--   * unique index on `user_profiles.wallet_address` — the wallet address is
--     the primary identity key (Amendment 001)
--
-- This migration targets the NEW backend (Neon / vanilla Postgres, where
-- 0000_baseline.sql created the `auth` compatibility shim). Do NOT apply it to
-- the live Supabase project: Supabase Auth is removed wholesale at cutover
-- (ADR-0008), and its replacement is the code this migration scaffolds.
-- Idempotent. Never edit an applied migration — add 0002 instead.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Sessions (Auth.js database strategy) ────────────────────────────────────
-- The custom SEP-10 provider creates rows here through the adapter in
-- src/lib/auth/pg-adapter.ts. session_token is the opaque cookie value; rows
-- are deleted on sign-out and by the logout-everywhere sweep
-- (DELETE FROM sessions WHERE user_id = $1 — ADR-0008 revocation requirement).
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  user_id       uuid not null references auth.users(id) on delete cascade,
  expires       timestamptz not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auth.js-standard verification tokens (challenge/nonce flows).
create table if not exists verification_token (
  identifier text not null,
  token      text not null,
  expires    timestamptz not null,
  primary key (identifier, token)
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires);

-- Expired-session sweep for the keeper (sessions are also cleaned on read —
-- this exists so the DB doesn't accumulate dead rows between deploys).
create or replace function purge_expired_sessions()
returns integer language plpgsql as $$
declare deleted_count integer;
begin
  delete from sessions where expires < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ── user_profiles evolution (ADR-0008 Amendment 001 identity model) ─────────

-- Immutable public handle, set once at the one-time profile-setup step.
alter table user_profiles add column if not exists username text;
create unique index if not exists user_profiles_username_key
  on user_profiles (username)
  where username is not null;

-- Wallet-only sign-in: new identities have no email.
alter table user_profiles alter column email drop not null;

-- The wallet address is the primary identity key — enforce 1:1 profile↔wallet.
-- (Applied to the fresh Neon schema; the runbook dedupes live rows before
-- re-keying if any blind-trust duplicates exist.)
create unique index if not exists user_profiles_wallet_address_key
  on user_profiles (wallet_address)
  where wallet_address is not null;
