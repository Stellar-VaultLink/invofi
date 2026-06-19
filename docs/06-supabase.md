# Supabase Setup

Supabase is used for authentication and as a fast-read mirror of on-chain data. This guide walks through creating and configuring a Supabase project for InvoFi.

---

## Create a Project

1. Go to [supabase.com](https://supabase.com) and sign up for a free account.
2. Click **New Project**.
3. Choose a name (e.g. `invofi-testnet`), set a database password, and choose the closest region.
4. Wait ~2 minutes for the project to provision.

---

## Get Your Credentials

1. In your project dashboard, go to **Settings → API**.
2. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Paste both into `invofi/apps/frontend/.env.local`.

---

## Run the Database Schema

Go to **SQL Editor** in your Supabase dashboard and run the following SQL:

```sql
-- ── Tables ────────────────────────────────────────────────────────────────────

-- User profiles (one row per registered user)
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('business', 'lender')),
  display_name text,
  wallet_address text,
  created_at timestamptz default now()
);

-- Invoice mirror — fast-queryable copy of on-chain invoices
create table invoices (
  id text primary key,
  originator text not null,             -- Stellar public key
  originator_id uuid references auth.users(id),
  amount text not null,                 -- display string (e.g. "1000.00")
  currency text not null check (currency in ('XLM', 'USDC')),
  due_date timestamptz not null,
  status text not null default 'Pending'
    check (status in ('Pending', 'Financed', 'Repaid', 'Overdue', 'Cancelled')),
  created_at timestamptz default now()
);

-- Financing offers mirror
create table financing_offers (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  lender_id uuid references auth.users(id),
  lender text not null,                 -- Stellar public key
  amount text not null,
  currency text not null check (currency in ('XLM', 'USDC')),
  interest_rate integer not null,       -- basis points (500 = 5%)
  duration integer not null,            -- seconds
  status text not null default 'Pending'
    check (status in ('Pending', 'Accepted', 'Rejected', 'Repaid', 'Defaulted')),
  funded_at integer default 0,          -- unix timestamp, 0 = not funded
  created_at timestamptz default now()
);

-- ── Row Level Security ─────────────────────────────────────────────────────────

alter table user_profiles enable row level security;
alter table invoices enable row level security;
alter table financing_offers enable row level security;

-- user_profiles: each user manages their own row
create policy "own_profile_select" on user_profiles
  for select using (id = auth.uid());
create policy "own_profile_insert" on user_profiles
  for insert with check (id = auth.uid());
create policy "own_profile_update" on user_profiles
  for update using (id = auth.uid());

-- invoices: anyone can read, only the originator can insert/update
create policy "invoices_select" on invoices
  for select using (true);
create policy "invoices_insert" on invoices
  for insert with check (originator_id = auth.uid());
create policy "invoices_update" on invoices
  for update using (originator_id = auth.uid());

-- financing_offers: anyone can read
create policy "offers_select" on financing_offers
  for select using (true);

-- lender can insert their own offers
create policy "offers_insert" on financing_offers
  for insert with check (lender_id = auth.uid());

-- lender can update their own offers; invoice originator can update offers on their invoices
create policy "offers_update" on financing_offers
  for update using (
    lender_id = auth.uid()
    or exists (
      select 1 from invoices
      where invoices.id = financing_offers.invoice_id
        and invoices.originator_id = auth.uid()
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index invoices_originator_id_idx on invoices (originator_id);
create index invoices_status_idx on invoices (status);
create index offers_invoice_id_idx on financing_offers (invoice_id);
create index offers_lender_id_idx on financing_offers (lender_id);
create index offers_status_idx on financing_offers (status);
```

---

## Enable Email Confirmation (Optional)

By default Supabase requires email confirmation. For testnet development you may want to disable this:

1. Go to **Authentication → Providers → Email**.
2. Toggle **Confirm email** off.
3. Click **Save**.

Re-enable this before going to mainnet.

---

## Table Summary

| Table | Purpose | Source of truth |
| --- | --- | --- |
| `user_profiles` | User identity, role, linked wallet | Supabase (authoritative) |
| `invoices` | Fast-read invoice list | Soroban contract (authoritative) |
| `financing_offers` | Fast-read offer list | Soroban contract (authoritative) |

The `invoices` and `financing_offers` tables are display caches. When a user performs an action (register invoice, submit offer, accept, repay), the frontend writes to both the Soroban contract and Supabase simultaneously. If the contract call fails, the Supabase write is skipped.

---

## Free Tier Limits

Supabase free tier (as of 2026) includes:

- 500 MB database storage
- 5 GB bandwidth
- 50,000 monthly active users
- Unlimited API requests

This is more than sufficient for a testnet deployment and early mainnet usage.
