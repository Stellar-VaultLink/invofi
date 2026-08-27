-- Migration 004: protocol health monitoring (issue health-dashboard)
--
-- Creates four tables used by the /dashboard/health admin view:
--   * health_metrics             — hourly transaction success/failure counts + fee stats
--   * contract_state_snapshots   — 6-hourly contract state (invoice dist, pool util, …)
--   * alert_configs              — admin-managed threshold rules
--   * audit_log                  — append-only record of admin actions
--
-- Also extends user_profiles.role CHECK constraint to include 'admin'.
-- Run in your Supabase SQL Editor. Idempotent — safe to re-run.

-- ── Extend user_profiles to allow the 'admin' role ───────────────────────────
-- Drop and recreate the existing check (ALTER TABLE … DROP CONSTRAINT is
-- idempotent-safe when wrapped in a DO block).
do $$
begin
  -- Remove the old constraint if present (name may vary; try both common names).
  begin
    alter table user_profiles drop constraint if exists user_profiles_role_check;
  exception when others then null;
  end;
end;
$$;

alter table user_profiles
  add constraint user_profiles_role_check
  check (role in ('business', 'lender', 'admin'));

-- ── health_metrics ────────────────────────────────────────────────────────────
-- One row per time bucket (1-hour window). Written by the health collector
-- script / GitHub Action. Read by the /dashboard/health page.
create table if not exists health_metrics (
  id              bigint primary key generated always as identity,

  -- Start of the 1-hour bucket (truncated to the hour, UTC).
  bucket_start    timestamptz not null,
  -- End of the bucket (= bucket_start + 1 hour).
  bucket_end      timestamptz not null,

  -- Transaction counts within this window.
  tx_success      integer not null default 0,
  tx_failure      integer not null default 0,

  -- Average and p95 fee in stroops (proxy for gas when gas units unavailable).
  avg_fee_stroops bigint not null default 0,
  p95_fee_stroops bigint not null default 0,

  -- Average ledger-close latency for transactions in this bucket (ms).
  avg_confirmation_ms integer not null default 0,

  -- Per-event-type counts for the bucket (JSONB for flexibility).
  -- Keys: inv_reg, off_new, off_acc, off_rej, inv_rep, inv_ovd, off_def, …
  event_counts    jsonb not null default '{}',

  -- Which contracts contributed events in this bucket.
  contracts_active text[] not null default '{}',

  created_at      timestamptz not null default now(),

  unique (bucket_start)
);

create index if not exists health_metrics_bucket_start_idx
  on health_metrics (bucket_start desc);

-- ── contract_state_snapshots ──────────────────────────────────────────────────
-- One row per 6-hour snapshot run (mirrors the indexer schedule). Captures
-- the current contract state: invoice status distribution, pool utilisation,
-- overdue ratio, position token supply.
create table if not exists contract_state_snapshots (
  id                    bigint primary key generated always as identity,

  snapshotted_at        timestamptz not null default now(),
  last_ledger           bigint not null default 0,

  -- Invoice status distribution (counts).
  invoices_pending      integer not null default 0,
  invoices_financed     integer not null default 0,
  invoices_repaid       integer not null default 0,
  invoices_overdue      integer not null default 0,
  invoices_defaulted    integer not null default 0,
  invoices_cancelled    integer not null default 0,
  invoices_disputed     integer not null default 0,
  total_invoices        integer not null default 0,

  -- Pool utilisation (insurance).
  insurance_pool_total  text not null default '0',   -- stroops as text (bigint-safe)
  insurance_pool_staked text not null default '0',

  -- Position token supply (SEP-41 total_supply query, or 0 if unavailable).
  position_token_supply text not null default '0',

  -- Repayment / overdue ratio (0.0 – 1.0).
  repayment_rate        numeric(6,4) not null default 0,
  overdue_rate          numeric(6,4) not null default 0,

  -- Total financed and repaid volumes (stroops as text).
  total_volume          text not null default '0',
  total_repaid          text not null default '0',

  -- Active lenders count.
  active_lenders        integer not null default 0
);

create index if not exists contract_state_snapshots_at_idx
  on contract_state_snapshots (snapshotted_at desc);

