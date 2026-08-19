-- Migration: invoice securitization tables
-- Run in your Supabase SQL Editor.
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
  available_fractions   integer not null check (available_fractions >= 0),
  price_per_fraction    text    not null,   -- decimal string, human units
  price_currency        text    not null check (price_currency in ('XLM', 'USDC')),

  token_symbol          text    not null,   -- e.g. "INV-001-FRAC"
  token_name            text    not null,
  decimals              integer not null default 7,

  status                text    not null default 'active'
    check (status in ('active', 'sold_out', 'cancelled')),

  description           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- One active fractionalization per invoice at a time
  constraint one_active_per_invoice unique (invoice_id)
);

create index if not exists frac_records_invoice_idx
  on fractionalization_records (invoice_id);

create index if not exists frac_records_originator_idx
  on fractionalization_records (originator_id);

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

  -- One row per investor per fractionalization (additional buys upsert)
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
  per_fraction_amount  text not null,          -- total_amount / total_fractions

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

-- Fractionalization records: world-readable, originator can insert/update
create policy "Anyone can read fractionalization records"
  on fractionalization_records for select using (true);

create policy "Originator can create fractionalization"
  on fractionalization_records for insert
  with check (originator_id = auth.uid());

create policy "Originator can update own fractionalization"
  on fractionalization_records for update
  using (originator_id = auth.uid());

-- Fractional positions: lender owns their row; originators can read all for their invoice
create policy "Lender can read own positions"
  on fractional_positions for select
  using (lender_id = auth.uid());

create policy "Anyone can read positions for discovery"
  on fractional_positions for select using (true);

create policy "Lender can insert own position"
  on fractional_positions for insert
  with check (lender_id = auth.uid());

create policy "Lender can update own position"
  on fractional_positions for update
  using (lender_id = auth.uid());

-- Price history: world-readable, system-written (service role) or originator
create policy "Anyone can read price history"
  on price_history for select using (true);

create policy "Authenticated users can insert price history"
  on price_history for insert
  with check (auth.uid() is not null);

-- Dividends: world-readable, originator inserts/updates
create policy "Anyone can read dividend distributions"
  on dividend_distributions for select using (true);

create policy "Originator can manage dividends"
  on dividend_distributions for all
  using (originator_id = auth.uid())
  with check (originator_id = auth.uid());

-- ── updated_at triggers ───────────────────────────────────────────────────────
-- Reuses the trigger function created by the lender_preferences migration.
-- If that migration hasn't been run yet, the function is created here.

create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger fractionalization_records_updated_at
  before update on fractionalization_records
  for each row execute function update_updated_at_column();

create trigger fractional_positions_updated_at
  before update on fractional_positions
  for each row execute function update_updated_at_column();
