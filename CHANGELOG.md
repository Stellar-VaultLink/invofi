# Changelog

All notable changes to the InvoFi app repository (frontend, SDK, indexer,
scripts, docs) are documented here.

Versioning follows [Semantic Versioning](https://semver.org/). Commit
messages follow [Conventional Commits](https://www.conventionalcommits.org/)
and are enforced by commitlint in CI — so this file can be regenerated
mechanically from the git history.

---

## [Unreleased] — 2026-08-06

### Added

- **Invoice on-chain activity timeline** — the invoice detail page lists the
  invoice's lifecycle events (registered, offers created/accepted, repayments,
  marked overdue, disputes, defaults) newest-first, sourced from Soroban RPC
  `getEvents` scoped to one invoice id. Each row shows a human-readable label,
  raw event type, timestamp, ledger number, and a Stellar Expert tx link.
  Data layer is shaped for a drop-in switch to the indexer events table (#95)
- **Secondary-market position listings** — `/marketplace/positions`: lenders
  publish an ask (invoice reference, position size, asking price) and browse,
  filter, and sort everyone else's. Discovery only — no matching, custody, or
  fees; settlement stays a bilateral SEP-41 transfer. ADR-0004 plus a
  compliance revisit (`docs/compliance.md` § 4.6) and a Playwright spec
  covering list / browse / guard / withdraw
- **Compliance posture** — `docs/compliance.md`: current status, phased
  SEP-12 KYC/AML roadmap, jurisdictions avoided at launch, and a
  securities-by-design analysis
- **Architecture + roadmap refresh** — diagram redrawn for the 2-repo,
  6-contract system; `docs/10-roadmap.md` and README checklist synced to
  shipped reality
- **Commitlint enforcement** on PRs — Conventional Commits gate in CI
- **Event indexer** — checkpointed Soroban event replay writing aggregates
  to `protocol_stats`
- **Public `/stats` page** — reads indexer aggregates; loading/error/empty
  states + refresh
- **`@invofi/sdk`** — shared typed contract client under `apps/sdk`,
  consumed by the frontend via tsconfig paths
- **ADR index** — `docs/adr` (approved-wallet allowlist, event indexer, SDK
  extraction)
- **Frontend Defaulted status** + 5-contract testnet docs + keeper workflow
  docs
- **Position-token transfer UI** + live 3-contract IDs + docs
- **3-contract wiring + approved-wallet allowlist** — Freighter + LOBSTR
  behind `approved-wallets.ts`
- **LOBSTR detection** via the official signer-extension-api handshake
- **Offer remaining balance** after partial repayments
- **Auto-generated README contributors** on merge — no opt-in comment needed
- **Private vulnerability reporting** enabled + real maintainer contact in
  SECURITY.md (issue #75 follow-up)

### Fixed

- `@invofi/sdk` tsconfig path — sibling directories are one level up
  (`../sdk`, not `../../sdk`)
- Keeper + indexer scheduled workflows run on Node 22 to match
  `@stellar/stellar-sdk`/`@supabase/supabase-js` engine requirements
- Code-review pass: single source of truth for types, indexer checkpoint
  safety, stats page lint
- Full-repay detection, cancel confirmation, total-due hint
- Repay ABI alignment, on-chain cancel, status sync, unified contract ID
- Mirror strings normalized to human units; portfolio offers normalized
- Bright favicon + simplified hexagon-invoice app icons

### Changed

- **Two-repo topology** — `apps/contracts` removed from this repo; all
  Soroban Rust work lives in `Stellar-VaultLink/invofi-contracts`
- Dependencies (via Dependabot): `react-hook-form`, `@radix-ui/react-avatar`,
  `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `@supabase/supabase-js`,
  `@supabase/ssr`, `autoprefixer`, `postcss`, `actions/setup-node`,
  `actions/checkout`; lockfiles regenerated with Node 20 npm

---

## [0.x] — Earlier (pre-split)

Before the August 2026 expansion the monorepo contained the app plus the
original single-crate Soroban contract. See the git history for that era;
the contract history now lives in [invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts/blob/master/CHANGELOG.md).
