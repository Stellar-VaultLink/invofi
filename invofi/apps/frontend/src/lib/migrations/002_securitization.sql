-- Migration: invoice securitization tables
-- Run in your Supabase SQL Editor.
-- This migration is idempotent — safe to re-run.
--
-- Four tables are added:
--   fractionalization_records  — one per invoice, tracks the split config
--   fractional_positions       — one per investor per fractionalization
--   price_history              — time-series of fraction trade prices
--   dividend_distributions     — originator yield payouts to holders

-- ── fractionalization_records ─────────────────────────────────────────────────

create table if not exists fractionalization_records (
  id                    uuid primary key default gen_random_uuid(),
  invoice_id            text  not null references invoices(id),
  originator_id         uuid  not null references auth.users(id),
  originator_address    text  not null,

  total_fractions       integer not null check (total_fractions >= 2 and total_fractions <= 1000000),
  available_fractions   integer not null
    check (available_fractions >= 0 and available_fractions <= total_fractions),
  price_per_fraction    text    not null,   -- decimal string, human units
  price_currency        text    not null check (price_currency in ('XLM', 'USDC')),

  token_symbol          text    not null,   -- e.g. "INV-001-FRAC"
  token_name            text    not null,
  decimals              integer not null default 7,

  status                text    not null default 'active'
    check (status in ('active', 'sold_out', 'cancelled')),

  description           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists frac_records_invoice_idx
  on fractionalization_records (invoice_id);

create index if not exists frac_records_originator_idx
  on fractionalization_records (originator_id);

-- Partial unique index: only one *active* fractionalization per invoice at a time.
-- Cancelled records are excluded so an invoice can be re-fractionalized after
-- its previous fractionalization is cancelled.
create unique index if not exists one_active_per_invoice
  on fractionalization_records (invoice_id)
  where status in ('active', 'sold_out');

-- ── fractional_positions ──────────────────────────────────────────────────────

create table if not exists fractional_positions (
  id                           uuid primary key default gen_random_uuid(),
  fractionalization_id         uuid not null references fractionalization_records(id),
  lender_id                    uuid not null references auth.users(id),
  lender_address               text not null,

  fraction_count               integer not null check (fraction_count > 0),
  purchase_price_per_fraction  text    not null,
  purchase_currency            text    not null check (purchase_currency in ('XLM', 'USDC')),

  status                       text    not null default 'held'
    check (status in ('held', 'sold', 'redeemed')),

  purchased_at                 timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  -- One row per investor per fractionalization (additional buys increment via RPC)
  constraint one_position_per_lender unique (fractionalization_id, lender_id)
);

create index if not exists frac_positions_lender_idx
  on fractional_positions (lender_id);

create index if not exists frac_positions_frac_idx
  on fractional_positions (fractionalization_id);

-- ── price_history ─────────────────────────────────────────────────────────────

create table if not exists price_history (
  id                   uuid primary key default gen_random_uuid(),
  fractionalization_id uuid not null references fractionalization_records(id),
  price                text not null,   -- price per fraction at this event
  currency             text not null check (currency in ('XLM', 'USDC')),
  volume               integer not null check (volume > 0),
  source               text not null check (source in ('primary', 'secondary')),
  recorded_at          timestamptz not null default now()
);

create index if not exists price_history_frac_idx
  on price_history (fractionalization_id, recorded_at desc);

-- ── dividend_distributions ────────────────────────────────────────────────────

create table if not exists dividend_distributions (
  id                   uuid primary key default gen_random_uuid(),
  fractionalization_id uuid not null references fractionalization_records(id),
  originator_id        uuid not null references auth.users(id),

  total_amount         text not null,          -- total payout across all holders
  currency             text not null check (currency in ('XLM', 'USDC')),
  per_fraction_amount  text not null,          -- total_amount / total_fractions (truncated)

  status               text not null default 'pending'
    check (status in ('pending', 'distributed', 'cancelled')),

  distributed_at       timestamptz,
  note                 text,
  created_at           timestamptz not null default now()
);

create index if not exists dividends_frac_idx
  on dividend_distributions (fractionalization_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table fractionalization_records   enable row level security;
alter table fractional_positions        enable row level security;
alter table price_history               enable row level security;
alter table dividend_distributions      enable row level security;

-- ── Fractionalization records policies ───────────────────────────────────────

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fractionalization_records'
      and policyname = 'Anyone can read fractionalization records'
  ) then
    create policy "Anyone can read fractionalization records"
      on fractionalization_records for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fractionalization_records'
      and policyname = 'Originator can create fractionalization'
  ) then
    create policy "Originator can create fractionalization"
      on fractionalization_records for insert
      with check (originator_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fractionalization_records'
      and policyname = 'Originator can update own fractionalization'
  ) then
    create policy "Originator can update own fractionalization"
      on fractionalization_records for update
      using (originator_id = auth.uid())
      with check (originator_id = auth.uid());
  end if;
end $$;

