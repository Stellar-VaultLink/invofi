# Contributing to InvoFi

Thank you for your interest in contributing to InvoFi. This document covers everything you need to know to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [What Can I Contribute?](#what-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Commit Message Format](#commit-message-format)
- [Smart Contract Guidelines](#smart-contract-guidelines)
- [Frontend Guidelines](#frontend-guidelines)
- [Testing](#testing)

---

## Code of Conduct

By participating in this project you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before contributing.

---

## What Can I Contribute?

- **Bug fixes** — open an issue first to confirm the bug, then submit a PR
- **Features from the roadmap** — check the [README roadmap](./README.md#roadmap) for items marked `[ ]`
- **Documentation** — improve docs, add examples, fix typos
- **Tests** — increase contract or frontend test coverage
- **Translations** — UI string translations (open an issue first to coordinate)

For anything not on the roadmap or larger than a bug fix, **open an issue first** and describe what you want to build. This prevents duplicate work and ensures your effort aligns with the project direction.

---

## Development Setup

### Prerequisites

- Node.js 20+
- Rust 1.70+ with `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) (`cargo install --locked stellar-cli`)
- [Freighter wallet](https://freighter.app) browser extension
- A free [Supabase](https://supabase.com) account

### Fork and clone

```bash
# 1. Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/vault-link.git
cd vault-link

# 2. Add the upstream remote
git remote add upstream https://github.com/Stellar-VaultLink/invofi.git
```

### Frontend setup

```bash
cd invofi/apps/frontend
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_CONTRACT_ID
npm install
npm run dev
```

### Contract setup

```bash
cd invofi/apps/contracts
cargo test         # run all 9 tests
cargo build --release --target wasm32-unknown-unknown
```

---

## Project Structure

See [README.md — Project Structure](./README.md#project-structure) for the full directory layout.

The two main areas of the codebase are:

- `invofi/apps/contracts/` — Soroban Rust smart contract (the source of truth)
- `invofi/apps/frontend/` — Next.js 14 web application

---

## Making Changes

### Workflow

```bash
# Keep your fork in sync
git fetch upstream
git checkout main
git merge upstream/main

# Create a feature branch
git checkout -b feat/your-feature-name

# Make your changes, then push
git push origin feat/your-feature-name

# Open a pull request on GitHub
```

### Branch naming

| Type | Pattern | Example |
| --- | --- | --- |
| Feature | `feat/short-description` | `feat/usdc-token-transfer` |
| Bug fix | `fix/short-description` | `fix/offer-accept-auth` |
| Documentation | `docs/short-description` | `docs/supabase-setup` |
| Refactor | `refactor/short-description` | `refactor/contract-storage` |
| Test | `test/short-description` | `test/repayment-edge-cases` |

---

## Pull Request Guidelines

- **One concern per PR.** If you fix a bug and add a feature, open two PRs.
- **Reference the issue.** Add `Fixes #123` or `Closes #123` in the PR description.
- **Fill in the PR template.** It includes a checklist — tick every item before requesting review.
- **Keep diffs small.** Large PRs take longer to review and are more likely to conflict.
- **Add tests.** Bug fixes should include a regression test. New features should include happy-path and error-path tests.
- **Pass CI.** All checks must be green before a PR can be merged.

---

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

Scopes: `contract`, `frontend`, `auth`, `invoice`, `offer`, `repayment`, `docs`, `ci`

Examples:

```text
feat(contract): add mark_overdue function
fix(frontend): prevent double-submit on invoice form
docs(readme): add Supabase SQL schema
test(contract): add edge case for duplicate invoice ID
```

---

## Smart Contract Guidelines

- All state-mutating functions must call `require_auth()` on the caller.
- Validate all input before writing to storage.
- Every new function needs at least one happy-path test and one panic test.
- Panic messages must be clear English: `panic!("Invoice not found")` not `panic!("err_404")`.
- Do not change existing storage key strings (`"invoices"`, `"offers"`) — this would corrupt deployed contract state.
- Run `cargo test` and `cargo clippy` before pushing.

```bash
cd invofi/apps/contracts
cargo test
cargo clippy -- -D warnings
```

---

## Frontend Guidelines

- Use TypeScript strictly — no `any` types without justification.
- All user-facing async operations must show a loading state and handle errors with toast notifications.
- Use `useToast` from `components/ui/use-toast.ts` for all error/success feedback.
- Forms must use `react-hook-form` + `zod` for validation.
- New pages must be wrapped in `<AuthGuard>` if they require authentication.
- Run the type checker before pushing.

```bash
cd invofi/apps/frontend
npm run type-check
npm run lint
```

---

## Testing

### Contract tests

```bash
cd invofi/apps/contracts
cargo test -- --nocapture
```

All 9 existing tests must pass. Add new tests for any new contract functions.

### Frontend type checking

```bash
cd invofi/apps/frontend
npm run type-check
```

There is no frontend unit test suite yet. If you add one, use Vitest.

---

## Questions?

Open a [GitHub Discussion](https://github.com/Stellar-VaultLink/invofi/discussions) or comment on the relevant issue. We're happy to help new contributors get oriented.
