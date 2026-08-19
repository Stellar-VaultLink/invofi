-- Migration: lender_preferences table
-- Run this in your Supabase SQL Editor to enable server-side persistence of
-- lender matching preferences. The table is optional — the matching engine
-- works entirely client-side via localStorage when no authenticated session
-- exists.

create table if not exists lender_preferences (
  id            uuid primary key default gen_random_uuid(),
  lender_id     uuid not null references auth.users(id) on delete cascade,

  -- Risk appetite: 'conservative' | 'moderate' | 'aggressive'
  risk_profile         text not null default 'moderate'
    check (risk_profile in ('conservative', 'moderate', 'aggressive')),

  -- Currency preference: 'XLM' | 'USDC' | 'both'
  currency_preference  text not null default 'both'
    check (currency_preference in ('XLM', 'USDC', 'both')),

  -- Minimum acceptable yield in basis points (e.g. 500 = 5.00%)
  min_yield_bps        integer not null default 500
    check (min_yield_bps >= 0 and min_yield_bps <= 100000),

  -- Max / min invoice amount the lender is willing to finance (in stroops).
  -- 0 means "no restriction".
  max_amount_stroops   text not null default '0',
  min_amount_stroops   text not null default '0',

  -- Maximum days until due-date the lender will consider. 0 = no cap.
  max_due_days         integer not null default 0
    check (max_due_days >= 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Enforce one row per lender
create unique index if not exists lender_preferences_lender_id_idx
  on lender_preferences (lender_id);

-- RLS: each lender can only read / write their own preferences
alter table lender_preferences enable row level security;

create policy "Lender can manage own preferences"
  on lender_preferences
  for all
  using  (lender_id = auth.uid())
  with check (lender_id = auth.uid());

-- Auto-update updated_at on every modification
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lender_preferences_updated_at
  before update on lender_preferences
  for each row execute function update_updated_at_column();
