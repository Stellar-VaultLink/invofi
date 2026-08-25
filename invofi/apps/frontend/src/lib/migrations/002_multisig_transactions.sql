-- Migration 002: multi-signature transaction approval queue (issue #219)
--
-- Creates the two Supabase tables the multi-sig feature reads and writes:
--   * pending_transactions   — one row per queued base transaction (XDR + metadata)
--   * transaction_approvals  — one row per co-signer signature over that envelope
--
-- Run this in your Supabase SQL Editor (same as 001_lender_preferences.sql).
-- Supabase is a coordination mirror, never the source of truth — the account
-- submit enforces the real threshold on-chain (txBAD_AUTH_EXTRA), so the RLS
-- below is defense-in-depth, not the authority. This file is the runnable form
-- of the schema documented in README.md and docs/adr/0006-multisig-transaction-
-- approval.md; keep the three in sync. Idempotent — safe to re-run.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists pending_transactions (
  id                   uuid primary key default gen_random_uuid(),

  -- Human label shown in the queue, e.g. "Treasury payment — 12,000 XLM".
  title                text not null,
  -- What kind of operation this envelope performs (payment, invoice, …).
  operation            text not null,

  -- Stellar address that created the request (the transaction source).
  initiator            text not null,
  -- Authenticated author (null if created without a Supabase session).
  initiator_id         uuid references auth.users(id) on delete set null,

  -- Base transaction envelope, unsigned, base64 XDR.
  xdr                  text not null,
  network_passphrase   text not null,

  -- Amount in human units (mirror convention), for threshold display.
  amount               text not null,
  -- Constrained to the Currency union the app supports (src/types).
  currency             text not null
    check (currency in ('XLM', 'USDC')),

  -- Signatures required before execution. The client floors this at 2
  -- (createPendingTransaction: Math.max(2, …)); enforce the same here.
  required_signatures  integer not null default 3
    check (required_signatures >= 2),

  status               text not null default 'Pending'
    check (status in ('Pending', 'Executed', 'Rejected', 'Expired')),

  -- Network hash, set once the combined transaction is submitted.
  tx_hash              text,
  -- After this instant an un-approved request auto-rejects (24h window).
  expires_at           timestamptz not null,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists transaction_approvals (
  id                uuid primary key default gen_random_uuid(),
  pending_tx_id     uuid not null references pending_transactions(id) on delete cascade,

  -- Stellar address of the co-signer who produced the signature.
  approver_address  text not null,
  -- Authenticated author (null if approved without a Supabase session).
  approver_id       uuid references auth.users(id) on delete set null,
  -- base64 DecoratedSignature over the pending transaction's xdr.
  signature         text not null,

  created_at        timestamptz not null default now(),

  -- One approval per co-signer per transaction. This is what makes
  -- count(approvals) an accurate distinct-approver count for the threshold
  -- check, and it drives the 23505 "already approved" handling in
  -- approvePendingTransaction().
  unique (pending_tx_id, approver_address)
);

-- ── Indexes (support the queries in src/lib/multisig.ts) ─────────────────────

-- fetchPendingTransactions(): newest-first queue listing.
create index if not exists pending_transactions_created_at_idx
  on pending_transactions (created_at desc);

-- expireStale(): sweep of Pending rows past their deadline.
create index if not exists pending_transactions_expiry_idx
  on pending_transactions (status, expires_at);

-- Participants-update RLS + "my requests" filtering by author.
create index if not exists pending_transactions_initiator_id_idx
  on pending_transactions (initiator_id);

-- The `*, transaction_approvals(*)` nested join on every queue read.
create index if not exists transaction_approvals_pending_tx_id_idx
  on transaction_approvals (pending_tx_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- The approval queue is coordination state, not the source of truth. RLS is
-- defense-in-depth: authenticated reads, approvals bound to their author, and
-- status changes limited to a request's participants (initiator or an
-- approver). Tighten reads to a per-deployment signer allow-list if the whole
-- org should not see the queue. See ADR-0006 "Authorization is layered".

alter table pending_transactions  enable row level security;
alter table transaction_approvals enable row level security;

drop policy if exists "Read pending transactions" on pending_transactions;
create policy "Read pending transactions"
  on pending_transactions for select
  using (auth.uid() is not null);

drop policy if exists "Create pending transactions" on pending_transactions;
create policy "Create pending transactions"
  on pending_transactions for insert
  with check (initiator_id = auth.uid());

drop policy if exists "Participants update pending transactions" on pending_transactions;
create policy "Participants update pending transactions"
  on pending_transactions for update
  using (
    initiator_id = auth.uid()
    or exists (
      select 1 from transaction_approvals ta
      where ta.pending_tx_id = pending_transactions.id
        and ta.approver_id = auth.uid()
    )
  );

drop policy if exists "Read approvals" on transaction_approvals;
create policy "Read approvals"
  on transaction_approvals for select
  using (auth.uid() is not null);

-- Bind each approval to the authenticated author. The stored signature must
-- also verify under approver_address — checked client-side in
-- signatureForAddress() before insert; a Postgres RPC that re-checks it
-- server-side is a documented follow-up (ADR-0006).
drop policy if exists "Insert own approval" on transaction_approvals;
create policy "Insert own approval"
  on transaction_approvals for insert
  with check (approver_id = auth.uid());

-- ── updated_at trigger ───────────────────────────────────────────────────────
-- Reuses the shared helper from migration 001 (create or replace is idempotent
-- and keeps this file runnable standalone).
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pending_transactions_updated_at on pending_transactions;
create trigger pending_transactions_updated_at
  before update on pending_transactions
  for each row execute function update_updated_at_column();

-- ── Co-signer notification (ADR-0006 §5) ─────────────────────────────────────
-- Notification is server-side by design: the browser must never hold the
-- delivery target or secrets (a NEXT_PUBLIC_* webhook would be world-readable
-- and callable with forged bodies). Two runnable options — pick per deployment:
--
--   (a) Supabase Database Webhook / Edge Function (recommended for email/Slack).
--       Configure in the dashboard: Database → Webhooks → "on INSERT into
--       pending_transactions", pointing at an Edge Function that runs under the
--       service role and fans out to the configured co-signers. No SQL needed;
--       leave the trigger below in place or remove it.
--
--   (b) The pg_notify hook below (zero-dependency, no external config): emits a
--       NOTIFY on channel 'pending_transaction_created' that an Edge Function or
--       worker can LISTEN on. Harmless if nothing is listening.
--
-- The approval queue polls regardless, so a co-signer still sees a request even
-- if a push is missed.
create or replace function notify_pending_transaction()
returns trigger language plpgsql as $$
begin
  perform pg_notify(
    'pending_transaction_created',
    json_build_object(
      'id', new.id,
      'title', new.title,
      'initiator', new.initiator,
      'amount', new.amount,
      'currency', new.currency,
      'required_signatures', new.required_signatures,
      'expires_at', new.expires_at
    )::text
  );
  return new;
end;
$$;

drop trigger if exists pending_transactions_notify on pending_transactions;
create trigger pending_transactions_notify
  after insert on pending_transactions
  for each row execute function notify_pending_transaction();
