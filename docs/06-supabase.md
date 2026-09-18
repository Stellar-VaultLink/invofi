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

The schema is **versioned in `apps/frontend/migrations/`** (issue #375). Do not
create tables by hand in the SQL editor anymore — that hand-management is
exactly the reproducibility gap #375 closed.

Apply the chain in lexical order (`0000`, `0001`, ...) against a fresh database:

```bash
# Local docker-compose Postgres
docker compose -f invofi/docker-compose.yml up -d
for f in invofi/apps/frontend/migrations/*.sql; do
  docker exec -i invofi-postgres psql -U invofi -d invofi -v ON_ERROR_STOP=1 < "$f"
done
```

Against Supabase or Neon, apply each file with
`psql -v ON_ERROR_STOP=1 -f <file>` in order. The chain targets plain
Postgres 16 and is idempotent; on Supabase the `auth` schema / `auth.uid()`
already exist natively, so the migration's compatibility shim is a no-op
(see `apps/frontend/migrations/README.md` for the convention going forward:
every schema change is a new numbered file, and applied migrations are never
edited).

> The live Supabase project predates the migrations directory, so its schema
> was created by hand. `0000_baseline.sql` reconstructs it from the repo's
> recorded DDL; diff it against the live project once before relying on a
> fresh-clone rebuild.

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
| `user_profiles` | User identity, role, linked wallet | Supabase (authoritative; schema baselined in `apps/frontend/migrations/`) |
| `invoices` | Fast-read invoice list | Soroban contract (authoritative) |
| `financing_offers` | Fast-read offer list | Soroban contract (authoritative) |
| `position_listings` | Secondary-market asks for position tokens (discovery only) | Supabase (authoritative — a listing is an advertisement, not chain state) |
| `invoice_documents` | Invoice proof files (CID + SHA-256 hash + verification state); bytes on IPFS | IPFS/Pinata for bytes; Supabase (authoritative) for the index |

The `invoices` and `financing_offers` tables are display caches. When a user performs an action (register invoice, submit offer, accept, repay), the frontend writes to both the Soroban contract and Supabase simultaneously. If the contract call fails, the Supabase write is skipped.

---

## Free Tier Limits

Supabase free tier (as of 2026) includes:

- 500 MB database storage
- 5 GB bandwidth
- 50,000 monthly active users
- Unlimited API requests

This is more than sufficient for a testnet deployment and early mainnet usage.
