# Roadmap

---

## What is Built (v0.1 — Testnet MVP)

### Smart Contract

- [x] Invoice registration on-chain (`register_invoice`)
- [x] Invoice retrieval (`get_invoice`)
- [x] Financing offer creation (`create_offer`)
- [x] Offer acceptance — invoice becomes Financed (`accept_offer`)
- [x] Offer rejection (`reject_offer`)
- [x] Invoice repayment — full lifecycle closes (`repay_invoice`)
- [x] Overdue marking (`mark_overdue`)
- [x] Access control via `require_auth()` on all mutations
- [x] 9 passing contract tests covering all functions and edge cases

### Frontend

- [x] Landing page with protocol description and CTA
- [x] Email + password registration and login (via Supabase)
- [x] Freighter wallet connection
- [x] Role-based registration (Business / Lender)
- [x] Business dashboard with invoice list
- [x] Invoice creation form (registers on-chain + mirrors to Supabase)
- [x] Invoice detail page with offer management
- [x] Lender marketplace (browse Pending invoices)
- [x] Lender portfolio tracker
- [x] Accept and reject offer flows
- [x] Toast notification system
- [x] Responsive Navbar with wallet state

### Infrastructure and Docs

- [x] Next.js 14 App Router frontend configured for Vercel
- [x] Supabase schema with Row Level Security
- [x] Vercel deployment config (`vercel.json`)
- [x] Environment variable templates
- [x] Stellar testnet contract deployment instructions
- [x] Full documentation in `docs/`
- [x] GitHub community files (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, LICENSE)
- [x] GitHub issue and PR templates

---

## v0.2 — Token Integration

The MVP records invoice financing as on-chain state but does not move real tokens. v0.2 adds actual fund movement.

- [ ] **USDC on-chain transfers during offer acceptance** — lender transfers USDC to originator atomically with the `accept_offer` call using Stellar's `payment` operation
- [ ] **Repayment with token transfer** — originator pays USDC back to lender atomically with `repay_invoice`
- [ ] **Escrow contract** — holds lender funds between acceptance and repayment, distributing principal + interest on repayment
- [ ] **USDC balance display** — show USDC balance in the Dashboard wallet panel (needs USDC issuer configured)

---

## v0.3 — Trust and Verification

- [ ] **Oracle-based invoice verification** — integrate a Stellar oracle to verify that an invoice is real before it can be listed (prevents fraud)
- [ ] **Document storage** — allow businesses to attach PDF invoice documents (stored on IPFS, hash recorded on-chain)
- [ ] **Originator reputation score** — track repayment history on-chain and display a simple score to lenders

---

## v0.4 — Production Readiness

- [ ] **KYC/AML with SEP-12** — integrate Stellar's SEP-12 protocol for identity verification, required for regulated markets
- [ ] **Multi-signature treasury** — require multi-sig for admin operations
- [ ] **Contract upgradeability with timelock** — allow contract logic updates with a mandatory delay, giving users time to exit before changes take effect
- [ ] **Rate limiting** — protect the frontend and Supabase from abuse
- [ ] **Error monitoring** — integrate Sentry for frontend error tracking

---

## v1.0 — Mainnet Launch

- [ ] Mainnet contract deployment
- [ ] Security audit of the Soroban contract
- [ ] Penetration test of the frontend
- [ ] Legal review for supported jurisdictions
- [ ] Mainnet documentation and user guides
- [ ] Protocol governance mechanism

---

## Future Ideas

These are not committed to a version yet but are worth exploring:

- **Mobile app** — React Native frontend using the same contract
- **Invoice NFTs** — mint tokenized invoices as SEP-39 assets on Stellar
- **Secondary market** — allow lenders to sell their financing positions before repayment
- **Batch financing** — allow multiple lenders to pool and finance a single large invoice
- **Automated yield distribution** — smart contract distributes interest directly without a manual repay call
