# InvoFi

**Decentralized Invoice Financing on Stellar Soroban**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B4FE2)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-FF5B36)](https://soroban.stellar.org)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Auth-Supabase-3ECF8E)](https://supabase.com)

[Live Demo](#live-demo) · [Documentation](./docs/) · [Contributing](./CONTRIBUTING.md) · [Report Bug](https://github.com/Stellar-VaultLink/invofi/issues)

---

## What is InvoFi?

InvoFi is an open-source, decentralized invoice financing protocol built on **Stellar Soroban**. It solves a real problem: small and medium businesses often wait 30–90 days to get paid on invoices, starving them of working capital.

InvoFi lets businesses **tokenize their invoices as on-chain assets** and instantly receive financing from a global pool of investors. Investors earn yield. Businesses get liquidity. Everything is governed by smart contracts — no banks, no middlemen, no trust required.

```text
Business registers invoice → Lenders compete with offers → Business accepts best offer
→ Funds available immediately → Business repays at due date → Lender earns yield
```

---

## Live Demo

> Testnet demo: Coming soon — deploy the contract and paste your Vercel URL here once live.

To run locally:

```bash
git clone https://github.com/Stellar-VaultLink/invofi.git
cd invofi/apps/frontend
cp .env.local.example .env.local   # fill in your Supabase + contract values
npm install && npm run dev
# → http://localhost:3000
```

---

## Key Features

### For Businesses

- Register invoices on-chain in under 60 seconds
- Receive competing financing offers from global investors
- Accept the best offer and get immediate liquidity
- Full repayment flow tracked on-chain
- No bank account or credit history needed — your invoice is the collateral

### For Lenders / Investors

- Browse a marketplace of verified on-chain invoices
- Submit financing offers with custom interest rates and duration
- Track active investments and yields in a live portfolio
- Transparent repayment history on the Stellar blockchain

### Protocol Properties

- **Trustless** — all terms, state transitions, and repayments are enforced by Soroban smart contracts
- **Transparent** — every action is a public transaction on Stellar, auditable by anyone
- **Permissionless** — anyone with a Stellar wallet can participate as a business or lender
- **Dual auth** — supports both email/password (via Supabase) and Stellar wallet (via Freighter)
- **Multi-currency** — invoices can be denominated in XLM or USDC
- **Free to deploy** — entire stack runs on Vercel (free) + Supabase (free) + Stellar testnet

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Browser (User)                          │
│  Next.js 14 frontend — hosted on Vercel (free tier)        │
│                                                             │
│   ┌──────────────────┐    ┌────────────────────────────┐   │
│   │  Email / Password│    │   Freighter Wallet          │   │
│   │  auth via        │    │   signs & submits           │   │
│   │  Supabase        │    │   Soroban transactions      │   │
│   └────────┬─────────┘    └────────────┬───────────────┘   │
└────────────┼──────────────────────────┼───────────────────┘
             │                          │
             ▼                          ▼
    ┌─────────────────┐      ┌──────────────────────────┐
    │  Supabase       │      │  Stellar Soroban         │
    │  (free tier)    │      │  Smart Contract          │
    │                 │      │  invofi-invoice-registry  │
    │  - Auth         │      │                          │
    │  - user_profiles│      │  - register_invoice()    │
    │  - invoices     │      │  - create_offer()        │
    │  - offers       │      │  - accept_offer()        │
    │    (mirror)     │      │  - repay_invoice()       │
    └─────────────────┘      └──────────┬───────────────┘
                                        │
                             ┌──────────▼───────────────┐
                             │  Stellar Horizon API      │
                             │  - Balance queries        │
                             │  - Transaction history    │
                             └──────────────────────────┘
```

No backend server. No database to manage. 100% free hosting.

Supabase mirrors on-chain data (invoices, offers) for fast UI queries. The smart contract is always the source of truth — Supabase is only for display speed.

---

## Project Structure

```text
vault-link/
├── invofi/
│   └── apps/
│       ├── contracts/                    Soroban Rust smart contract
│       │   ├── lib.rs                    Main contract — all protocol logic
│       │   ├── test.rs                   9 contract tests
│       │   ├── Cargo.toml                Workspace root + dependency pins
│       │   └── invofi-core/              Secondary module (storage helpers)
│       │       └── src/
│       │           ├── lib.rs            Entry point
│       │           ├── invoice.rs        Invoice data types
│       │           ├── financing.rs      Offer data types
│       │           └── storage.rs        Counter management
│       └── frontend/                     Next.js 14 web application
│           └── src/
│               ├── app/                  Pages (App Router)
│               │   ├── page.tsx          Landing page
│               │   ├── layout.tsx        Root layout + providers
│               │   ├── auth/             Login and registration pages
│               │   ├── dashboard/        Business invoice dashboard
│               │   ├── invoices/         Create and view invoices
│               │   ├── marketplace/      Lender invoice browser
│               │   └── portfolio/        Lender investment tracker
│               ├── components/
│               │   ├── auth/             AuthGuard, WalletButton, WalletProvider
│               │   ├── invoices/         InvoiceCard, InvoiceForm, OfferList
│               │   ├── marketplace/      MarketplaceCard
│               │   ├── layout/           Navbar, Providers
│               │   └── ui/               shadcn/ui base components
│               └── lib/
│                   ├── supabase.ts       Auth + database helpers
│                   ├── freighter.ts      Freighter wallet helpers
│                   ├── contract.ts       Soroban contract calls
│                   ├── horizon.ts        Stellar Horizon API helpers
│                   ├── types.ts          Shared TypeScript types
│                   └── utils.ts          Formatting, class utils
├── docs/                                 Full project documentation
├── scripts/
│   └── close-issues.sh                  Bulk GitHub issue close script
├── .github/
│   ├── ISSUE_TEMPLATE/                  Bug + feature request templates
│   └── PULL_REQUEST_TEMPLATE.md         PR checklist
├── CONTRIBUTING.md                       Contribution guide
├── CODE_OF_CONDUCT.md                   Community standards
├── SECURITY.md                          Vulnerability reporting
└── LICENSE                              MIT
```

---

## Smart Contract Reference

Contract: `invofi-invoice-registry` (`invofi/apps/contracts/lib.rs`)

### Invoice Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | `Symbol` | Unique invoice identifier |
| `originator` | `Address` | Stellar address of the business |
| `amount` | `i128` | Amount in stroops (1 unit = 10,000,000 stroops) |
| `currency` | `Symbol` | `XLM` or `USDC` |
| `due_date` | `u64` | Unix timestamp of the payment due date |
| `status` | `InvoiceStatus` | `Pending → Financed → Repaid / Overdue / Cancelled` |

### FinancingOffer Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | `Symbol` | Unique offer identifier |
| `invoice_id` | `Symbol` | Invoice this offer targets |
| `lender` | `Address` | Stellar address of the investor |
| `amount` | `i128` | Offer amount in stroops |
| `currency` | `Symbol` | `XLM` or `USDC` |
| `interest_rate` | `u32` | Basis points (500 = 5.00%) |
| `duration` | `u64` | Financing duration in seconds |
| `status` | `OfferStatus` | `Pending → Accepted → Repaid / Rejected / Defaulted` |
| `funded_at` | `u64` | Unix timestamp when offer was accepted |

### Contract Functions

| Function | Caller | Description |
| --- | --- | --- |
| `register_invoice(id, originator, amount, currency, due_date)` | Business | Register a new invoice on-chain |
| `get_invoice(id)` | Anyone | Read invoice state |
| `update_invoice_status(id, status)` | Originator | Change invoice status manually |
| `create_offer(offer_id, invoice_id, lender, amount, currency, rate, duration)` | Lender | Submit a financing offer |
| `get_offer(id)` | Anyone | Read offer state |
| `accept_offer(offer_id, originator)` | Business | Accept an offer → invoice becomes Financed |
| `reject_offer(offer_id, originator)` | Business | Reject a pending offer |
| `repay_invoice(invoice_id, offer_id, repayer)` | Business | Mark invoice as Repaid |
| `mark_overdue(invoice_id)` | Anyone | Mark a past-due financed invoice Overdue |

### Invoice Lifecycle

```text
register_invoice()
      │
      ▼
  [Pending] ──── reject_offer() ──── stays Pending (other offers possible)
      │
  accept_offer()
      │
      ▼
  [Financed]
      │
      ├── repay_invoice() ──► [Repaid]
      │
      └── mark_overdue()  ──► [Overdue]
```

---

## Tech Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Smart Contracts | Rust + Soroban SDK 22 | Native Stellar contract platform |
| Frontend | Next.js 14 (App Router) + TypeScript | Free Vercel deployment, SSR |
| Styling | Tailwind CSS + shadcn/ui | Fast, accessible, composable |
| Auth | Supabase | Free tier, row-level security, easy setup |
| Wallet | Freighter browser extension | Standard Stellar wallet |
| Data Fetching | TanStack Query v5 | Caching, background refetch |
| Forms | React Hook Form + Zod | Type-safe validation |
| Icons | Lucide React | Consistent icon set |
| Stellar SDK | stellar-sdk v12 | Contract calls, Horizon queries |

---

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Rust 1.70+](https://rustup.rs) with `wasm32-unknown-unknown` target
- [Freighter wallet](https://freighter.app) browser extension
- A free [Supabase](https://supabase.com) account

### 1. Clone the repository

```bash
git clone https://github.com/Stellar-VaultLink/invofi.git
cd vault-link
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
1. Go to **SQL Editor** and run the schema from the [Supabase Setup](#supabase-setup) section below.
1. Copy your **Project URL** and **Anon Key** from Settings → API.

### 3. Configure environment

```bash
cd invofi/apps/frontend
cp .env.local.example .env.local
```

Open `.env.local` and fill in your Supabase values and contract ID.

### 4. Install and run the frontend

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 5. Build and test the contracts

```bash
cd ../contracts
cargo test
# 9 tests should pass

cargo build --release --target wasm32-unknown-unknown
```

### 6. Deploy the contract to Stellar testnet

```bash
# Install Stellar CLI
cargo install --locked stellar-cli

# Generate and fund a deployer keypair
stellar keys generate --global invofi-deployer --network testnet
stellar keys fund invofi-deployer --network testnet

# Deploy
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/invofi_invoice_registry.wasm \
  --source invofi-deployer \
  --network testnet
# Copy the CONTRACT_ID output into your .env.local
```

---

## Supabase Setup

Run this SQL in your Supabase **SQL Editor**:

```sql
-- User profiles
create table user_profiles (
  id uuid primary key references auth.users(id),
  email text not null,
  role text not null check (role in ('business', 'lender')),
  display_name text,
  wallet_address text,
  created_at timestamptz default now()
);

-- Invoice mirror (for fast UI queries)
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

-- Financing offers mirror
create table financing_offers (
  id text primary key,
  invoice_id text references invoices(id),
  lender_id uuid references auth.users(id),
  lender text not null,
  amount text not null,
  currency text not null,
  interest_rate integer not null,
  duration integer not null,
  status text not null default 'Pending',
  funded_at integer default 0,
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;
alter table invoices enable row level security;
alter table financing_offers enable row level security;

create policy "Anyone can read invoices" on invoices for select using (true);
create policy "Owner can insert invoices" on invoices for insert with check (originator_id = auth.uid());
create policy "Owner can update invoices" on invoices for update using (originator_id = auth.uid());

create policy "Anyone can read offers" on financing_offers for select using (true);
create policy "Lender can insert offers" on financing_offers for insert with check (lender_id = auth.uid());
create policy "Parties can update offers" on financing_offers for update
  using (
    lender_id = auth.uid()
    or exists (
      select 1 from invoices
      where id = invoice_id and originator_id = auth.uid()
    )
  );

create policy "Own profile" on user_profiles for all using (id = auth.uid());
```

---

## Deployment

### Deploy to Vercel (Frontend)

1. Push your fork to GitHub.
1. Go to [vercel.com](https://vercel.com) → **New Project** → import from GitHub.
1. Set **Root Directory** to `invofi/apps/frontend`.
1. Add these environment variables in the Vercel dashboard, then click **Deploy**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_CONTRACT_ID` | Output from `stellar contract deploy` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |

---

## Environment Variables Reference

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `NEXT_PUBLIC_CONTRACT_ID` | Yes | Deployed Soroban contract address |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `testnet` or `mainnet` |
| `NEXT_PUBLIC_RPC_URL` | Yes | Soroban RPC endpoint |
| `NEXT_PUBLIC_HORIZON_URL` | Yes | Stellar Horizon endpoint |
| `NEXT_PUBLIC_USDC_ISSUER` | No | USDC issuer address |

---

## Contract Tests

```bash
cd invofi/apps/contracts
cargo test -- --nocapture
```

| Test | What it verifies |
| --- | --- |
| `test_register_and_get_invoice` | Invoice creation and retrieval |
| `test_duplicate_invoice_id_panics` | Duplicate ID rejection |
| `test_get_non_existent_invoice` | Not-found panic |
| `test_update_invoice_status` | Status mutation |
| `test_create_and_get_offer` | Offer creation and retrieval |
| `test_accept_offer` | Offer acceptance + invoice state change |
| `test_reject_offer` | Offer rejection, invoice stays Pending |
| `test_repay_invoice` | Full repayment flow |
| `test_repay_unfinanced_invoice_panics` | Guard against premature repayment |

---

## Roadmap

- [x] Core invoice registry contract
- [x] Financing offer flow (create, accept, reject)
- [x] Repayment and overdue marking
- [x] Next.js frontend with Freighter wallet
- [x] Supabase auth (email + wallet)
- [x] Marketplace and portfolio views
- [ ] Mainnet deployment
- [ ] USDC token transfer integration (actual on-chain fund movement)
- [ ] Oracle-based invoice verification
- [ ] Multi-signature treasury and escrow
- [ ] KYC/AML with SEP-12 support
- [ ] Contract upgradeability with timelock governance

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. For bugs and features, use [GitHub Issues](https://github.com/Stellar-VaultLink/invofi/issues).

---

## Security

If you discover a security vulnerability, do not open a public issue. Please read [SECURITY.md](./SECURITY.md) for responsible disclosure instructions.

---

## License

MIT © 2026 InvoFi Contributors. See [LICENSE](./LICENSE).
