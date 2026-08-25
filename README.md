```
 ██╗███╗   ██╗██╗   ██╗ ██████╗ ███████╗██╗
 ██║████╗  ██║██║   ██║██╔═══██╗██╔════╝██║
 ██║██╔██╗ ██║██║   ██║██║   ██║█████╗  ██║
 ██║██║╚██╗██║╚██╗ ██╔╝██║   ██║██╔══╝  ██║
 ██║██║ ╚████║ ╚████╔╝ ╚██████╔╝██║     ██║
 ╚═╝╚═╝  ╚═══╝  ╚═══╝   ╚═════╝ ╚═╝     ╚═╝
```

<div align="center">

**Decentralized Invoice Financing on Stellar Soroban**

[![CI](https://github.com/Stellar-VaultLink/invofi/actions/workflows/ci.yml/badge.svg)](https://github.com/Stellar-VaultLink/invofi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B4FE2)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-FF5B36)](https://soroban.stellar.org)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Auth-Supabase-3ECF8E)](https://supabase.com)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black)](https://invofi-five.vercel.app)

[Live Demo](https://invofi-five.vercel.app) · [Docs](https://stellar-vault-link.gitbook.io/stellar-vault-link-docs) · [Contributing](./CONTRIBUTING.md) · [Report Bug](https://github.com/Stellar-VaultLink/invofi/issues)

</div>

---

## What is InvoFi?

InvoFi is an open-source, decentralised invoice financing protocol built on **Stellar Soroban**. It solves a real problem: small and medium businesses often wait 30–90 days to get paid on invoices, starving them of working capital.

InvoFi lets businesses **tokenise their invoices as on-chain assets** and instantly receive financing from a global pool of investors. Investors earn yield. Businesses get liquidity. Everything is governed by smart contracts — no banks, no middlemen, no trust required.

```text
Business registers invoice  →  Lenders compete with offers  →  Business accepts best offer
→  Funds available immediately  →  Business repays (full or partial)  →  Lender earns yield
```

---

## Project Map

InvoFi lives across **two repositories**, split so the fast-moving app layer and the slow-moving, audit-bound contract layer stay decoupled:

| Repo | Contains | Why separate |
|---|---|---|
| **[invofi](https://github.com/Stellar-VaultLink/invofi)** (this repo) | Next.js frontend (`invofi/apps/frontend`), docs, scripts, roadmap | App-layer changes constantly; Node/npm CI; no audit dependency |
| **[invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts)** | All Soroban Rust contracts — registry, financing, repayment, insurance, reputation, common | Stable, auditable, slow-moving history; Rust-only CI; the repo that goes through the SCF Audit Bank |

**Smart contracts now live in a dedicated repo: [invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts).**

---

## Live Demo

> **Frontend:** [invofi-five.vercel.app](https://invofi-five.vercel.app)
> **Contracts on Stellar Testnet (5-contract deployment):**
> - registry: [`CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7`](https://stellar.expert/explorer/testnet/contract/CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7)
> - financing: [`CBGRA3457ZFXYZNEQLO4YGUQ3OBEWOE6US6ZREHK6NF2DLZYBO73IFVW`](https://stellar.expert/explorer/testnet/contract/CBGRA3457ZFXYZNEQLO4YGUQ3OBEWOE6US6ZREHK6NF2DLZYBO73IFVW)
> - repayment: [`CCDATW5GMVDOPK55Q4MLXV5SGA3VLXPD67ABLBNMHWFF6BLL2IZBUVEP`](https://stellar.expert/explorer/testnet/contract/CCDATW5GMVDOPK55Q4MLXV5SGA3VLXPD67ABLBNMHWFF6BLL2IZBUVEP)
> - insurance: [`CAURQCGDZZ6PPCH6EKDVQP5W372CH3PQ62VQC2GKLIXNHB37VOMBMSU5`](https://stellar.expert/explorer/testnet/contract/CAURQCGDZZ6PPCH6EKDVQP5W372CH3PQ62VQC2GKLIXNHB37VOMBMSU5)
> - reputation: [`CCHKVUWGTQ56U53C5U7ZSOFDTTMGLMOFCL22DME5UMXIYWQNUYXOYPDN`](https://stellar.expert/explorer/testnet/contract/CCHKVUWGTQ56U53C5U7ZSOFDTTMGLMOFCL22DME5UMXIYWQNUYXOYPDN)
> - position token: `POS` minted to lenders on acceptance ([`CBIXYAJPEOOVIALBUTA7X2H26WXSI5JDZCTE23RUMQR4QFJNMPL6767Z`](https://stellar.expert/explorer/testnet/contract/CBIXYAJPEOOVIALBUTA7X2H26WXSI5JDZCTE23RUMQR4QFJNMPL6767Z))
>
> A keeper automation (event-driven Soroban RPC getEvents polling for `inv_reg`/`off_acc` + 6-hourly fallback sweep)
> bumps contract-data TTLs and marks past-due Financed invoices Overdue — see `invofi/scripts/keeper.ts`.
>
> Deploy your own via the **Deploy Contracts to Testnet** workflow in [invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts) and set the three `NEXT_PUBLIC_*_CONTRACT_ID` variables in Vercel. Without a contract configured the app runs in alpha mode (off-chain only).

```bash
git clone https://github.com/Stellar-VaultLink/invofi.git
cd invofi/apps/frontend
cp .env.local.example .env.local   # fill in Supabase + contract values
npm install && npm run dev
# → http://localhost:3000
```

---

## Key Features

### For Businesses
- Register invoices on-chain in under 60 seconds
- Receive competing financing offers from a global investor pool
- Accept the best offer and get immediate liquidity
- Full and **partial repayment** tracked on-chain
- No bank account or credit history needed — your invoice is the collateral

### For Lenders / Investors
- Browse a marketplace of verified on-chain invoices
- Submit financing offers with custom interest rates and duration
- Track active investments and yields in a live portfolio
- Transparent partial repayment history on the Stellar blockchain
- Receive a **SEP-41 position token** (POS) for every accepted offer and
  **transfer your position** to another wallet from your portfolio
- **List a position for sale and browse everyone else's** on the secondary
  board (`/marketplace/positions`) — asking price + invoice reference.
  Discovery only: settlement is the same bilateral SEP-41 transfer, and
  InvoFi never holds the token or the payment ([ADR-0004](./docs/adr/0004-position-token-listings.md))
- Stake into the **insurance coverage pool** to back the protocol —
  and get **payout on default** up to the pool's balance
- Screen borrowers by **on-chain reputation score** — one default outweighs
  two repayments

### Protocol Properties
- **Trustless** — all terms, state transitions, and repayments enforced by Soroban smart contracts
- **Transparent** — every action is a public transaction on Stellar, auditable by anyone
- **Permissionless** — anyone with a Stellar wallet can participate
- **Dual auth** — email/password (Supabase) and Stellar wallet (Freighter or Lobstr)
- **Multi-currency** — invoices denominated in XLM or USDC
- **Partial repayment** — businesses can repay incrementally; offer stays Financed until fully cleared
- **Free to deploy** — Vercel (free) + Supabase (free) + Stellar testnet

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                              Browser (User)                                │
│                Next.js 14 App Router — deployed on Vercel                  │
│                                                                            │
│   ┌──────────────────────┐   ┌─────────────────────────────────────────┐   │
│   │ Email / Password auth │   │  Stellar wallet: Freighter / LOBSTR    │   │
│   │ via Supabase          │   │  @creit.tech/stellar-wallets-kit      │   │
│   │                       │   │  approved-wallets.ts allowlist (6A)    │   │
│   └──────────┬───────────┘   └─────────────────────┬───────────────────┘   │
└──────────────┼──────────────────────────────────────┼──────────────────────┘
               │                                      │ signs Soroban txs
               ▼                                      ▼
┌──────────────────────────┐   ┌──────────────────────────────────────────────┐
│          Supabase         │   │              @invofi/sdk                    │
│   auth + app mirror +     │   │   typed contract client — apps/sdk          │
│   protocol_stats          │   └──────────────────────┬───────────────────────┘
└─────────────┬────────────┘                          │
              │                                       ▼
              │                 ┌─────────────────────────────────────────────────┐
              │                 │        Stellar Soroban — 6-contract system       │
              │                 │                                                 │
              │                 │   registry ──► financing ──► repayment           │
              │                 │      ▲            │  ▲          │                │
              │                 │      └────────────┼──┴──────────┘                │
              │                 │        insurance ─┘  └── reputation              │
              │                 │   position token (POS, SEP-41) minted on         │
              │                 │   accept_offer; restricted cross-contract auth   │
              │                 └─────────────────────┬───────────────────────────┘
              │                                       │ protocol events (RPC)
              ▼                                       ▼
┌──────────────────────────┐   ┌──────────────────────────────────────────────┐
│    /stats page (T14)      │◄──│  indexer (T13) — 6-hourly GitHub Action      │
│  reads protocol_stats     │   │  checkpointed event replay → protocol_stats  │
└──────────────────────────┘   └──────────────────────────────────────────────┘

keeper (T12) — Event-driven RPC subscriptions (`inv_reg`/`off_acc`) + 6-hourly fallback sweep: mark_overdue + TTL bumps
```

No always-on backend server to manage. 100% free hosting.


---

## Project Structure

```text
invofi/
├── invofi/apps/
│   └── frontend/                     Next.js 14 web application
│       └── src/
│           ├── app/
│           │   ├── page.tsx          Landing page
│           │   ├── layout.tsx        Root layout + providers
│           │   ├── dashboard/        Business invoice dashboard
│           │   ├── invoices/         Create and view invoices
│           │   ├── marketplace/      Lender invoice browser
│           │   │   └── positions/    Secondary-market position listings
│           │   ├── api/documents/    Invoice document upload + content routes (issue #222)
│           │   ├── portfolio/        Lender investment tracker
│           │   ├── profile/          User profile + display name
│           │   └── settings/         Account settings
│           ├── components/
│           │   ├── auth/             AuthGuard, WalletButton, WalletProvider,
│           │   │                     WalletSelectDialog (Freighter + Lobstr picker)
│           │   ├── common/           ConfirmDialog, StatsCard, StatsGrid,
│           │   │                     StatusBadge, PageHeader, EmptyState
│           │   ├── invoices/         InvoiceCard, InvoiceForm, InvoiceTable,
│           │   │                     OfferList, EventTimeline (on-chain audit trail)
│           │   ├── layout/           Navbar (dark mode + a11y), Footer
│           │   ├── marketplace/      MarketplaceCard, PositionListingCard, etc.
│           │   ├── portfolio/        LivePortfolioProvider, ConnectionStatus,
│           │   │                     RepaymentProgress (live dashboard, issue #221)
│           │   └── ui/               shadcn/ui — button, dialog, table,
│           │                         badge, card, input, tabs, toast...
│           ├── hooks/                useInvoices, useOffers, useMarketplace,
│           │                         useLocalStorage, useDebounce, useMediaQuery
│           └── lib/
│               ├── contract.ts       Soroban contract call helpers (3 contracts)
│               ├── live/             Live portfolio engine (issue #221): WebSocket
│               │                     + Soroban-event polling transports, per-position
│               │                     throttle, yield/APY math, USD pricing, reducer
│               ├── approved-wallets.ts  Approved-wallet allowlist (extension point)
│               ├── walletkit.ts      stellar-wallets-kit init + active-wallet signing
│               ├── horizon.ts        Stellar Horizon API helpers
│               ├── supabase.ts       Auth + database helpers
│               ├── formatters.ts     Amount, date, address formatters
│               ├── csv.ts            CSV export helpers
│               ├── documents/        Invoice document validation, SHA-256 hash,
│               │                     IPFS/Pinata server helpers
│               └── constants.ts      Network config, risk tiers, enums
├── scripts/
│   └── close-issues.sh              Bulk GitHub issue close
├── docs/
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

---

## Smart Contract Reference

Contracts: `invofi-registry`, `invofi-financing`, `invofi-repayment`, `invofi-insurance`, `invofi-reputation` + the SEP-41 position token · live in [invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts). **The authoritative, always-current function reference and ADRs live in that repo** — the summary below is a condensed overview of the protocol surface and may lag the contracts repo.

### Invoice Fields

| Field | Type | Description |
|---|---|---|
| `id` | `Symbol` | Unique invoice identifier |
| `originator` | `Address` | Stellar address of the business |
| `amount` | `i128` | Invoice amount in stroops (10,000,000 stroops = 1 unit) |
| `currency` | `Symbol` | `XLM` or `USDC` |
| `due_date` | `u64` | Unix timestamp of payment due date |
| `status` | `InvoiceStatus` | `Pending → Financed → Repaid / Overdue / Cancelled / Disputed / Defaulted` |

### FinancingOffer Fields

| Field | Type | Description |
|---|---|---|
| `id` | `Symbol` | Unique offer identifier |
| `invoice_id` | `Symbol` | Invoice this offer targets |
| `lender` | `Address` | Stellar address of the investor |
| `amount` | `i128` | Offer amount in stroops |
| `currency` | `Symbol` | `XLM` or `USDC` |
| `interest_rate` | `u32` | Basis points (500 = 5.00%) |
| `duration` | `u64` | Financing duration in seconds |
| `amount_repaid` | `i128` | Running total of stroops repaid so far |
| `status` | `OfferStatus` | `Pending → Accepted → Financed → Repaid / Rejected / Defaulted` |
| `funded_at` | `u64` | Unix timestamp when offer was accepted |

### Contract Functions

| Function | Auth | Description |
|---|---|---|
| `__constructor(admin, …)` | Deployer (at deploy) | One-time setup runs atomically inside the deploy operation — no front-runnable `initialize()` (ADR-0005) |
| `register_invoice(id, originator, amount, currency, due_date)` | Originator | Register a new invoice; validates `amount > 0` and `due_date > now` |
| `get_invoice(id)` | Anyone | Read invoice state |
| `update_invoice_status(id, status)` | Admin / system | Status transition helper (registry); cross-contract system transitions are caller-guarded |
| `create_offer(offer_id, invoice_id, lender, amount, currency, rate, duration)` | Lender | Submit a financing offer; validates `amount > 0`, `rate > 0` |
| `get_offer(id)` | Anyone | Read offer state |
| `accept_offer(offer_id, originator)` | Business | Accept offer → pulls lender's principal via prior `token.approve`, pays business; invoice → Financed |
| `reject_offer(offer_id, originator)` | Business | Reject a pending offer |
| `repay_invoice(invoice_id, offer_id, repayer, amount)` | Business | Pay `amount` stroops toward the outstanding balance. Offer stays Financed until `amount_repaid >= principal + yield`; then → Repaid |
| `mark_overdue(invoice_id)` | Anyone | Mark a past-due Financed invoice as Overdue |
| `reclaim_invoice(invoice_id, offer_id, lender)` | Lender | After 7-day grace period on Overdue invoice, marks offer Defaulted |
| `get_invoices_by_status(status)` | Anyone | Return all invoices matching a given `InvoiceStatus` |
| `set_rate(admin, tier, rate_bps)` | Admin | Set yield rate for risk tier A/B/C |
| `get_rate(tier)` | Anyone | Read the configured rate for a risk tier |
| `transfer_admin(admin, new_admin)` | Admin | Rotate the admin address |
| `get_admin()` | Anyone | Read the admin address |
| `get_currency_token(currency)` | Anyone | Read the settlement token for a currency (financing) |
| `get_position_token()` | Anyone | Read the configured SEP-41 position-token contract (financing) |
| `raise_dispute(invoice_id, originator)` | Originator | Mark a Financed invoice as Disputed |
| `resolve_dispute(admin, invoice_id, target_status)` | Admin | Resolve a Disputed invoice to a new status |
| `get_lender_stats(lender)` | Anyone | Return aggregated stats for a lender address |
| `get_invoices_count()` | Anyone | Total number of registered invoices |
| `get_offers_count()` | Anyone | Total number of financing offers |
| `get_offers_by_status(status)` | Anyone | Return all offers matching a given status |
| `get_invoices_by_currency(currency)` | Anyone | Return invoices denominated in a specific asset |
| `get_invoices_due_before(timestamp)` | Anyone | Return invoices due before a Unix timestamp |
| `get_invoices_paginated(offset, limit)` | Anyone | Page through all invoices |
| `get_offers_paginated(offset, limit)` | Anyone | Page through all offers |
| `batch_get_invoices(ids)` | Anyone | Fetch multiple invoices by ID in one call |
| `version()` | Anyone | Return the contract semver string |

### Protocol Events

Every state-mutating function publishes a Soroban contract event, so indexers
and UIs can track protocol activity without polling. Topics are
`(event_name, subject_id)` — filter by invoice/offer id without decoding payloads.

| Event | Emitted by | Data |
|---|---|---|
| `inv_reg` | `register_invoice` | `(originator, amount, due_date)` |
| `off_new` | `create_offer` | `(invoice_id, lender, amount, interest_rate)` |
| `off_acc` | `accept_offer` | `(invoice_id, lender, amount)` |
| `off_rej` | `reject_offer` | `invoice_id` |
| `off_wdr` | `withdraw_offer` | `lender` |
| `off_def` | `reclaim_invoice` | `(invoice_id, lender)` |
| `inv_rep` | `repay_invoice` | `(offer_id, amount, fully_repaid)` |
| `inv_ovd` | `mark_overdue` | `due_date` |
| `inv_cxl` | `cancel_invoice` | `originator` |
| `inv_dsp` | `raise_dispute` | `originator` |
| `inv_rsl` | `resolve_dispute` | `new_status` |

### Invoice Lifecycle

```text
register_invoice()
      │
      ▼
  [Pending] ────────────────────────────────────── reject_offer() ──► stays Pending
      │
  accept_offer() ── pays principal to business
      │
      ▼
  [Financed] ◄──────────────────────────────────── repay_invoice() (partial)
      │
      ├── repay_invoice() (balance cleared) ──────► [Repaid]
      │
      ├── mark_overdue() ────────────────────────► [Overdue]
      │                                                │
      │                                           reclaim_invoice()
      │                                           (after 7-day grace,
      │                                            keeper or lender)
      │                                                │
      │                                                ▼
      │                                    invoice → [Defaulted]  ◄── insurance
      │                                    offer  → [Defaulted]      pay_out +
      │                                                               reputation
      │                                                               recorded
      │
      └── raise_dispute() (originator) ──────────► [Disputed]
                                                       │
                                                   resolve_dispute() (admin)
                                                       │
                                                       ├──► [Financed]   (dispute withdrawn)
                                                       └──► [Cancelled]  (dispute upheld)
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Smart Contracts | Rust + Soroban SDK 22 | Native Stellar contract platform |
| Frontend | Next.js 14 (App Router) + TypeScript 5.5 | Free Vercel deployment, SSR |
| Styling | Tailwind CSS + shadcn/ui | Fast, accessible, composable |
| Auth | Supabase | Free tier, row-level security |
| Wallet | Freighter + LOBSTR (approved allowlist) via `@creit.tech/stellar-wallets-kit` | Approving a 3rd wallet = one entry in `approved-wallets.ts` |
| Data Fetching | TanStack Query v5 | Caching, background refetch |
| Forms | React Hook Form + Zod | Type-safe validation |
| Icons | Lucide React | Consistent icon set |
| Stellar SDK | `@stellar/stellar-sdk` v16 | Contract calls, Horizon queries |

---

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Rust 1.70+](https://rustup.rs) with `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)
- A Stellar wallet: [Freighter](https://freighter.app) (browser extension) **or** [LOBSTR](https://lobstr.co) (mobile / browser extension)
- A free [Supabase](https://supabase.com) account

### 1. Clone

```bash
git clone https://github.com/Stellar-VaultLink/invofi.git
cd invofi
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the schema below in **SQL Editor**.
3. Copy your **Project URL** and **Anon Key** from Settings → API.

### 3. Configure environment

```bash
cd invofi/apps/frontend
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_*_CONTRACT_ID
```

### 4. Run the frontend

```bash
npm install && npm run dev
# → http://localhost:3000
```

### 5. Build and test contracts

Contracts live in the dedicated **[invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts)** repo:

```bash
git clone https://github.com/Stellar-VaultLink/invofi-contracts.git
cd invofi-contracts
cargo test          # 110+ tests across all five crates
stellar contract build
```

### 6. Deploy contract to testnet

Use the one-click **Deploy Contract** GitHub Actions workflow in `invofi-contracts` (`.github/workflows/deploy-contract.yml`), or follow the deploy steps in its README.

After deploying, copy the three printed contract IDs into `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`, `NEXT_PUBLIC_FINANCING_CONTRACT_ID`, and `NEXT_PUBLIC_REPAYMENT_CONTRACT_ID` in your `.env.local` or Vercel dashboard, then call `initialize()` on each contract once (the workflow does this automatically).

---

## Supabase Setup

```sql
create table user_profiles (
  id uuid primary key references auth.users(id),
  email text not null,
  role text not null check (role in ('business', 'lender')),
  display_name text,
  wallet_address text,
  created_at timestamptz default now()
);

create table invoices (
  id text primary key,
  originator text not null,
  originator_id uuid references auth.users(id),
  amount text not null,
  currency text not null,
  due_date timestamptz not null,
  status text not null default 'Pending',
  created_at timestamptz default now()
);

create table financing_offers (
  id text primary key,
  invoice_id text references invoices(id),
  lender_id uuid references auth.users(id),
  lender text not null,
  amount text not null,
  currency text not null,
  interest_rate integer not null,
  duration integer not null,
  amount_repaid text not null default '0',
  status text not null default 'Pending',
  funded_at integer default 0,
  created_at timestamptz default now()
);

-- Multi-signature approval queue for high-value operations (issue #219).
-- One row per pending transaction; the base envelope is stored as XDR and each
-- co-signer's signature lands in transaction_approvals. Signatures authorize
-- this one envelope only, so storing them here is safe (never in localStorage).
create table pending_transactions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  operation text not null,
  initiator text not null,
  initiator_id uuid references auth.users(id),
  xdr text not null,
  network_passphrase text not null,
  amount text not null,
  currency text not null,
  required_signatures integer not null default 3,
  status text not null default 'Pending'
    check (status in ('Pending', 'Executed', 'Rejected', 'Expired')),
  tx_hash text,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table transaction_approvals (
  id uuid primary key default gen_random_uuid(),
  pending_tx_id uuid not null references pending_transactions(id) on delete cascade,
  approver_address text not null,
  approver_id uuid references auth.users(id),
  signature text not null,
  created_at timestamptz default now(),
  -- One approval per co-signer per transaction (enforces distinct-approver count).
  unique (pending_tx_id, approver_address)
);

alter table user_profiles enable row level security;
alter table invoices enable row level security;
alter table financing_offers enable row level security;
alter table pending_transactions enable row level security;
alter table transaction_approvals enable row level security;

create policy "Anyone can read invoices" on invoices for select using (true);
create policy "Owner can insert invoices" on invoices for insert with check (originator_id = auth.uid());
create policy "Owner can update invoices" on invoices for update using (originator_id = auth.uid());

create policy "Anyone can read offers" on financing_offers for select using (true);
create policy "Lender can insert offers" on financing_offers for insert with check (lender_id = auth.uid());
create policy "Parties can update offers" on financing_offers for update
  using (lender_id = auth.uid() or
    exists (select 1 from invoices where id = invoice_id and originator_id = auth.uid()));

create policy "Own profile" on user_profiles for all using (id = auth.uid());

-- The approval queue is coordination state, not the source of truth (the account
-- submit enforces the real threshold on-chain — txBAD_AUTH_EXTRA). RLS still adds
-- defense-in-depth: only authenticated users can read it, an approval is bound to
-- its author, and only a request's participants (initiator or an approver) can
-- change its status. Tighten reads to an allow-list of signer addresses per
-- deployment if you don't want the whole org to see the queue.
create policy "Read pending transactions" on pending_transactions for select using (auth.uid() is not null);
create policy "Create pending transactions" on pending_transactions for insert with check (initiator_id = auth.uid());
create policy "Participants update pending transactions" on pending_transactions for update using (
  initiator_id = auth.uid()
  or exists (
    select 1 from transaction_approvals ta
    where ta.pending_tx_id = pending_transactions.id and ta.approver_id = auth.uid()
  )
);

create policy "Read approvals" on transaction_approvals for select using (auth.uid() is not null);
-- Bind each approval to the authenticated author. The stored signature must also
-- verify under approver_address (checked client-side in signatureForAddress before
-- insert); a Postgres RPC that re-checks it server-side is a follow-up.
create policy "Insert own approval" on transaction_approvals for insert with check (approver_id = auth.uid());
```

The `pending_transactions` and `transaction_approvals` tables above ship as a
runnable, idempotent migration at
`invofi/apps/frontend/src/lib/migrations/002_multisig_transactions.sql` (with the
supporting indexes and triggers), mirroring `001_lender_preferences.sql` — apply it
in the Supabase SQL Editor.

> **Co-signer notification is server-side.** The frontend never sends
> notifications (a `NEXT_PUBLIC_*` webhook would be world-readable and callable
> with forged bodies). Wire a **Supabase Database Webhook / Edge Function on
> `insert` into `pending_transactions`** that runs under the service role and
> emails/Slacks the configured co-signers. The queue polls regardless, so a
> co-signer still sees a request even without a push. See ADR-0006 §5.

---

## Deployment (Vercel)

1. Push fork to GitHub.
2. Vercel → **New Project** → import → set **Root Directory** to `invofi/apps/frontend`.
3. Add environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Output from `stellar contract deploy` (registry) |
| `NEXT_PUBLIC_FINANCING_CONTRACT_ID` | Output from `stellar contract deploy` (financing) |
| `NEXT_PUBLIC_REPAYMENT_CONTRACT_ID` | Output from `stellar contract deploy` (repayment) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_WS_URL` | *(optional)* WebSocket relay for the live portfolio dashboard — omit to use the polling fallback |
| `NEXT_PUBLIC_XLM_USD_PRICE` | *(optional)* Fallback XLM/USD price for live USD position values |

---

## Testing

### Frontend end-to-end (Playwright)

The frontend ships a Playwright smoke suite that exercises the core user
lifecycle — landing → login/register, the wallet-connect dialog, the
marketplace, the position-listings board (list / browse / withdraw), and the
invoice detail + print views — against the live Stellar testnet contracts
(issue #171):

```bash
cd invofi/apps/frontend
npm run test:e2e
```

Supabase and the on-chain invoice read are stubbed with fixtures, so the suite
needs no Supabase credentials. It also runs in CI on demand — see
`.github/workflows/e2e.yml`.

### Scripted on-chain flow

A scripted `register → offer → accept` flow exercises the contract wiring
against testnet with two seeded identities:

```bash
cd invofi/scripts
E2E_ORIGINATOR_SECRET_KEY=… E2E_LENDER_SECRET_KEY=… npm run e2e:onchain
```

Both identities are auto-funded via Friendbot on testnet. See
[CONTRIBUTING.md](./CONTRIBUTING.md#testing) for how to create them.

---

## Roadmap

- [x] Core invoice registry contract (register, offer, accept, reject, repay, overdue, reclaim)
- [x] Partial repayment — `amount_repaid` tracking, offer stays Financed until balance cleared
- [x] Query helpers — `get_invoices_by_status`, `get_invoices_by_currency`, `get_invoices_due_before`, pagination, batch queries
- [x] Dispute lifecycle — `raise_dispute` / `resolve_dispute` with admin resolution
- [x] Lender stats — `get_lender_stats` tracking total offered, accepted, pending, repaid
- [x] Input validation — `amount >= MIN_INVOICE_AMOUNT`, `due_date > now`, `interest_rate > 0`, `duration <= MAX_OFFER_DURATION_SECS`
- [x] Next.js 14 frontend with multi-wallet support (Freighter + LOBSTR via `@creit.tech/stellar-wallets-kit`)
- [x] Alpha / demo mode — app runs fully off-chain when no contract is deployed; shows info banner
- [x] Supabase auth (email + wallet), dark mode, accessibility, SEO metadata
- [x] Marketplace and portfolio views, sortable InvoiceTable, StatsCard KPIs
- [x] Profile page, ConfirmDialog, EmptyState, LoadingSkeleton components
- [x] One-click Testnet deploy via GitHub Actions workflow
- [x] Protocol events (v0.3) — every state transition published on-chain for indexers and activity feeds
- [x] Marketplace sorting (newest, amount, due date) and Stellar Expert explorer links
- [x] Insurance coverage pool with **payout on default**
- [x] On-chain **reputation scoring** for originators
- [x] Keeper automation — event-driven Soroban RPC subscriptions (`inv_reg`, `off_acc`) + 6-hourly fallback sweep
- [x] SEP-41 token movement — `accept_offer` funds the business, `repay_invoice` repays principal + yield
- [x] Split into 5 auditable contract crates — registry / financing / repayment / insurance / reputation
- [x] Emergency pause / circuit breaker — admin-gated `pause` on every state-mutating function
- [x] Event indexer + public `/stats` page — aggregates protocol activity
- [x] `@invofi/sdk` — shared typed contract client consumed by the frontend
- [x] Architecture Decision Records — ADR index in both repos
- [x] Deployer-bound initialization — `__constructor` on all contracts, no front-runnable `initialize()` (issue #75)
- [x] Compliance posture documented — KYC/SEP-12 roadmap, jurisdictions, securities-by-design
- [x] Live portfolio dashboard — WebSocket streaming (position/yield/repayment) with reconnection + polling fallback (issue #221)
- [ ] Mainnet deployment
- [ ] Oracle-based invoice verification and risk scoring
- [ ] Multi-signature treasury and escrow
- [ ] KYC / AML with SEP-12 support
- [ ] Contract upgradeability with timelock governance

---

## Maintainers

<table>
  <tbody>
    <tr>
      <td align="center" valign="top">
        <a href="https://github.com/samjay8">
          <img src="https://github.com/samjay8.png?s=100" width="100" height="100" style="border-radius:50%" alt="@samjay8" />
          <br />
          <b>@samjay8</b>
        </a>
        <br />
        <sub>Project maintainer & protocol owner</sub>
      </td>
    </tr>
  </tbody>
</table>

## Contributors

Thanks to everyone who has contributed to InvoFi!! Happy to have you here!

<!-- readme: contributors -start -->
<table>
	<tbody>
		<tr>
            <td align="center">
                <a href="https://github.com/samjay8">
                    <img src="https://avatars.githubusercontent.com/u/197444055?v=4" width="100;" alt="samjay8"/>
                    <br />
                    <sub><b>Samuel Ojetunde</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Ajibose">
                    <img src="https://avatars.githubusercontent.com/u/99620327?v=4" width="100;" alt="Ajibose"/>
                    <br />
                    <sub><b>Ajibose Ibrahim</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/fadesany">
                    <img src="https://avatars.githubusercontent.com/u/285033142?v=4" width="100;" alt="fadesany"/>
                    <br />
                    <sub><b>fadesany</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/waterWang">
                    <img src="https://avatars.githubusercontent.com/u/6082925?v=4" width="100;" alt="waterWang"/>
                    <br />
                    <sub><b>water</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/JinadJay">
                    <img src="https://avatars.githubusercontent.com/u/103272555?v=4" width="100;" alt="JinadJay"/>
                    <br />
                    <sub><b>JinadJay</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Abdulrasaq1515">
                    <img src="https://avatars.githubusercontent.com/u/209874744?v=4" width="100;" alt="Abdulrasaq1515"/>
                    <br />
                    <sub><b>Abdulrasaq1515</b></sub>
                </a>
            </td>
		</tr>
		<tr>
            <td align="center">
                <a href="https://github.com/MJ-RWA">
                    <img src="https://avatars.githubusercontent.com/u/240063069?v=4" width="100;" alt="MJ-RWA"/>
                    <br />
                    <sub><b>MJ | Dev 🏀</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Unclebaffa">
                    <img src="https://avatars.githubusercontent.com/u/122823433?v=4" width="100;" alt="Unclebaffa"/>
                    <br />
                    <sub><b>Alhassan Nuhu Idris</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/retkatmun">
                    <img src="https://avatars.githubusercontent.com/u/153809730?v=4" width="100;" alt="retkatmun"/>
                    <br />
                    <sub><b>scholar</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/KarenZita01">
                    <img src="https://avatars.githubusercontent.com/u/261386615?v=4" width="100;" alt="KarenZita01"/>
                    <br />
                    <sub><b>Karen Agbo</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Aycode01">
                    <img src="https://avatars.githubusercontent.com/u/145759024?v=4" width="100;" alt="Aycode01"/>
                    <br />
                    <sub><b>Omitogun Ayobami</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Babigdk">
                    <img src="https://avatars.githubusercontent.com/u/29020286?v=4" width="100;" alt="Babigdk"/>
                    <br />
                    <sub><b>Abdulrazaq Isa Babi</b></sub>
                </a>
            </td>
		</tr>
		<tr>
            <td align="center">
                <a href="https://github.com/Damieee">
                    <img src="https://avatars.githubusercontent.com/u/115638760?v=4" width="100;" alt="Damieee"/>
                    <br />
                    <sub><b>Oluwadamilare E</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Agbasimere">
                    <img src="https://avatars.githubusercontent.com/u/107962282?v=4" width="100;" alt="Agbasimere"/>
                    <br />
                    <sub><b>Buik3m</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/EneGab">
                    <img src="https://avatars.githubusercontent.com/u/157655503?v=4" width="100;" alt="EneGab"/>
                    <br />
                    <sub><b>EneGab</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/ganeshchandra111">
                    <img src="https://avatars.githubusercontent.com/u/166985591?v=4" width="100;" alt="ganeshchandra111"/>
                    <br />
                    <sub><b>Ganesh chandra</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/AbuJulaybeeb">
                    <img src="https://avatars.githubusercontent.com/u/178188157?v=4" width="100;" alt="AbuJulaybeeb"/>
                    <br />
                    <sub><b>Jibril Raji Qasim </b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Fury03">
                    <img src="https://avatars.githubusercontent.com/u/98775983?v=4" width="100;" alt="Fury03"/>
                    <br />
                    <sub><b>Damilola Ogunrotimi</b></sub>
                </a>
            </td>
		</tr>
		<tr>
            <td align="center">
                <a href="https://github.com/Jayking40">
                    <img src="https://avatars.githubusercontent.com/u/101714779?v=4" width="100;" alt="Jayking40"/>
                    <br />
                    <sub><b>joseph okoronkwo</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Pavel-glitch-ui">
                    <img src="https://avatars.githubusercontent.com/u/208336145?v=4" width="100;" alt="Pavel-glitch-ui"/>
                    <br />
                    <sub><b>Pavel</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Meet-hybrid">
                    <img src="https://avatars.githubusercontent.com/u/231819661?v=4" width="100;" alt="Meet-hybrid"/>
                    <br />
                    <sub><b>Philip Michael</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/RawNuke">
                    <img src="https://avatars.githubusercontent.com/u/67506722?v=4" width="100;" alt="RawNuke"/>
                    <br />
                    <sub><b>Raw_Nuke</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/Jah-yee">
                    <img src="https://avatars.githubusercontent.com/u/166608075?v=4" width="100;" alt="Jah-yee"/>
                    <br />
                    <sub><b>RoomWithOutRoof</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/wagmiiii">
                    <img src="https://avatars.githubusercontent.com/u/130152505?v=4" width="100;" alt="wagmiiii"/>
                    <br />
                    <sub><b>WAGMI</b></sub>
                </a>
            </td>
		</tr>
		<tr>
            <td align="center">
                <a href="https://github.com/mansur-codes">
                    <img src="https://avatars.githubusercontent.com/u/114710463?v=4" width="100;" alt="mansur-codes"/>
                    <br />
                    <sub><b>levi</b></sub>
                </a>
            </td>
            <td align="center">
                <a href="https://github.com/xeladev4">
                    <img src="https://avatars.githubusercontent.com/u/171882586?v=4" width="100;" alt="xeladev4"/>
                    <br />
                    <sub><b>xeladev4</b></sub>
                </a>
            </td>
		</tr>
	<tbody>
</table>
<!-- readme: contributors -end -->

## Contributing

### Getting started contributing

New contributors: welcome. Here is the quickest path from zero to merged PR.

**1. Find your first task**

Both repos label onboarding-friendly issues `good first issue`. Filter here:
- Frontend/app: [github.com/Stellar-VaultLink/invofi/labels/good%20first%20issue](https://github.com/Stellar-VaultLink/invofi/labels/good%20first%20issue)
- Contracts: [github.com/Stellar-VaultLink/invofi-contracts/labels/good%20first%20issue](https://github.com/Stellar-VaultLink/invofi-contracts/labels/good%20first%20issue)

**2. Understand effort**

Issues are labelled by **complexity** so you can gauge effort at a glance:

| Label | What it covers |
|---|---|
| `trivial` | Small, well-scoped fixes — typos, one-line bugs, simple docs |
| `medium` | Standard features and fixes — a single page, hook, or contract function |
| `high-complexity` | Large multi-part efforts — new subsystems, cross-cutting changes |
| `good-first-issue` | Onboarding-friendly tasks; usually also trivial or medium |

See the full label guide in [CONTRIBUTING.md — Issue labels](./CONTRIBUTING.md#issue-labels).

**3. Read the rules**

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. For bugs and features, open a [GitHub Issue](https://github.com/Stellar-VaultLink/invofi/issues) first.

## Security

Do not open a public issue for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for responsible disclosure.

## Compliance

See [docs/compliance.md](./docs/compliance.md) for the KYC/SEP-12 roadmap, jurisdictions avoided at launch, and the design analysis of why the current offer/lender flows are not structured as securities.

## License

MIT © 2026 InvoFi Contributors. See [LICENSE](./LICENSE).
