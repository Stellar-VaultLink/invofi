# Architecture

## Overview

InvoFi is a three-layer system with no traditional backend server. Each layer has a single, clear responsibility.

```text
┌─────────────────────────────────────────────────────────────┐
│                     Browser (User)                          │
│         Next.js 14 frontend on Vercel (free tier)          │
│                                                             │
│   ┌──────────────────┐    ┌────────────────────────────┐   │
│   │  Email / Password│    │   Freighter Wallet          │   │
│   │  → Supabase Auth │    │   signs Soroban txs         │   │
│   └────────┬─────────┘    └────────────┬───────────────┘   │
└────────────┼──────────────────────────┼───────────────────┘
             │                          │
             ▼                          ▼
    ┌─────────────────┐      ┌──────────────────────────┐
    │  Supabase       │      │  Stellar Soroban         │
    │  (free tier)    │      │  Smart Contract          │
    │                 │      │  invofi-invoice-registry  │
    │  - Auth users   │      │                          │
    │  - user_profiles│      │  - register_invoice()    │
    │  - invoices     │      │  - create_offer()        │
    │  - offers       │      │  - accept_offer()        │
    │    (mirrors)    │      │  - repay_invoice()       │
    └─────────────────┘      └──────────┬───────────────┘
                                        │
                             ┌──────────▼───────────────┐
                             │  Stellar Horizon API      │
                             │  - Account balances       │
                             │  - Transaction history    │
                             └──────────────────────────┘
```

---

## Layer 1 — Smart Contract (Source of Truth)

The Soroban contract (`invofi/apps/contracts/lib.rs`) is the authoritative record for all invoices and financing offers. Nothing in Supabase or the frontend overrides what the contract says.

**Responsibilities:**
- Store invoice and offer state on the Stellar ledger
- Enforce access control (`require_auth()` on all mutations)
- Enforce business rules (e.g. invoice must be Financed before repayment)
- Emit state changes that the frontend can read

**Technology:** Rust + Soroban SDK 22, compiled to WebAssembly

---

## Layer 2 — Supabase (Auth + Display Cache)

Supabase plays two roles:

1. **Authentication.** It handles email/password sign-up and login, session management, and JWT tokens. User wallet addresses are linked to Supabase accounts in the `user_profiles` table.

2. **Display mirror.** When a user creates an invoice or submits an offer via the frontend, the frontend writes the data to both the Soroban contract (the real record) and Supabase (a fast-queryable copy). This lets the UI load invoice lists instantly without making on-chain RPC calls for every page load.

> **Important:** Supabase is a cache, not the source of truth. If Supabase data ever diverges from on-chain data, the contract state wins.

**Technology:** Supabase hosted PostgreSQL + Row Level Security policies

---

## Layer 3 — Frontend (User Interface)

The Next.js frontend is the user's window into the protocol. It:

- Authenticates users via Supabase
- Connects to the Freighter wallet via `@stellar/freighter-api`
- Reads invoice and offer data from Supabase (fast) and the contract (authoritative)
- Builds and submits Soroban transactions signed by the user's Freighter wallet
- Reads account balances and transaction history from Stellar Horizon

**Technology:** Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query

---

## Data Flow: Registering an Invoice

```text
User fills form → InvoiceForm.tsx
      │
      ▼
lib/contract.ts: buildAndSimulateTransaction('register_invoice', args)
      │
      ▼
Stellar Soroban RPC: simulateTransaction
      │
      ▼
lib/freighter.ts: signTxWithFreighter(txXdr)
      │
Freighter wallet prompts user for approval
      │
      ▼
Stellar Soroban RPC: sendTransaction → confirmed on ledger
      │
      ▼ (in parallel)
lib/supabase.ts: insert into invoices table (display mirror)
      │
      ▼
Router.push('/invoices/{id}') → user sees their new invoice
```

---

## Data Flow: Lender Makes an Offer

```text
Lender clicks "Make Offer" on marketplace
      │
      ▼
OfferList.tsx → lib/contract.ts: create_offer(...)
      │
Freighter signs + Soroban confirms
      │
      ▼
Supabase: insert into financing_offers
      │
      ▼
Invoice detail page refreshes → originator sees new offer
```

---

## Why No Backend Server?

The original VaultLink design included a NestJS backend with PostgreSQL and Redis. This was removed for two reasons:

1. **Cost.** Running a persistent Node.js server requires a paid hosting plan. The current stack (Vercel + Supabase + Stellar) costs $0 on free tiers.

2. **Trust.** A centralized backend is a single point of failure and a trust bottleneck. The Soroban contract enforces all rules on-chain — a backend would only duplicate that logic while introducing a new attack surface.

---

## Repository Structure

```text
vault-link/                          Git repository root
└── invofi/                          Main project directory
    └── apps/
        ├── contracts/               Soroban contract (Rust)
        │   ├── lib.rs               Contract logic
        │   ├── test.rs              Test suite
        │   ├── Cargo.toml           Dependencies
        │   └── invofi-core/         Supporting module
        └── frontend/                Next.js application
            └── src/
                ├── app/             Pages (App Router)
                ├── components/      React components
                └── lib/             SDK helpers and utilities
```