-- ── Fractional positions policies ────────────────────────────────────────────
-- Investor holdings are private: only the holding lender can read their own row.
-- If aggregate discovery data (e.g. how many fractions are sold) is needed,
-- expose a view or RPC that returns only counts, not investor identities.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fractional_positions'
      and policyname = 'Lender can read own positions'
  ) then
    create policy "Lender can read own positions"
      on fractional_positions for select
      using (lender_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'fractional_positions'
      and policyname = 'Lender can update own position'
  ) then
    create policy "Lender can update own position"
      on fractional_positions for update
      using (lender_id = auth.uid());
  end if;
end $$;

-- ── Price history policies ────────────────────────────────────────────────────
-- Inserts are restricted to the security-definer RPC `add_fractional_position`
-- and to the service role. Direct inserts by arbitrary authenticated users are
-- blocked to prevent forged market history.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'price_history'
      and policyname = 'Anyone can read price history'
  ) then
    create policy "Anyone can read price history"
      on price_history for select using (true);
  end if;
end $$;

-- NOTE: No insert policy for price_history — inserts are handled exclusively
-- by the `add_fractional_position` and `create_fractionalization` security-definer
-- RPCs (which run as postgres/service role and bypass RLS).

-- ── Dividend policies ─────────────────────────────────────────────────────────

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'dividend_distributions'
      and policyname = 'Anyone can read dividend distributions'
  ) then
    create policy "Anyone can read dividend distributions"
      on dividend_distributions for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'dividend_distributions'
      and policyname = 'Originator can manage dividends'
  ) then
    create policy "Originator can manage dividends"
      on dividend_distributions for all
      using (originator_id = auth.uid())
      with check (originator_id = auth.uid());
  end if;
end $$;

-- ── updated_at trigger function ───────────────────────────────────────────────
-- Reuses the trigger function created by the lender_preferences migration.
-- create or replace is idempotent so this is safe to run multiple times.

create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ── updated_at triggers (idempotent) ─────────────────────────────────────────

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'fractionalization_records_updated_at'
  ) then
    create trigger fractionalization_records_updated_at
      before update on fractionalization_records
      for each row execute function update_updated_at_column();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'fractional_positions_updated_at'
  ) then
    create trigger fractional_positions_updated_at
      before update on fractional_positions
      for each row execute function update_updated_at_column();
  end if;
end $$;

-- ── add_fractional_position RPC ───────────────────────────────────────────────
-- Security-definer function that atomically:
--   1. Verifies the fractionalization is active and has enough available_fractions.
--   2. Decrements available_fractions (transitions to sold_out at 0).
--   3. Upserts fractional_positions, **adding** to any existing fraction_count.
--   4. Inserts a price_history point.
--
-- Runs as the postgres role, bypassing RLS on the tables it writes to.
-- The calling user must be authenticated (auth.uid() is checked against lender_id).

create or replace function add_fractional_position(
  p_fractionalization_id uuid,
  p_lender_id            uuid,
  p_lender_address       text,
  p_fraction_count       integer,
  p_price_per_fraction   text,
  p_currency             text
)
returns fractional_positions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec fractionalization_records;
  pos fractional_positions;
  new_available integer;
begin
  -- Validate caller identity
  if auth.uid() is null or auth.uid() <> p_lender_id then
    raise exception 'Unauthorized';
  end if;

  -- Lock the fractionalization row for update
  select * into rec
    from fractionalization_records
   where id = p_fractionalization_id
     for update;

  if not found then
    raise exception 'Fractionalization not found';
  end if;

  if rec.status <> 'active' then
    raise exception 'Fractionalization is not active (status: %)', rec.status;
  end if;

  if p_fraction_count > rec.available_fractions then
    raise exception 'Only % fraction(s) available', rec.available_fractions;
  end if;

  -- Decrement inventory
  new_available := rec.available_fractions - p_fraction_count;
  update fractionalization_records
     set available_fractions = new_available,
         status = case when new_available = 0 then 'sold_out' else 'active' end,
         updated_at = now()
   where id = p_fractionalization_id;

  -- Additive upsert: increment existing fraction_count rather than overwrite
  insert into fractional_positions (
    fractionalization_id,
    lender_id,
    lender_address,
    fraction_count,
    purchase_price_per_fraction,
    purchase_currency,
    status,
    purchased_at
  ) values (
    p_fractionalization_id,
    p_lender_id,
    p_lender_address,
    p_fraction_count,
    p_price_per_fraction,
    p_currency,
    'held',
    now()
  )
  on conflict (fractionalization_id, lender_id) do update
    set fraction_count  = fractional_positions.fraction_count + excluded.fraction_count,
        lender_address  = excluded.lender_address,
        updated_at      = now()
  returning * into pos;

  -- Append price-history point
  insert into price_history (
    fractionalization_id, price, currency, volume, source, recorded_at
  ) values (
    p_fractionalization_id, p_price_per_fraction, p_currency,
    p_fraction_count, 'primary', now()
  );

  return pos;
end;
$$;