-- ── alert_configs ─────────────────────────────────────────────────────────────
-- Admin-managed threshold rules. The collector evaluates these after each run
-- and inserts into audit_log when a threshold is breached.
create table if not exists alert_configs (
  id              uuid primary key default gen_random_uuid(),

  -- Human label, e.g. "Overdue rate too high".
  label           text not null,

  -- The metric being watched.
  -- Allowed values match the columns/fields the collector can evaluate:
  --   overdue_rate | repayment_rate | tx_failure_rate |
  --   insurance_pool_total | avg_fee_stroops | invoices_overdue
  metric          text not null
    check (metric in (
      'overdue_rate', 'repayment_rate', 'tx_failure_rate',
      'insurance_pool_total', 'avg_fee_stroops', 'invoices_overdue'
    )),

  -- Comparison operator.
  operator        text not null
    check (operator in ('gt', 'lt', 'gte', 'lte')),

  -- Threshold value (stored as text to cover both integers and decimals).
  threshold       text not null,

  -- Severity shown in the audit log when breached.
  severity        text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),

  enabled         boolean not null default true,

  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── audit_log ─────────────────────────────────────────────────────────────────
-- Append-only log. Rows are inserted by:
--   (a) the health collector when an alert_config threshold is breached, and
--   (b) the frontend when an admin takes an explicit action
--       (e.g. pause contract, resolve dispute, update alert).
create table if not exists audit_log (
  id          bigint primary key generated always as identity,

  -- ISO 8601 timestamp of the action (defaults to now()).
  action_at   timestamptz not null default now(),

  -- Type discriminator for filtering.
  -- 'alert_breach' | 'admin_action' | 'config_change' | 'system_event'
  action_type text not null
    check (action_type in ('alert_breach', 'admin_action', 'config_change', 'system_event')),

  -- Human-readable summary.
  message     text not null,

  -- Structured payload (alert name, metric value, actor, etc.).
  details     jsonb not null default '{}',

  severity    text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),

  -- The user who triggered the action (null for system events).
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text
);

create index if not exists audit_log_action_at_idx
  on audit_log (action_at desc);

create index if not exists audit_log_action_type_idx
  on audit_log (action_type, action_at desc);

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table health_metrics          enable row level security;
alter table contract_state_snapshots enable row level security;
alter table alert_configs           enable row level security;
alter table audit_log               enable row level security;

-- health_metrics: public read (same as protocol_stats), admin write.
drop policy if exists "Public read health_metrics" on health_metrics;
create policy "Public read health_metrics"
  on health_metrics for select using (true);

drop policy if exists "Admin write health_metrics" on health_metrics;
create policy "Admin write health_metrics"
  on health_metrics for insert
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- contract_state_snapshots: public read, admin write.
drop policy if exists "Public read snapshots" on contract_state_snapshots;
create policy "Public read snapshots"
  on contract_state_snapshots for select using (true);

drop policy if exists "Admin write snapshots" on contract_state_snapshots;
create policy "Admin write snapshots"
  on contract_state_snapshots for insert
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- alert_configs: authenticated read, admin write/update/delete.
drop policy if exists "Authenticated read alert_configs" on alert_configs;
create policy "Authenticated read alert_configs"
  on alert_configs for select using (auth.uid() is not null);

drop policy if exists "Admin insert alert_configs" on alert_configs;
create policy "Admin insert alert_configs"
  on alert_configs for insert
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admin update alert_configs" on alert_configs;
create policy "Admin update alert_configs"
  on alert_configs for update
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Admin delete alert_configs" on alert_configs;
create policy "Admin delete alert_configs"
  on alert_configs for delete
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- audit_log: authenticated read (admins and stakeholders), system/admin insert.
drop policy if exists "Authenticated read audit_log" on audit_log;
create policy "Authenticated read audit_log"
  on audit_log for select using (auth.uid() is not null);

drop policy if exists "Admin insert audit_log" on audit_log;
create policy "Admin insert audit_log"
  on audit_log for insert
  with check (auth.uid() is not null);

-- ── updated_at trigger for alert_configs ─────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists alert_configs_updated_at on alert_configs;
create trigger alert_configs_updated_at
  before update on alert_configs
  for each row execute function update_updated_at_column();
