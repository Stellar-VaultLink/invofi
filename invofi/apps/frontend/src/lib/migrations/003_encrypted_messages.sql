-- Migration 003: end-to-end encrypted invoice messaging (issue #228)
--
-- Creates the `encrypted_messages` table that backs the MessagingPanel component.
-- Messages are encrypted client-side with AES-256-GCM before they are written to
-- Supabase, so the server stores only opaque ciphertext.  The Supabase mirror is
-- therefore NOT the encryption authority — it is a relay and persistence layer.
--
-- Run in the Supabase SQL Editor (idempotent — safe to re-run).

-- ── Table ─────────────────────────────────────────────────────────────────────

create table if not exists encrypted_messages (
  id                uuid primary key default gen_random_uuid(),

  -- The invoice this conversation is attached to.
  invoice_id        text not null references invoices(id) on delete cascade,

  -- Stellar wallet addresses of both parties (no FK — wallets aren't stored in
  -- auth.users; the RLS join goes through user_profiles.wallet_address).
  sender_address    text not null,
  recipient_address text not null,

  -- AES-256-GCM ciphertext, base64-encoded: base64(12-byte IV || ciphertext).
  -- Only the two parties who share the derived key can decrypt this.
  encrypted_content text not null,

  -- Coarse message type — lets the UI render hints without decrypting.
  message_type      text not null default 'text'
    check (message_type in ('text', 'document_ref', 'term_proposal')),

  -- Nullable: set when the recipient first views the message.
  read_at           timestamptz,

  -- How many days the message should be retained.  A scheduled cron job (or
  -- Supabase scheduled function — see note at the bottom of this file) deletes
  -- rows where  created_at + retention_days * interval '1 day' < now().
  retention_days    integer not null default 90,

  created_at        timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary query pattern: fetch all messages for an invoice.
create index if not exists encrypted_messages_invoice_id_idx
  on encrypted_messages (invoice_id, created_at asc);

-- Participant lookup (RLS policy evaluation + hook polling).
create index if not exists encrypted_messages_sender_idx
  on encrypted_messages (sender_address);

create index if not exists encrypted_messages_recipient_idx
  on encrypted_messages (recipient_address);

-- Retention sweep: find rows whose retention window has elapsed.
create index if not exists encrypted_messages_retention_idx
  on encrypted_messages (created_at)
  where retention_days is not null;

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table encrypted_messages enable row level security;

-- SELECT: a user can read messages where their wallet_address is either the
-- sender or the recipient.  Joins through user_profiles so we don't have to
-- embed the wallet address in the JWT.
drop policy if exists "Participants can read messages" on encrypted_messages;
create policy "Participants can read messages"
  on encrypted_messages for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from user_profiles up
      where up.id = auth.uid()
        and (
          up.wallet_address = encrypted_messages.sender_address
          or up.wallet_address = encrypted_messages.recipient_address
        )
    )
  );

-- INSERT: authenticated users only; sender_address must match their profile.
drop policy if exists "Sender can insert messages" on encrypted_messages;
create policy "Sender can insert messages"
  on encrypted_messages for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from user_profiles up
      where up.id = auth.uid()
        and up.wallet_address = encrypted_messages.sender_address
    )
  );

-- UPDATE: recipients can mark messages as read (only the read_at column).
-- All other fields are immutable from the client side.
drop policy if exists "Recipient can mark as read" on encrypted_messages;
create policy "Recipient can mark as read"
  on encrypted_messages for update
  using (
    auth.uid() is not null
    and exists (
      select 1
      from user_profiles up
      where up.id = auth.uid()
        and up.wallet_address = encrypted_messages.recipient_address
    )
  );

-- No DELETE for regular users — admin only via the Supabase dashboard or the
-- retention function below.

-- ── Retention cleanup ─────────────────────────────────────────────────────────
--
-- Messages older than `retention_days` days should be purged automatically.
-- Two options — choose per deployment:
--
--   (a) Supabase pg_cron extension (recommended):
--         select cron.schedule(
--           'purge-expired-messages',
--           '0 3 * * *',   -- 03:00 UTC daily
--           $$
--             delete from encrypted_messages
--             where created_at + (retention_days || ' days')::interval < now();
--           $$
--         );
--
--   (b) Supabase Edge Function called by a scheduled GitHub Action (zero pg_cron
--       dependency):
--         // edge-function: purge-messages.ts
--         // DELETE FROM encrypted_messages WHERE ...
--
-- The function below is a no-op stub that documents the intended query; call it
-- from your chosen scheduler.

create or replace function purge_expired_messages()
returns integer language plpgsql
security definer          -- runs as the Postgres superuser to bypass RLS
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from encrypted_messages
  where created_at + (retention_days || ' days')::interval < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
