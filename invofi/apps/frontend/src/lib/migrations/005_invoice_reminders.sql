-- Migration 006: automated invoice reminder system (Closes #224)
--
-- Creates three tables that back the scheduled reminder system:
--   * invoice_reminders             — append-only log of every reminder sent
--                                     (or attempted). Doubles as the
--                                     duplicate-send guard for the collector.
--   * invoice_reminder_preferences  — per-invoice opt-out, set by the
--                                     originator.
--   * reminder_configs              — singleton row of admin-controlled
--                                     settings (enabled stages, webhook
--                                     defaults, retry policy).
--
-- Written by: invofi/scripts/invoice-reminders.ts (GitHub Actions cron,
-- .github/workflows/invoice-reminders.yml), running under the Supabase
-- service role key (bypasses RLS for writes).
-- Read by: the /invoices/[id] reminder panel (originator) and the
-- /dashboard/reminders admin page.
--
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.

-- ── invoice_reminders ─────────────────────────────────────────────────────────
-- One row per (invoice, stage, channel) actually attempted. The unique
-- constraint is the source of truth for "no duplicate reminders": the
-- collector upserts on conflict do nothing before sending, so a re-run of the
-- same day's job (or an overlapping manual dispatch) never double-sends.
create table if not exists invoice_reminders (
  id            uuid primary key default gen_random_uuid(),

  invoice_id    text not null references invoices(id) on delete cascade,

  -- Which point in the schedule this reminder covers.
  stage         text not null
    check (stage in ('due_in_7', 'due_in_1', 'due_today', 'overdue_1', 'overdue_7')),

  -- Delivery channel for this row — email and webhook are logged separately
  -- so a webhook failure doesn't obscure a successful email (and vice versa).
  channel       text not null
    check (channel in ('email', 'webhook')),

  status        text not null
    check (status in ('sent', 'failed', 'skipped')),

  -- Email address or webhook URL the reminder was sent to (best-effort,
  -- redact nothing — this is an operational log, not user-facing content).
  recipient     text,

  -- Number of delivery attempts made (webhook retries with backoff).
  attempts      integer not null default 1,

  -- Error message on failure, null otherwise.
  error         text,

  created_at    timestamptz not null default now()
);

-- Duplicate-send guard: at most one row per (invoice, stage, channel).
create unique index if not exists invoice_reminders_dedupe_idx
  on invoice_reminders (invoice_id, stage, channel);

create index if not exists invoice_reminders_invoice_id_idx
  on invoice_reminders (invoice_id);

create index if not exists invoice_reminders_created_at_idx
  on invoice_reminders (created_at desc);

-- ── invoice_reminder_preferences ──────────────────────────────────────────────
-- One row per invoice (created lazily on first opt-out). Absence of a row
-- means "reminders enabled" — the default.
create table if not exists invoice_reminder_preferences (
  invoice_id  text primary key references invoices(id) on delete cascade,
  opted_out   boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- ── reminder_configs ──────────────────────────────────────────────────────────
-- Singleton row (id is always 1) holding admin-controlled reminder settings.
-- The collector reads this once per run; the /dashboard/reminders page lets
-- an admin edit it.
create table if not exists reminder_configs (
  id                  smallint primary key default 1 check (id = 1),

  -- Master on/off switch — a disabled config skips the whole run.
  enabled             boolean not null default true,

  -- Which stages are active. Lets an admin, e.g., turn off the 7-day-overdue
  -- nudge without touching code.
  stages              jsonb not null default
    '["due_in_7", "due_in_1", "due_today", "overdue_1", "overdue_7"]',

  -- Default webhook endpoint for integrations (per-invoice overrides are out
  -- of scope for v1 — see issue #224 discussion). Null disables webhook
  -- delivery entirely.
  webhook_url         text,

  -- Shared secret sent as the `X-Invofi-Signature` header (HMAC-SHA256 of the
  -- payload) so receivers can verify authenticity.
  webhook_secret       text,

  -- Retry policy for webhook delivery.
  max_webhook_attempts integer not null default 3
    check (max_webhook_attempts between 1 and 10),

  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

-- Seed the singleton row so the dashboard always has something to read/edit.
insert into reminder_configs (id) values (1)
  on conflict (id) do nothing;

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table invoice_reminders enable row level security;
alter table invoice_reminder_preferences enable row level security;
alter table reminder_configs enable row level security;

-- invoice_reminders: the invoice's originator and admins can read the
-- history for their own invoices; writes come from the service role (the
-- cron script), which bypasses RLS entirely.
drop policy if exists "Originator read invoice_reminders" on invoice_reminders;
create policy "Originator read invoice_reminders"
  on invoice_reminders for select
  using (
    exists (
      select 1 from invoices
      where invoices.id = invoice_reminders.invoice_id
        and invoices.originator_id = auth.uid()
    )
    or exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- invoice_reminder_preferences: the originator can read and manage their own
-- opt-out; admins can read all.
drop policy if exists "Originator read reminder_preferences" on invoice_reminder_preferences;
create policy "Originator read reminder_preferences"
  on invoice_reminder_preferences for select
  using (
    exists (
      select 1 from invoices
      where invoices.id = invoice_reminder_preferences.invoice_id
        and invoices.originator_id = auth.uid()
    )
    or exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Originator upsert reminder_preferences" on invoice_reminder_preferences;
create policy "Originator upsert reminder_preferences"
  on invoice_reminder_preferences for insert
  with check (
    exists (
      select 1 from invoices
      where invoices.id = invoice_reminder_preferences.invoice_id
        and invoices.originator_id = auth.uid()
    )
  );

drop policy if exists "Originator update reminder_preferences" on invoice_reminder_preferences;
create policy "Originator update reminder_preferences"
  on invoice_reminder_preferences for update
  using (
    exists (
      select 1 from invoices
      where invoices.id = invoice_reminder_preferences.invoice_id
        and invoices.originator_id = auth.uid()
    )
  );

-- reminder_configs: admin-only, both read and write (it's operational
-- configuration, not user-facing data).
drop policy if exists "Admin read reminder_configs" on reminder_configs;
create policy "Admin read reminder_configs"
  on reminder_configs for select
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admin update reminder_configs" on reminder_configs;
create policy "Admin update reminder_configs"
  on reminder_configs for update
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
