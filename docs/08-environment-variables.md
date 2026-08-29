# Environment Variables

Most environment variables for the InvoFi frontend are prefixed with `NEXT_PUBLIC_` so they are available in the browser. As of the SEP-10 wallet login feature (issue #103), the stack also has a small number of **server-side secrets** — see [Server-Side Secrets](#server-side-secrets) below. These are never prefixed `NEXT_PUBLIC_`, which is what keeps Next.js from ever inlining them into a client bundle; they are only read from Route Handlers (`src/app/api/**/route.ts`), which run exclusively on the server.

---

## Full Reference

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `https://xxxx.supabase.co` | Your Supabase project URL, from Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `eyJhbGci...` | Supabase anon/public key, from Settings → API |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Yes* | `CAXNTWS...` | Registry contract (invoices, admin, pause) — 56 chars, starts with C |
| `NEXT_PUBLIC_FINANCING_CONTRACT_ID` | Yes* | `CBGRA34...` | Financing contract (offers, accept/reject) |
| `NEXT_PUBLIC_REPAYMENT_CONTRACT_ID` | Yes* | `CCDATW5...` | Repayment contract (repay, overdue, reclaim) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `testnet` | `testnet` for development, `mainnet` for production |
| `NEXT_PUBLIC_RPC_URL` | Yes | See below | Soroban RPC endpoint (differs by network) |
| `NEXT_PUBLIC_HORIZON_URL` | Yes | See below | Stellar Horizon REST API (differs by network) |
| `NEXT_PUBLIC_USDC_ISSUER` | No | `GBBD47IF...` | USDC issuer address. Required to display USDC balances. |
| `NEXT_PUBLIC_SEP10_HOME_DOMAIN` | No (recommended) | `invofi.app` | Domain the SEP-10 challenge asserts as the party requesting auth. Defaults to `localhost`. |
| `NEXT_PUBLIC_SEP10_WEB_AUTH_DOMAIN` | No | `invofi.app` | Domain that issued the challenge (SEP-10's `WEB_AUTH_DOMAIN`). Defaults to `NEXT_PUBLIC_SEP10_HOME_DOMAIN`. |
| `SEP10_SERVER_SIGNING_SECRET` | Yes, for wallet login | *(never committed)* | **Server-only.** Stellar secret key (`S...`) the server uses to sign/validate SEP-10 challenges. See below. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes, for wallet login | *(never committed)* | **Server-only.** Supabase service-role key, from Settings → API. See below. |
| `NEXT_PUBLIC_WS_URL` | No | `wss://relay.invofi.dev` | WebSocket relay for the live portfolio dashboard (issue #221). When empty or unreachable the dashboard degrades to Soroban event-stream + Supabase polling. |
| `NEXT_PUBLIC_XLM_USD_PRICE` | No | `0.15` | XLM/USD fallback price used for live USD position values when the live price feed (CoinGecko) is unreachable. |
| `NEXT_PUBLIC_DEMO_MODE` | No | `1` | Shows a "Try the demo" entry on the landing page hero (issue #107). The demo experience reuses the offline mock layers (seeded invoices, offers, and a position token) so a reviewer can reach a portfolio with seeded data without an account or wallet. The entry is labeled testnet-only and never touches production flows. Set together with `NEXT_PUBLIC_USE_MOCK=1` for a fully offline demo deployment. |

\* Legacy fallback: if the three `*_CONTRACT_ID` variables are unset, the app
uses the single `NEXT_PUBLIC_CONTRACT_ID` and routes every call to that one
contract (pre-3-contract deployments keep working).

\** Pinata variables are only needed for the invoice document workflow.

> **Server-only secrets**: `PINATA_API_KEY` and `PINATA_SECRET_API_KEY` are the
> stack's first server-only secrets. They must never be prefixed with
> `NEXT_PUBLIC_` (that would ship them to every browser) and are only read by
> the `app/api/documents/*` route handlers on the Node.js runtime.

---

## Server-Side Secrets

Before issue #103, this stack had **no server-side secrets at all** — every variable was `NEXT_PUBLIC_` and safe to ship to the browser. Verifying real ownership of a Stellar wallet via [SEP-10](https://stellar.org/protocol/sep-10) changed that: a SEP-10 challenge must be built and validated with a key the *server* controls, and minting a real Supabase session from a verified wallet address requires the Supabase *service role* key. Both are genuine secrets and must never reach client code.

| Variable | Description |
| --- | --- |
| `SEP10_SERVER_SIGNING_SECRET` | A Stellar keypair's secret key (`S...`), used only server-side to sign SEP-10 challenge transactions and to identify the server's account (`serverKeypair.publicKey()`) when validating a signed-back challenge. Generate a dedicated keypair for this — do not reuse a wallet that holds funds or contract admin rights. The account does **not** need to be funded on-chain; SEP-10 challenge transactions are never submitted to the network. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase's service-role API key, from **Settings → API** (labelled "service_role secret"). Bypasses Row Level Security — used only in `src/utils/supabase/admin.ts`, and only from Route Handlers, to look up/create the auth user for a verified wallet address and mint a session via `auth.admin.generateLink`. |

**Where these are used**: exclusively inside `src/app/api/auth/sep10/{challenge,verify}/route.ts` and the modules they import (`src/lib/sep10-server.ts`, `src/utils/supabase/admin.ts`). Route Handlers are server-only in Next.js's App Router — their code never ships to the browser, unlike a variable read in a Client Component (which is exactly why `NEXT_PUBLIC_*` variables are safe to read anywhere but these are not).

**Local development**: add both to `.env.local` (already `.gitignore`d, never committed). For a quick testnet setup:

```bash
# Any freshly generated Stellar keypair works — it never needs to hold funds.
node -e "const {Keypair}=require('@stellar/stellar-sdk'); const k=Keypair.random(); console.log('SEP10_SERVER_SIGNING_SECRET='+k.secret());"
```

Then copy `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project's **Settings → API** page.

**Vercel / production**: add both under **Settings → Environment Variables** same as any other var, but double-check they are *not* accidentally prefixed `NEXT_PUBLIC_` and are not referenced from any Client Component.

**Schema requirement**: the wallet-login verify endpoint writes to a `wallet_verified boolean` column on `user_profiles`, distinguishing a SEP-10-verified wallet address from one merely linked via the legacy `signInWithWallet` blind-trust path. This repository has no migrations directory, so the column must be added by hand in the Supabase SQL editor before enabling wallet login:

```sql
alter table public.user_profiles
  add column if not exists wallet_verified boolean not null default false;
```

**Schema requirement (single-use challenges)**: the verify endpoint also requires a `sep10_used_challenges` table with a `tx_hash` column that is `UNIQUE` (or the primary key) — this is what `claimSep10ChallengeHash` (`src/lib/sep10-replay-guard.ts`) relies on to atomically reject a replayed challenge. Add it the same way:

```sql
create table if not exists public.sep10_used_challenges (
  tx_hash text primary key,
  created_at timestamptz not null default now()
);

alter table public.sep10_used_challenges enable row level security;
revoke all on table public.sep10_used_challenges from anon, authenticated;
grant insert on table public.sep10_used_challenges to service_role;
```

RLS is enabled with no client policies (so `anon`/`authenticated` are denied even if a future `grant` is added by mistake), and the explicit `revoke` removes whatever default privileges the project's Supabase setup may have granted those roles — this table is only ever written via the service-role admin client, which bypasses RLS but still needs the underlying privilege.

**Retention**: a challenge can never be validly re-verified once its timebound plus `WebAuth.readChallengeTx`'s fixed 5-minute grace period has elapsed — `readChallengeTx` rejects it as expired before the single-use check in `claimSep10ChallengeHash` is ever reached. With `SEP10_DEFAULT_TIMEOUT_SECONDS = 300` (`src/lib/sep10-server.ts`) that's a 10-minute maximum window, so a row older than that serves no further replay-protection purpose. Rather than a new scheduled job/service, this repo uses Postgres's own `pg_cron` (enable the extension once under Supabase Dashboard → Database → Extensions) to delete stale rows in place:

```sql
select cron.schedule(
  'sep10-used-challenges-cleanup',
  '*/15 * * * *', -- every 15 minutes
  $$ delete from public.sep10_used_challenges where created_at < now() - interval '1 hour' $$
);
```

The 1-hour cutoff (well past the 10-minute maximum validity window) is headroom for clock skew and cron cadence, not a security boundary.

---

## Network Endpoints

### Testnet

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

### Mainnet

```env
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_RPC_URL=https://soroban-rpc.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
```

---

## Local Development

Copy the template and fill in your values:

```bash
cd invofi/apps/frontend
cp .env.local.example .env.local
```

`.env.local` is in `.gitignore` and will never be committed to the repository.

---

## Vercel

In the Vercel project dashboard, go to **Settings → Environment Variables** and add each variable. Vercel rebuilds and redeploys automatically when you change an environment variable.

To use different values for Preview and Production deployments, set the environment scope for each variable (Vercel lets you target Development, Preview, and Production separately).

---

## How Variables Are Used

| Variable | Used in |
| --- | --- |
| `SUPABASE_URL` + `SUPABASE_ANON_KEY` | `lib/supabase.ts` — creates the Supabase client |
| `REGISTRY_CONTRACT_ID` | `lib/contract.ts` — invoice CRUD calls on the registry contract |
| `FINANCING_CONTRACT_ID` | `lib/contract.ts` — offer/accept calls on the financing contract |
| `REPAYMENT_CONTRACT_ID` | `lib/contract.ts` — repay/reclaim calls on the repayment contract |
| `STELLAR_NETWORK` | `lib/contract.ts`, `lib/walletkit.ts` — network passphrase + wallet network |
| `RPC_URL` | `lib/contract.ts` — Soroban RPC for simulating and sending transactions |
| `HORIZON_URL` | `lib/horizon.ts` — reads account balances and transaction history |
| `USDC_ISSUER` | `lib/horizon.ts` — identifies the USDC asset when reading balances |
| `SEP10_HOME_DOMAIN` / `SEP10_WEB_AUTH_DOMAIN` | `lib/sep10-server.ts` — asserted in the SEP-10 challenge; validated on verify |
| `SEP10_SERVER_SIGNING_SECRET` | `lib/sep10-server.ts` (via `src/app/api/auth/sep10/*`) — signs/validates SEP-10 challenges |
| `SUPABASE_SERVICE_ROLE_KEY` | `utils/supabase/admin.ts` (via `src/app/api/auth/sep10/verify`) — mints a session for a verified wallet |
| `WS_URL` | `lib/live/*` — live portfolio dashboard WebSocket relay; falls back to polling |
| `XLM_USD_PRICE` | `lib/live/prices.ts` — fallback XLM/USD price for live USD position values |
