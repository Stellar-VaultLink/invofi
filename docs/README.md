# InvoFi Documentation

Welcome to the official InvoFi documentation. InvoFi is a decentralized invoice financing protocol built on Stellar Soroban. These docs cover everything from high-level concepts to line-by-line technical references.

---

## Navigation

| Section | What you'll find |
| --- | --- |
| [Introduction](./01-introduction.md) | What InvoFi is, the problem it solves, how it works |
| [Architecture](./02-architecture.md) | System design, component diagram, data flow |
| [Smart Contract](./03-smart-contract.md) | Full contract API, data types, lifecycle diagrams |
| [Frontend Guide](./04-frontend.md) | Page-by-page walkthrough, component structure |
| [Authentication](./05-authentication.md) | Email/password and Freighter wallet auth flows |
| [Supabase Setup](./06-supabase.md) | Database schema, RLS policies, Supabase configuration |
| [Deployment](./07-deployment.md) | Step-by-step guide to deploying contracts and frontend |
| [Environment Variables](./08-environment-variables.md) | Every variable explained |
| [Contributing](./09-contributing.md) | How to set up a dev environment and submit PRs |
| [Roadmap](./10-roadmap.md) | What's built, what's coming, what's planned for v2 |

---

## Quick Start

```bash
git clone https://github.com/Stellar-VaultLink/invofi.git
cd invofi/invofi/apps/frontend
cp .env.local.example .env.local
npm install && npm run dev
```

See [Deployment](./07-deployment.md) for a complete setup guide.

---

## Getting Help

- [GitHub Issues](https://github.com/Stellar-VaultLink/invofi/issues) — bug reports and feature requests
- [GitHub Discussions](https://github.com/Stellar-VaultLink/invofi/discussions) — questions and ideas
