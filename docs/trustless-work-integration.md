# Trustless Work Escrow Integration — Status & Reference

> **Status:** 🟢 **LIVE on testnet** — core shipped, API key issued & active on Vercel (server-only), production deployed · **Owner:** @samjay8 · **Decision record:** [ADR-0010](./adr/0010-trustless-work-escrow-rail.md)
> **Companion docs:** [Bug report to TW](./trustless-work-bug-report.md) (standalone, shareable) · [ADR-0010](./adr/0010-trustless-work-escrow-rail.md)
> **TW links:** [Org](https://github.com/Trustless-Work) · [Smart escrow contract](https://github.com/Trustless-Work/trustlesswork-smart-contract-stellar) · [API docs](https://docs.trustlesswork.com) · [Backoffice (key issuance)](https://dapp.trustlesswork.com)

---

## Part 0 — Current status (read this first, updated 2026-09-12)

### What is DONE and merged

| Item | Where | State |
|---|---|---|
| **Typed TW client in `@invofi/sdk`** — `createTrustlessWorkClient` (deploy/fund/milestone builds, sign+submit, read-model helpers with indexer-lag retry, **direct-invoke `submitDirectRelease` workaround**, `escrowViewerUrl`), InvoFi→TW role mapping, `TrustlessWorkError` | `invofi/apps/sdk/src/escrow.ts` | ✅ **368/368 SDK tests green** |
| **Server proxy** `/api/escrow/[action]` — injects the server-only key, forwards build/submit/resolve calls; SSRF-guard; never signs | `invofi/apps/frontend/src/app/api/escrow/[action]/route.ts` | ✅ merged |
| **Frontend binding** — `lib/escrow.ts`: feature-flagged, USDC-only, wallet signer lazy-imported; milestone helpers `approveMilestone` / `confirmDelivery` / `releaseEscrowDirect` + `parseEscrowStatus` | `invofi/apps/frontend/src/lib/escrow.ts` | ✅ merged |
| **Milestone-approval UI (#381, Epic 3.2)** — per-offer escrow panel in `OfferList`: awaiting delivery → awaiting approval → releasable → released / disputed, Escrow Viewer link, release tx hash; role-gated actions; i18n in all 12 locales | `invofi/apps/frontend/src/components/invoices/OfferList.tsx` | ✅ merged (`fbe9db1`), frontend 591/591 tests |
| **`accept_offer` wiring** — after a successful accept, best-effort deploy+fund of the disbursement escrow; failure never rolls back the accepted offer; `financing_offers.escrow_contract_id` persisted (migration 003) | `OfferList.tsx` + `migrations/003_escrow.sql` | ✅ merged (`316a90b6`) |
| **Env vars on Vercel** (`invofi` project, production+preview): `TW_ESCROW_API_KEY` (server-only, Sensitive), `NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY` (`set` — an on/off flag, **not** the key), `NEXT_PUBLIC_TRUSTLESS_WORK_ENV=testnet`, `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS=GBDD…EVZR`, `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_FEE=0.5` | Vercel | ✅ set 2026-09-08/09 |
| **ADR-0010** — escrow rail decision (API-level, USDC-only, adapter pattern, role mapping, dark-launch flag) | `docs/adr/0010-trustless-work-escrow-rail.md` | ✅ Accepted |

### End-to-end verification (2026-09-09, escrow 002) — canonical evidence

Full lifecycle executed against the live API + testnet with real balances
moving. Run used **VBUC** (a testnet-only SAC asset minted for verification —
the rail is currency-agnostic; production flows use USDC unchanged).

**Escrow** `CC2OKXVNUSX3AX5VM2FRSXA4ZV2YMOAKMR77BWQBARGOQ4WNO2T4SVOS`
(engagement `invofi-e2e-escrow-002-o1`) · 250 units · 0.5% platform fee ·
[Stellar Expert](https://stellar.expert/explorer/testnet/contract/CC2OKXVNUSX3AX5VM2FRSXA4ZV2YMOAKMR77BWQBARGOQ4WNO2T4SVOS)

| Step | Signer | Tx hash |
|---|---|---|
| VBUC SAC deploy | issuer | `5a19d9281cfdb3c092e9730a4a21bdef66df3bfd7b77209545d674de806a07b9` |
| Escrow deploy | lender | `df8b10afad912c692403f6133daefe5178a6775cca99f0525987aee374fe721a` |
| Fund escrow (250 units) | lender | `4a8c67ae7de13caf085abc10f0cf1297d47495bfd65f913f0fdf2c261d42a9d9` |
| Approve milestone | platform | `0f45d500166da477c6f1ee2861da8e8f75d5e4493f029130558f24b6199a569d` |
| Milestone → completed | originator | `3f9fab46e4acf1b64ba1276f9c5d722e4251fac280af4b0beb3a5174c01271eb` |
| **Release funds** | platform | `d3c0f77b542dea14f851155701391c0e81ab1f1b5fdb7279db5b414ddef86fb0` |

**Balance proof (Horizon):** lender 1000 → **750** VBUC · originator 500 →
**748** (+248 = 250 − 0.5% fee) · platform +**1.25** fee · escrow drained to 0
· on-chain flags after release: `released: true, disputed: false` ·
`tw_release` event published.

Re-verification runs (escrows **003** on 09-10, **004** on 09-12) are recorded
in the [bug report](./trustless-work-bug-report.md); repro script:
`invofi/scripts/tw-retest.ts` (`npm run tw:retest`).

### Role note (verified on-chain, drives the UI)

The milestone *status change* belongs to the **serviceProvider** — the
originator confirms delivery — while *approval + release* belong to the
**approver / releaseSigner** — the platform. (An earlier draft assumed the
platform does both; TW's contract role model says otherwise.)

### Live-verified API contract (what the SDK implements)

> The original desk research targeted the **v2 beta** surface. A real key
> authenticates **only on the current production API** — this is the
> authoritative contract, verified with live calls 2026-09-08/09.

- **Testnet base URL:** `https://dev.api.trustlesswork.com` (`beta.api…` rejects current keys; `api.trustlesswork.com` is mainnet).
- **Auth:** `x-api-key: <id>.<secret>` per request; missing/invalid key → RFC 9457 Problem Details (`AUTH_CREDENTIAL_MISSING` / `AUTH_INVALID_CREDENTIAL`).
- **Swagger (live):** `https://dev.api.trustlesswork.com/docs-json` — 38 paths, the authoritative route list.
- **Deploy:** `POST /deployer/single-release` — `{ signer, engagementId, title, description, roles: { approver, serviceProvider, platformAddress, releaseSigner, disputeResolver, receiver }, amount, platformFee, milestones: [{ description }], trustline: { address, symbol } }` → **HTTP 201** `{ unsignedTransaction }`.
- **Fund:** `POST /escrow/single-release/fund-escrow` — `{ contractId, signer, amount }`.
- **Milestones:** `POST /escrow/single-release/approve-milestone` (approver) and `POST /escrow/single-release/change-milestone-status` (serviceProvider; `newStatus` + `newEvidence`).
- **Release:** `POST /escrow/single-release/release-funds` — `{ contractId, releaseSigner }` ⚠️ currently bugged, see Part 6.
- **Submit:** `POST /helper/send-transaction` — `{ signedXdr }`.
- **Reads:** `GET /helper/get-escrow-by-contract-ids?contractIds[]=…&validateOnChain=true`, `GET /helper/get-escrows-by-signer?signer=…`. The escrow's on-chain contract id is resolved from the read model **after** deploy (never returned at build time) — the SDK's `resolveContractId` retries with backoff.

### Findings for integrators (from three live e2e runs)

1. **Trustline `address` must be the asset ISSUER account (G…), not the SAC contract (C…).** The API validates it as a G-address and resolves issuer → SAC itself. A C… address passes deploy validation but funding fails on-chain with `Storage, MissingValue`.
2. **The asset's Stellar Asset Contract must be deployed** before the escrow can fund (`stellar contract asset deploy`). USDC on testnet already has one.
3. **Release requires TWO milestone steps:** `approve-milestone` (approver) **and** `change-milestone-status` → `completed` with evidence (serviceProvider). Approve alone leaves `status: pending` and release stays blocked.
4. ⚠️ **`release-funds` build endpoint mis-reports "Escrow already in dispute"** for provably releasable escrows — reproduced **three times** on independent escrows (09-09, 09-10, 09-12), including once with fully healthy infra. Workaround: direct on-chain `release_funds(release_signer, trustless_work_address = contractBaseId)`. See Part 6.
5. **The read model is eventually consistent.** Observed 40+ min indexing lag once (09-10, likely infra-related); 2s on 09-12. Fall back to the authoritative on-chain `get_escrow` read when the indexer lags.
6. ⚠️ **Read-model flag sync is unreliable:** released escrows can keep showing `released: false` while `balance` correctly drops to 0 (escrow 002 wrong since 09-09; 004 same on 09-12). Don't key release UI state off the flags alone.

### Meeting brief (TL;DR for TW conversations)

- **Who we are:** InvoFi — open-source invoice-financing protocol on Stellar Soroban; 5 contracts (registry / financing / repayment / insurance / reputation), real USDC/XLM testnet transfers, public stats dashboard, SCF-path project.
- **What we built against your API:** a typed zero-dependency single-release adapter in `@invofi/sdk` on the live production API, an InvoFi→TW role mapping (receiver = originator, approver / releaseSigner / disputeResolver = platform), a server-side key proxy, and the accept-offer disbursement flow behind a feature flag — all CI-green, plus a scripted e2e repro (`tw-retest.ts`).
- **Open technical asks:** (1) ~~fix the `release-funds` build endpoint~~ — **resolved 09-13: works on USDC; the pre-check is asset-restricted** (our A/B: USDC 201, custom SAC 400); remaining question for TW: is non-USDC asset support intentional-but-buggy or unsupported?; (2) ~~fix read-model flag sync~~ — flags synced correctly on the USDC run; verify it stays consistent; (3) confirm mainnet API-key gating process post-audit.
- **Design question for v1:** the sole-approver model means the platform is a single point in the release path (deliberate, documented in ADR-0010 — an absent external lender can never strand an originator's funds). If v1 ever supports multiple approvers, we'd add the lender as a second approver.
- **In due course:** reference-integration listing (alongside KindFi / SafeTrust / Boundless) and cross-ecosystem visibility — both projects are SCF-path and bounty-driven.

---

## Part 1 — About Trustless Work (background)

**Trustless Work** is Escrow-as-a-Service on Stellar Soroban, USDC-first. Core question: *"What must happen before funds move?"* — multiple parties, milestones, approvals, or release conditions are modeled with on-chain escrow primitives. Every escrow is defined by a JSON-logic file mapping real-world responsibilities to on-chain roles; every action emits structured on-chain events.

### Roles (v1, separation of duties)

| Role | Responsibility |
|---|---|
| **Issuer / signer** | Deploys the escrow (the funder in InvoFi's mapping) |
| **Service Provider** | Marks milestones ("work delivered") |
| **Approver** | Validates milestones |
| **Release Signer** | Executes payouts (payout and claim models) |
| **Receiver** | Collects funds |
| **Platform Address** | Manages fees |
| **Dispute Resolver** | Handles conflicts |

### Product surface

| Layer | What it is |
|---|---|
| **REST API** | Full lifecycle; returns **unsigned XDR** you sign client-side — the pattern InvoFi uses |
| **React SDK** `@trustless-work/escrow` | Typed hooks (React-Query-coupled — InvoFi uses a framework-agnostic fetch adapter instead) |
| **Blocks SDK** `@trustless-work/blocks` | Pre-built UI blocks + wallet connectivity |
| **Backoffice** | Key issuance, test flows |
| **Escrow Viewer** | On-chain escrow explorer (`viewer.trustlesswork.com`) |

### Credibility & fit

- Audited by **Runtime Verification** (Sep 2025); SCF-funded ($118K across 2 rounds), now in the **SCF Integration Track**; production traction (100k+ USDC processed, integrations incl. KindFi, SafeTrust, Boundless).
- **Complementary, not competing:** InvoFi owns the invoice/financing lifecycle; TW owns fund holding + conditional release. InvoFi is the financing protocol, TW the payment rail for the riskiest transfers.

---

## Part 2 — Integration architecture

InvoFi's protocol state stays in the five Soroban contracts. Trustless Work escrows are an **external payment rail** at the money-movement boundaries. Integration level: **API/SDK-level** — do not re-implement escrow in Rust; their contract is already audited and SCF-maintained.

### Integration Point 1 — Disbursement escrow on `accept_offer` (shipped)

**Before:** `accept_offer` transfers the financed amount directly lender → originator — no delivery guarantee, the #1 risk in invoice financing.
**Now (behind the env flag):** the financed amount enters a single-release escrow with one delivery milestone, released to the originator only after approval.

| Escrow role | InvoFi party |
|---|---|
| Funder / signer | Lender |
| Service Provider | Originator (confirms delivery) |
| Approver / Release Signer / Dispute Resolver / Platform | InvoFi platform |
| Receiver | Originator |

**Outcome:** unsecured → **delivery-verified** invoice financing — a structural reduction in lender risk.

### Integration Point 2 — Repayment escrow on `repay_invoice` (future)

Originator pre-funds principal + yield into escrow; the escrow releases to the lender at maturity. `repay_invoice` / `mark_overdue` then operate on escrow state instead of trusting payment.

### Integration Point 3 — Dispute resolution (future)

InvoFi's `Disputed` status routes to a TW escrow with the Dispute Resolver role — cleaner than extending InvoFi's own dispute logic.

### Integration Point 4 — Insurance payout routing (future)

Insurance-pool payout-on-default released through an escrow with the insurance contract as resolver — an audit trail on the highest-risk code path.

### Currency scope

**USDC-only initially** (TW is USDC-first). InvoFi's currency registry (Symbol → Address) makes this a registry/config decision, not a code branch. XLM flows keep the direct-transfer path.

---

## Part 3 — Phase-2 epics (status-tracked)

Labels follow the org convention (`trivial` / `medium` / `high-complexity` / `good-first-issue`).

### Epic 1 — Research & partnership — ✅ done

Key self-served via the Backoffice (2026-09-08); ADR written (0010); full testnet spike executed (2026-09-09/10/12).

### Epic 2 — SDK adapter — ✅ done (2026-09-08)

All TW calls sit behind **one adapter file** in `@invofi/sdk` (`src/escrow.ts`) so a TW API change touches one file, not the app. Zero npm dependencies — a typed `fetch` client against the Core API (the React SDK is React-Query-coupled and would fight our framework-agnostic SDK). Escrow↔invoice↔offer mapping: `engagementId = invofi-<invoice>-<offer>`, persisted in `financing_offers.escrow_contract_id`.

### Epic 3 — Disbursement escrow on `accept_offer` — core shipped

| # | Item | Labels | Status |
|---|---|---|---|
| 3.1 | On `accept_offer`, create + fund the escrow (lender signs) | `high-complexity` | ✅ done (`316a90b6`, best-effort, env-gated) |
| 3.2 | Milestone-approval step + release to originator | `high-complexity` | ✅ done (#381, `fbe9db1`) — **release now verified end-to-end via TW's API on USDC (09-13 A/B)** |
| 3.3 | Escrow status surface on invoice detail + portfolio | `medium` | ⬜ open (status step exists in the offer row; portfolio-wide surface not yet) |
| 3.4 | e2e: Playwright test for accept → escrow → approve → release on testnet | `medium` | ⬜ open (gated on the broader e2e-suite repair) |
| 3.5 | Docs: README architecture + GitBook with the escrow rail | `trivial`, `good-first-issue` | ✅ done |

### Epic 4 — Repayment escrow + disputes (Phase 2b)

| # | Item | Labels |
|---|---|---|
| 4.1 | Repayment escrow (originator pre-funds principal + yield; auto-release at maturity) | `high-complexity` |
| 4.2 | Route `raise_dispute` / `resolve_dispute` through an escrow with Dispute Resolver role | `high-complexity` |
| 4.3 | Insurance payout-on-default released through escrow (insurance as resolver) | `high-complexity` |
| 4.4 | Keeper: reconcile escrow events into the indexer aggregates | `medium` |

**Note:** Epic 4.4 is also gated on the indexer re-enable (#95) after the Neon migration.

---

## Part 4 — Risks & decisions (recorded in ADR-0010)

| Decision | Choice | Why |
|---|---|---|
| Integration level | **API/SDK-level**, not cross-contract Rust calls | Their contract is audited (Runtime Verification); re-implementing escrow in Rust re-derives that audit burden |
| Currency scope | **USDC-only** for escrowed flows | TW is USDC-first; XLM keeps the direct path — registry entry, not a code branch |
| Dependency management | All TW calls behind one adapter in `@invofi/sdk` | One file changes if their API evolves (V2 just shipped — API drift is the top risk) |
| Where the escrow id lives | Postgres mirror on the offer row + escrow status column | Frontend reads the mirror; contracts remain the system of record for financing state |
| Release path | **Direct on-chain `release_funds` until TW's release-build bug is fixed** (Part 6) | The workaround is typed, tested, and isolated in `submitDirectRelease`; switch back to the API path when TW ships the fix |

### Top risks

1. **API drift** — their V2 changed surfaces; pin versions, wrap in the adapter, re-verify on testnet before each release.
2. **Their network maturity** — confirm mainnet status + API-key gating before promising anything in public docs.
3. **UX friction** — milestone approval adds a step to `accept_offer`; must feel native (the originator gets a simple "confirm delivery" action), or adoption suffers.
4. **Sole approver** — the platform is a single point in the release path (deliberate for v1, see ADR-0010; revisit if TW adds multi-approver support).

---

## Part 5 — Partnership status

- **Contact established:** engaged with a TW core team member via Telegram (2026-09-12); the release-funds bug report is under active discussion (see Part 7). Their public Telegram group remains the fastest general channel.
- **API key:** self-served via the [Backoffice](https://dapp.trustlesswork.com) (wallet-signed ownership proof; key shown once, format `id.secret`). TW offered to inspect our API request logs for the release-bug triage; we offered to share the key privately if needed (not shared so far). If it is ever shared for debugging, **rotate it afterward**.
- **Outstanding asks:** release-funds fix; read-model flag sync fix; mainnet key-gating process; reference-integration listing in due course.

---

## Part 6 — Bug report & engagement with Trustless Work

> **Canonical, shareable copy:** [trustless-work-bug-report.md](./trustless-work-bug-report.md)
> (full repro steps, on-chain state proofs, and per-run evidence tables live
> there — this section tracks only status). Repro script:
> `invofi/scripts/tw-retest.ts` (`npm run tw:retest`).

**Timeline:**

| Date | Event |
|---|---|
| 2026-09-09 | **Reported:** `release-funds` build returns 400 "Escrow already in dispute" for a releasable escrow (escrow 002; report drafted same day) |
| 2026-09-10 | **Re-verified (2nd repro):** fresh escrow 003 through their own factory — same 400 twice; direct `release_funds` succeeded. Second defect same session: indexer missed a fresh deploy for 40+ min ("Escrow not found" from the API while the contract existed on-chain) |
| 2026-09-12 | **Re-verified (3rd repro) + TW engaged:** a TW core member asked if it's reproducible and suggested a recent backend/DB pause on their side. Escrow 004 driven **100% through the API path** — infra healthy (2s indexer lag, every build endpoint instant), release build **still** 400 twice; direct release moved funds correctly. **Pause theory ruled out for this bug.** Evidence shared with TW; repro script handed over |
| 2026-09-13 | **TW's release-signer hypothesis tested and refuted:** escrow 011 with fully distinct `releaseSigner` (buyer) and `disputeResolver` (keeper) wallets, schema-perfect payload — **same false 400**. The buyer-signed on-chain release succeeded instantly (receiver +248, platform fee paid). Also found: a **corrupted fund-escrow build** credited 250 VBUC to the signer instead of the escrow (tx `1b7ed1aa…`), and the release error message changed three times within an hour — their API was being redeployed mid-test |
| 2026-09-13 | **TW's token + trustline hypothesis also refuted:** escrow 012 ran the full API path with a distinct address per role and **every wallet trustlined + holding VBUC** (lender 500 / platform 7.5 / originator 1,988 / buyer 300 / keeper 300) — release build still 400 "already in dispute" while their own read model showed `disputed: false`. Buyer-signed direct release succeeded (`5f8699f2…`): receiver +248, platform +1.25. VBUC is a testnet-only SAC (issuer `GBG77OVP…`); TW's docs permit any issued asset with trustlines on every participant — all satisfied |
| 2026-09-13 | **ROOT CAUSE FOUND — the token.** Controlled A/B, minutes apart, identical roles/balances/API path: release build on **USDC → HTTP 201, full API-path release** (escrow 013, `CCR4WZRK…`); on **VBUC → 400 "already in dispute"** (escrow 014, `CAOYPJKU…`). Our earlier "refuted" call was wrong and is retracted — the TW member's token hypothesis was correct. InvoFi switched testnet verification to official testnet USDC (Circle issuer `GBBD47IF…`); the direct-invoke release workaround is now only a fallback, not a requirement |
| ✅ resolved | Release path fully green through TW's standard API on USDC; remaining TW ask narrowed to: is the release pre-check's asset restriction documented behavior for non-USDC tokens? |

**New sub-finding (09-12):** the read model updates `balance` but not the
`released`/`disputed` flags after an on-chain release (004: `released: false,
balance: 0`; 002 wrong since 09-09) — plausibly the same stale-flag state the
release pre-check keys on. Reported to TW alongside the repro.

**Escrow summary across the three runs:**

| Escrow | Engagement | Deployed | Release build | Direct release |
|---|---|---|---|---|
| `CC2OKXVN…SVOS` | `…002-o1` | 09-09 | 400 ×4 | ✅ `d3c0f77b…86fb0` |
| `CDNY5U5V…EMR3` | `…003-o1` | 09-10 | 400 ×2 | ✅ `5058b6f7…57f4` |
| `CD7G7S2R…MTB74` | `…004-o1` | 09-12 | 400 ×2 | ✅ `4d155c41…5716` |
| `CDBU3TDE…6LYF` | `…006-o1` | 09-12 | 400 (video'd) | ✅ `6324fd50…b5e4` |
| `CBYM6BIV…F2ZU` | `…011-o1` | 09-13 | 400 with **distinct releaseSigner/disputeResolver** | ✅ `dcf65068…3b9d` (buyer-signed) |

**What we've asked TW for:** (1) fix the release pre-build dispute check;
(2) confirm the intended milestone flow (approve + change-status → completed);
(3) a deploy-time guard or docs note for the issuer-vs-SAC trustline pitfall.
