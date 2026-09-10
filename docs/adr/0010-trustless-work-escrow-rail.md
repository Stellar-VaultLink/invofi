# ADR-0010 — Trustless Work escrow rail for disbursements

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** @samjay8 (maintainer)
- **Related:** [docs/trustless-work-integration.md](../trustless-work-integration.md) · ADR-0008/0009 (Neon auth/authz — separate concern) · contracts repo `financing::accept_offer`

## Context

`accept_offer` moves the financed amount **directly** from lender → originator.
The originator receives funds with no delivery guarantee — the single riskiest
moment in the protocol and the #1 driver of lender losses in invoice financing.

Trustless Work (TW) provides audited escrow infrastructure on Stellar Soroban:
an escrow is a contract holding funds against **milestones** that must be
approved before a **release signer** pays the **receiver**. TW is USDC-native,
Runtime-Verification-audited, and SCF-funded — re-implementing escrow in Rust
would re-derive that audit burden for zero benefit.

## Decision

1. **API/SDK-level integration, not cross-contract calls.** InvoFi calls the
   TW REST API (Core API v2, single-release escrows) from `@invofi/sdk`; it
   never links against TW's contract. The contracts remain the system of
   record for financing state.
2. **USDC-only.** Escrowed flows require a trustline asset; XLM flows keep
   the direct-transfer path. This is a registry/config decision, not a code
   branch.
3. **Adapter pattern.** All TW calls live in one file
   (`invofi/apps/sdk/src/escrow.ts`). If TW's API evolves (their V2 shipped
   May 2026 — API drift is the top risk), exactly one file changes.
4. **Role mapping for disbursement escrows** (implemented in
   `mapToDeployPayload`):
   - `receiver` = originator (gets the financed amount)
   - `serviceProviders` = [originator] (reports the delivery milestone)
   - `approvers` = [platform, lender], `approvalsTarget: 1` — **either** can
     approve delivery, so a slow/absent platform can never strand the
     originator's funds
   - `releaseSigners` = [platform]; `disputeResolvers` = [platform];
     `admin` = platform (must be distinct from other roles per TW spec)
5. **Feature flag.** The rail is dark unless
   `NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY` (flag) and
   `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS` are set. The real key
   (`TW_ESCROW_API_KEY`) is server-only, injected by `/api/escrow/*` — it is
   never bundled into client JS.
6. **Best-effort leg.** Escrow deploy+fund runs *after* a successful
   `accept_offer` and never rolls it back: financing is already final
   on-chain; a failed escrow leg is retryable without protocol impact.

## Consequences

**Positive**
- Lender risk becomes structural: funds release only after delivery
  verification, via audited infrastructure.
- Zero new runtime dependencies (typed `fetch` adapter, no axios/React SDK).
- The escrow contract id is persisted per offer (`escrow_contract_id`,
  migration 003) so every offer's escrow is traceable on the Escrow Viewer.

**Negative / follow-ups**
- The API key must be requested manually in the TW Backoffice dApp
  (wallet-signed; key shown once) — documented in
  `docs/trustless-work-integration.md` §"Getting access".
- Milestone approval adds a UX step for USDC offers (originator's customer /
  platform confirms delivery). Milestone-approval UI is a follow-up issue.
- Repayment escrow, dispute routing through TW, and insurance payout via
  escrow remain Phase-2b (Epic 4 in the integration doc).

## Out of scope

- Mainnet escrow flows (TW mainnet keys are post-audit; revisit later).
- Multi-release escrows (single-release covers the disbursement shape).
- Any change to the Soroban contracts.
