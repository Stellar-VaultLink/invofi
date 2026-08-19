# Roadmap

Last updated: August 2026. Checkbox status reflects what is merged to `main`
(and `master` in invofi-contracts) — nothing is marked done before it ships.

---

## What Is Built

### Smart Contracts (invofi-contracts — 5 crates + position token)

- [x] Registry — invoice lifecycle: register, cancel, disputes, blacklist, status transitions
- [x] Financing — offers: create, withdraw, accept, reject; **SEP-41 principal transfer** (lender → business) and **position-token mint** on accept
- [x] Repayment — full + partial repayment with **SEP-41 transfer** of principal + yield; overdue marking, reclaim/default
- [x] Insurance — stake/unstake pool, **payout on default** capped at pool balance
- [x] Reputation — repayment outcomes → public originator score
- [x] Position token — SEP-41 `POS` minted 1:1 with principal; transferable between wallets
- [x] Emergency pause / circuit breaker on every state-mutating function
- [x] Restricted cross-contract auth (registry ↔ financing ↔ repayment, insurance, reputation)
- [x] Deployer-bound initialization — `__constructor`, no front-runnable `initialize()` (issue #75)
- [x] Structured protocol events on every state-mutating function
- [x] 110 passing tests across all crates; clippy `-D warnings`; Soroban Scout; commitlint gates

### Frontend / SDK (invofi)

- [x] Landing page, role-based auth (email/password via Supabase + wallet)
- [x] Wallet support: **Freighter + LOBSTR** via `@creit.tech/stellar-wallets-kit` approved allowlist
- [x] Business dashboard, invoice creation, offer management
- [x] Lender marketplace (browse Pending invoices, sorting)
- [x] Lender portfolio with **remaining balance after partial repayments** + position-token trustline/transfer UI
- [x] Secondary-market **position listings** — publish an ask (invoice reference, size, price) and browse the board at `/marketplace/positions`; discovery only, settlement stays a bilateral SEP-41 transfer ([ADR-0004](./adr/0004-position-token-listings.md))
- [x] Public `/stats` page reading indexer aggregates
- [x] `@invofi/sdk` — shared typed contract client consumed by the frontend
- [x] Alpha / demo mode when no contract is configured

### Infrastructure & Automation

- [x] Frontend testnet config — registry/financing/repayment contract IDs (`NEXT_PUBLIC_{REGISTRY,FINANCING,REPAYMENT}_CONTRACT_ID`)
- [x] Keeper automation — event-driven Soroban RPC getEvents polling (`inv_reg`, `off_acc`) + 6-hourly fallback sweep
- [x] Event indexer — checkpointed replay → `protocol_stats`; **temporarily bypassed pending the Supabase/DB migration** — re-enabled when the indexer is rewired to the new database
- [x] Contributors auto-table on merge (no opt-in comment needed), bot-driven PRs, issues open to all
- [x] One-click Testnet deploy via GitHub Actions (invofi-contracts)
- [x] Compliance posture documented — see [compliance.md](./compliance.md)

---

## Next Up

- [ ] Mainnet deployment (preceded by the SEP-12 KYC roadmap in compliance.md)
- [ ] Independent security audit (SCF Audit Bank)
- [ ] Oracle-based invoice verification and risk scoring
- [ ] Multi-signature treasury and escrow
- [ ] Contract upgradeability with timelock governance
- [ ] Demo video walkthrough (see [demo-video.md](./demo-video.md))

---

## Long-Range

- [ ] Lender verification (threshold-based SEP-12 onboarding, Phase 4 of compliance.md)
- [ ] On-chain (event-sourced) position listings — the alternative deferred in ADR-0004, if listings ever need to be readable without InvoFi's frontend
- [ ] Historical time-series charts on `/stats`
