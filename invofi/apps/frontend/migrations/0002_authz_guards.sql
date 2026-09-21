-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — Defense-in-depth RLS on the ADR-0009 tables (issue #377)
--
-- ADR-0009 (docs/adr/0009-authorization-model.md) makes the server layer the
-- PRIMARY authorization gate for the Neon backend: every query routes through
-- Next.js route handlers / server actions that check the Auth.js session
-- (src/lib/auth/authz.ts + data-guards.ts).
--
-- On exactly four tables RLS is retained as defense-in-depth — the tables
-- where a single missed server check is a full breach:
--   encrypted_messages, pending_transactions, transaction_approvals, audit_log
-- Queries against these tables MUST run through withUserContext()
-- (src/lib/auth/rls-context.ts), which binds the session identity to the
-- transaction via set_config('app.user_id', ..., is_local => true). The
-- policies below read that setting through app_user_id() — deliberately NOT
-- through the 0000 shim's auth.uid(), which stays sourced from
-- request.jwt.claim.sub so its Supabase-era semantics are untouched. A query
-- that bypasses the wrapper finds no context and is refused by the policies.

-- ── per-request identity, read by every policy in this file ─────────────────

create or replace function app_user_id() returns uuid language sql stable as $fn$
  select nullif(current_setting('app.user_id', true), '')::uuid
$fn$;

create or replace function app_user_wallet() returns text language sql stable as $fn$
  select nullif(current_setting('app.user_wallet', true), '')
$fn$;
--
-- Also mirrored here, outside the four-table set, is `notifications` RLS:
-- cheap defense-in-depth for the highest-traffic per-user table. reminder_configs
-- deliberately gets NO RLS: it is a single-row admin config reachable only
-- server-side (the browser cannot hold Neon credentials post-migration, so
-- there is no direct-SQL attack surface to defend against) — its admin gate
-- lives in the server layer (data-guards.ts), per ADR-0009 §3.
--
-- Every policy mirrors the semantics of the corresponding Supabase-era policy
-- from 0000_baseline.sql (see docs/rls-policy-inventory.md for the mapping).
--
-- Idempotent: safe to re-run. Do NOT edit to evolve the schema — add 0003+.
-- ═══════════════════════════════════════════════════════════════════════════

-- Every policy below mirrors the legacy Supabase policy semantics, with
-- app_user_id() substituted for auth.uid().

-- ── notifications (defense-in-depth mirror of SL-party rules) ───────────────

alter table notifications enable row level security;
alter table notifications force row level security;

drop policy if exists "Users can read own notifications" on notifications;
create policy "Users can read own notifications"
  on notifications for select
  using (app_user_id() = user_id);

drop policy if exists "Users can insert own notifications" on notifications;
create policy "Users can insert own notifications"
  on notifications for insert
  with check (app_user_id() = user_id);

drop policy if exists "Users can update own notifications" on notifications;
create policy "Users can update own notifications"
  on notifications for update
  using (app_user_id() = user_id)
  with check (app_user_id() = user_id);

drop policy if exists "Users can delete own notifications" on notifications;
create policy "Users can delete own notifications"
  on notifications for delete
  using (auth.uid() = user_id);

-- ── audit_log (tamper-evident trail; legacy semantics preserved) ────────────

alter table audit_log enable row level security;
alter table audit_log force row level security;

drop policy if exists "Authenticated read audit_log" on audit_log;
create policy "Authenticated read audit_log"
  on audit_log for select
  using (app_user_id() is not null);

drop policy if exists "Admin insert audit_log" on audit_log;
create policy "Admin insert audit_log"
  on audit_log for insert
  with check (app_user_id() is not null);

-- ── encrypted_messages (worst-breach table; party-scoped) ───────────────────

alter table encrypted_messages enable row level security;
alter table encrypted_messages force row level security;

-- Party checks compare the context WALLET directly (app_user_wallet()) —
-- deliberately NOT via a user_profiles subquery: user_profiles carries its own
-- RLS (0000), and a subquery under RLS evaluation would silently see zero rows
-- for the app role, turning every participant check into a denial.

drop policy if exists "Participants can read messages" on encrypted_messages;
create policy "Participants can read messages"
  on encrypted_messages for select
  using (
    app_user_wallet() is not null
    and (
      app_user_wallet() = encrypted_messages.sender_address
      or app_user_wallet() = encrypted_messages.recipient_address
    )
  );

drop policy if exists "Sender can insert messages" on encrypted_messages;
create policy "Sender can insert messages"
  on encrypted_messages for insert
  with check (
    app_user_wallet() is not null
    and app_user_wallet() = encrypted_messages.sender_address
  );

-- ── pending_transactions (multisig signature store, ADR-0006) ───────────────
-- (The legacy "Participants update" policy subqueried transaction_approvals;
-- here that subquery is safe because 0002's SELECT policy on that table is
-- context-based, not table-RLS-circular.)

alter table pending_transactions enable row level security;
alter table pending_transactions force row level security;

drop policy if exists "Read pending transactions" on pending_transactions;
create policy "Read pending transactions"
  on pending_transactions for select
  using (app_user_id() is not null);

drop policy if exists "Create pending transactions" on pending_transactions;
create policy "Create pending transactions"
  on pending_transactions for insert
  with check (initiator_id = app_user_id());

drop policy if exists "Participants update pending transactions" on pending_transactions;
create policy "Participants update pending transactions"
  on pending_transactions for update
  using (
    initiator_id = app_user_id()
    or exists (
      select 1 from transaction_approvals ta
      where ta.pending_tx_id = pending_transactions.id
        and ta.approver_id = app_user_id()
    )
  );

-- ── transaction_approvals (multisig signature store, ADR-0006) ──────────────

alter table transaction_approvals enable row level security;
alter table transaction_approvals force row level security;

drop policy if exists "Read approvals" on transaction_approvals;
create policy "Read approvals"
  on transaction_approvals for select
  using (app_user_id() is not null);

drop policy if exists "Insert own approval" on transaction_approvals;
create policy "Insert own approval"
  on transaction_approvals for insert
  with check (approver_id = app_user_id());
