# Contributing

This page summarises how to get a development environment running and make your first contribution. For the full guide see [CONTRIBUTING.md](../CONTRIBUTING.md) at the root of the repository.

---

## Quick Setup

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/invofi.git
cd invofi

# 2. Add upstream remote
git remote add upstream https://github.com/Stellar-VaultLink/invofi.git

# 3. Set up the frontend
cd invofi/apps/frontend
cp .env.local.example .env.local
# Fill in Supabase + contract values
npm install
npm run dev

# 4. Test the contracts
cd ../contracts
cargo test
```

---

## Making a Contribution

```bash
# Sync with upstream
git fetch upstream && git checkout main && git merge upstream/main

# Create a branch
git checkout -b feat/your-feature

# Make changes, then:
cd invofi/apps/contracts && cargo test && cargo clippy -- -D warnings
cd invofi/apps/frontend && npm run type-check && npm run lint

# Commit using Conventional Commits
git commit -m "feat(contract): add mark_overdue function"

# Push and open a PR
git push origin feat/your-feature
```

---

## What to Work On

Check the [Roadmap](./10-roadmap.md) for items marked `[ ]`. The highest-value next items are:

1. **USDC on-chain token transfers** — making the financing actually move real tokens
2. **Frontend unit tests** — setting up Vitest and writing component tests
3. **Mobile-responsive UI** — the current layout works on desktop; needs mobile polish

Before starting anything non-trivial, open an issue first to coordinate.

---

## Standards

- **Contracts:** All mutations require `require_auth()`. Every new function needs tests.
- **Frontend:** TypeScript strict mode. No `any`. All async ops show loading + error states.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) format.
- **PRs:** Fill in the PR template. Reference the issue. Keep diffs small.
