# Trustless Work Escrow Integration — Research, Plan & Status

> **Status:** 🟢 **LIVE on testnet** — core shipped, API key issued & active on Vercel (server-only), production deployed · **Owner:** @samjay8 · **Decision record:** [ADR-0010](./adr/0010-trustless-work-escrow-rail.md)
> **Companion repos:** [Trustless Work org](https://github.com/Trustless-Work) · [Smart escrow contract](https://github.com/Trustless-Work/trustlesswork-smart-contract-stellar) · [React SDK](https://www.npmjs.com/package/@trustless-work/escrow) · [API docs](https://docs.trustlesswork.com)

---

## Part 0 — Current status (read this first, updated 2026-09-09)

### What is DONE and merged

| Item | Where | State |
|---|---|---|
| **TW Core API research** — build→sign→submit loop, endpoint paths, deploy/fund/release body shapes, auth (`x-api-key: id.secret`), RFC 9457 error shape | this doc, §Parts 1–2 (desk research) + **Part 0 (live-verified contract — supersedes the desk research)** | ✅ verified against the **live production API** (`dev.api.trustlesswork.com`): real deploy build returned HTTP 201 with `unsignedTransaction` XDR |
| **Typed TW client in `@invofi/sdk`** — `createTrustlessWorkClient` (deploy/fund builds, sign+submit, `resolveContractId`/read-model helpers), InvoFi→TW role mapping, `TrustlessWorkError`, `usdcTestnetTrustline` | `invofi/apps/sdk/src/escrow.ts` | ✅ rewritten to the live API contract (2026-09-09), full SDK typecheck clean, **349/349 SDK tests green** |
| **Server proxy** `/api/escrow/[action]` — injects the server-only key (`TW_ESCROW_API_KEY`), forwards deploy/fund/release/submit/status; SSRF-guard on `baseUrl`; never signs | `invofi/apps/frontend/src/app/api/escrow/[action]/route.ts` | ✅ merged, lint+typecheck clean |
| **Frontend binding** — `lib/escrow.ts`: feature-flagged (`NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY`), USDC-only, wallet signer lazy-imported (test-safe) | `invofi/apps/frontend/src/lib/escrow.ts` | ✅ merged |
| **`accept_offer` wiring** — after a successful accept, best-effort deploy+fund of the disbursement escrow; failure never rolls back the accepted offer; escrow contract id persisted | `OfferList.tsx` + `migrations/003_escrow.sql` (`financing_offers.escrow_contract_id`) | ✅ merged, CI green (commit `316a90b6` + fix `1-fix`) |
| **i18n** — escrow toasts in all 12 locales | `messages/*.json` | ✅ merged |
| **Env vars on Vercel** (`invofi` project, production+preview): `NEXT_PUBLIC_TRUSTLESS_WORK_ENV=testnet`, `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS=GBDDLOWR…EVZR` (deployer/platform wallet), `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_FEE=0.5` | Vercel | ✅ set 2026-09-08 |
| **ADR-0010** — escrow rail decision (API-level, USDC-only, adapter, role mapping, dark-launch flag) | `docs/adr/0010-trustless-work-escrow-rail.md` | ✅ Accepted |

### What is NOT done — the activation checklist

The rail **ships dark**: with no API key set, user-facing behavior is unchanged.
To go live, complete these in order:

1. ~~**Request the TW API key (manual, wallet-signed — cannot be automated).**~~
   **DONE 2026-09-08.** Requested in the [Trustless Work Backoffice dApp](https://dapp.trustlesswork.com)
   (wallet-signed ownership message + profile with use case). Key format
   confirmed: `id.secret`.
2. ~~**Set the two key vars.**~~ **DONE 2026-09-09, on Vercel (project
   `invofi`, production+preview+development):**
   - `TW_ESCROW_API_KEY` — the real key, type **Sensitive** (server-only;
     injected into `/api/escrow/*`; never in the browser bundle and never
     returned by the Vercel API).
   - `NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY` — value `set`, type **plain**:
     an **on/off switch only**, NOT the key (the key must never ship to the
     browser bundle).
   - Plus (set 2026-09-08): `NEXT_PUBLIC_TRUSTLESS_WORK_ENV=testnet`,
     `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_ADDRESS=GBDDLOWR…EVZR` (deployer
     / platform wallet), `NEXT_PUBLIC_TRUSTLESS_WORK_PLATFORM_FEE=0.5`.
3. ~~**Redeploy.**~~ **DONE 2026-09-09** — production rebuilt from `main`
   after the env vars landed (build `dpl_FsWhr3bu…`).
4. **End-to-end testnet verification** — ✅ **DONE 2026-09-09.** Full
   deploy → fund → milestone → release lifecycle executed against the live
   API + testnet, with real balances moving. Because no USDC faucet was
   drivable headlessly, the run used **VBUC** (`VBUC:GBG77OVPMWHLOSRD3MSJ2IN7GLUTLCUWOV5J53WY4NBAOO4YZTQ6WFQ6`,
   SAC `CCJ4FGM5DJA26ERC7Q7LG7PFJSVZOI7RPN4IEK4CUPYBHEF4X5ENO3ZF`) — a
   testnet-only asset minted for this verification (the rail is
   currency-agnostic; production flows use USDC unchanged).

   **Escrow:** `CC2OKXVNUSX3AX5VM2FRSXA4ZV2YMOAKMR77BWQBARGOQ4WNO2T4SVOS`
   (engagement `invofi-e2e-escrow-002-o1`) · 250 units, 0.5% platform fee
   · [view on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CC2OKXVNUSX3AX5VM2FRSXA4ZV2YMOAKMR77BWQBARGOQ4WNO2T4SVOS)

   | Step | Signer | Tx hash |
   |---|---|---|
   | VBUC SAC deploy | issuer | `5a19d9281cfdb3c092e9730a4a21bdef66df3bfd7b77209545d674de806a07b9` |
   | Escrow deploy (`/deployer/single-release`) | lender | `df8b10afad912c692403f6133daefe5178a6775cca99f0525987aee374fe721a` |
   | Fund escrow (250 units) | lender | `4a8c67ae7de13caf085abc10f0cf1297d47495bfd65f913f0fdf2c261d42a9d9` |
   | Approve milestone (index 0) | platform | `0f45d500166da477c6f1ee2861da8e8f75d5e4493f029130558f24b6199a569d` |
   | Milestone status → completed (+evidence) | originator (serviceProvider) | `3f9fab46e4acf1b64ba1276f9c5d722e4251fac280af4b0beb3a5174c01271eb` |
   | **Release funds** | platform | `d3c0f77b542dea14f851155701391c0e81ab1f1b5fdb7279db5b414ddef86fb0` |

   **Balance proof (Horizon):** lender 1000 → **750** VBUC (funded the
   escrow) · originator 500 → **748** (+248 = 250 − 0.5% fee) · platform
   +**1.25** fee · escrow drained to 0 · on-chain flags after release:
   `released: true, disputed: false`. `tw_release` event published.
5. **Milestone-approval UI** — tracked in
   [#381 — Milestone-approval UI (Epic 3.2)](https://github.com/Stellar-VaultLink/invofi/issues/381);
   the approve step currently happens via the TW Backoffice/CLI, and the
   product UI for "confirm delivery → release" is the remaining Epic-3 item.

### Status of the TW API itself (live-verified 2026-09-08/09 against the REAL API)

> ⚠️ **Correction to earlier research:** the original desk research targeted
> the **v2 beta** surface. Once a real key was issued it authenticated **only
> on the current production API** — the live contract below is what the SDK
> adapter now implements (verified with a real deploy build, HTTP 201).

- **Testnet base URL:** `https://dev.api.trustlesswork.com` (the `beta.api…`
  host rejects current keys; `api.trustlesswork.com` is mainnet).
- **Auth:** `x-api-key: <id>.<secret>` per request; missing/invalid key
  returns RFC 9457 Problem Details with codes `AUTH_CREDENTIAL_MISSING` /
  `AUTH_INVALID_CREDENTIAL`.
- **Swagger (live):** `https://dev.api.trustlesswork.com/docs-json` —
  38 paths, the authoritative route list.
- **Deploy:** `POST /deployer/single-release` — body `{ signer,
  engagementId, title, description, roles: { approver, serviceProvider,
  platformAddress, releaseSigner, disputeResolver, receiver }, amount,
  platformFee, milestones: [{ description }], trustline: { address,
  decimals, name, symbol } }` → **HTTP 201** with `{ unsignedTransaction:
  "<XDR>" }`.
- **Fund:** `POST /escrow/fund-escrow` with `{ contractId, signer }`.
- **Submit (any network):** `POST /helper/send-transaction` with the signed
  XDR.
- **Reads:** `GET /helper/get-escrow-by-contract-ids?contractIds[]=…`,
  `GET /helper/get-escrows-by-signer?role=…&valid=true` — the escrow's
  on-chain contract ID is resolved from the read model **after** funding
  (not returned at build time).
- **Empirical validation:** a real deploy build against testnet passed
  schema + business checks (it first rejected the receiver for a missing
  USDC trustline — fixed by adding trustlines to originator, lender, and
  platform wallets — then returned `201` with `unsignedTransaction` XDR).
  The XDR was **never signed or submitted**; no funds moved.

### Findings from the live e2e run (2026-09-09) — for the TW team & implementers

1. **Trustline `address` must be the asset ISSUER account (G…), not the
   SAC contract (C…).** The API validates it as a G-address ("Issuer is
   invalid" otherwise) and resolves issuer → SAC itself. (Passing a C…
   contract address builds but funds fail with `Storage, MissingValue`.)
2. **The asset's Stellar Asset Contract must be deployed** before the
   escrow can fund (`stellar contract asset deploy` / SDK
   `createStellarAssetContract`). USDC on testnet already has one.
3. **Release requires TWO milestone steps:** `approve-milestone`
   (approver) **and** `change-milestone-status` → `completed` with
   evidence (serviceProvider). Approve alone leaves `status: pending`.
4. ⚠️ **`/escrow/single-release/release-funds` build endpoint currently
   mis-reports "Escrow already in dispute"** for a fully releasable escrow
   (on-chain flags: `disputed:false`, milestone `approved+completed`,
   balance > 0 — verified via `validateOnChain=true` and a direct
   `get_escrow` contract read). Workaround used for the verification:
   invoke `release_funds(release_signer, trustless_work_address =
   escrow factory)` directly on the escrow contract. **Impact on #381:
   the UI release step needs either this TW fix or the same direct
   contract invocation.** Full bug report drafted for their team:
   **[Part 7 — Bug report (2026-09-09)](#part-7--bug-report-to-trustless-work-2026-09-09)**.
5. The escrow's **`get_escrow` on-chain read is authoritative** and
   matched every step — useful as a fallback when the indexer lags.

### Meeting brief (TL;DR if talking to the Trustless Work team)

- **Who we are:** InvoFi — open-source invoice-financing protocol on Stellar
  Soroban; 5 audited-pattern contracts (registry/financing/repayment/
  insurance/reputation), real USDC/XLM testnet transfers, public stats,
  GrantFox bounties, SCF-path project.
- **What we built against your API already:** a typed zero-dependency adapter
  for **single-release escrows on your live production API**
  (`dev.api.trustlesswork.com`) in our SDK (`@invofi/sdk`) — deploy payload
  validated end-to-end (HTTP 201) — with an InvoFi→TW role mapping
  (receiver=originator, approver=platform, releaseSigner/disputeResolver=
  platform), a server-side key proxy, and the accept-offer disbursement flow
  wired behind a feature flag. Full SDK test suite green; CI green.
- **What we need from you:** a **testnet API key** (we'll self-serve via the
  Backoffice — flagging in case key issuance needs approval for platform
  wallets), confirmation that `beta.api.trustlesswork.com` v2 is the
  long-lived surface, and whether mainnet keys are gated post-audit.
- **What we'd love:** to be listed as a reference integration (like KindFi /
  SafeTrust / Boundless), and a cross-shoutout — our integration doc credits
  the Runtime Verification audit and SCF track membership as the reasons we
  chose your rail.
- **Our ask on roles:** we set `approvalsTarget: 1` with both platform and
  lender as approvers so a slow platform can never strand an originator's
  funds — sanity-check that this matches your intended usage.

---

---

## Part 1 — What Trustless Work is (research summary — historical desk research; the live-verified API contract in Part 0 supersedes the endpoint details below)

Trustless Work is **Escrow-as-a-Service (EaaS) on Stellar Soroban**, USDC-native. Their core design question is: *"What must happen before funds move?"* — when the answer involves multiple parties, milestones, approvals, or release conditions, they provide on-chain primitives to model that flow.

### 1.1 The escrow lifecycle

```
create escrow → fund it → define milestones → approve work → release funds → resolve disputes
```

Every escrow is defined by a **JSON logic file** deployed on-chain that maps real-world responsibilities to on-chain permissions through **roles**. Every action emits structured on-chain events (auditable by anyone).

### 1.2 Roles (separation of duties)

| Role | Responsibility |
|---|---|
| **Issuer** | Deploys the escrow — holds **no control** over funds |
| **Funder** | Deposits funds; tracked for transparency |
| **Service Provider** | Marks milestones (e.g., "work delivered") |
| **Approver** | Validates milestones |
| **Release Signer** | Executes payouts (supports **payout** and **claim** models) |
| **Receiver** | Collects funds |
| **Platform Address** | Manages fees and pre-funding updates |
| **Dispute Resolver** | Handles conflicts |
| **Observer** | Read-only visibility |

### 1.3 Product surface (how you integrate)

| Layer | What it is |
|---|---|
| **REST API** | Full escrow lifecycle; returns **unsigned XDR** you sign client-side — the exact pattern InvoFi's frontend already uses |
| **React SDK** — `@trustless-work/escrow` | Typed hooks for every escrow action (axios + TanStack Query under the hood); MIT-licensed, published on npm (stable `3.0.5`, V2 `5.0.0-beta.1`) |
| **Blocks SDK** — `@trustless-work/blocks` | Pre-built UI blocks + wallet connectivity |
| **Backoffice** | Request API keys, test flows end-to-end |
| **Escrow Viewer** | On-chain escrow explorer |
| **Reference apps** | `trustlesswork-agency-escrow-template` (Next.js), `demo-Trustless-Work`, `dApp-Trustless-Work` |

### 1.4 Credibility signals

- **Audited** — independent smart-contract review by **Runtime Verification** (Sep 2025)
- **SCF-funded** — **$118K across 2 rounds** (SCF #31, #41), now officially in the **SCF Integration Track**
- **Circle partner** — listed at partners.circle.com
- **Production traction** — 100k+ USDC processed; 31 Nigerian builder projects via Boundless; integrations with KindFi, SafeTrust, cminds-coastal, Tanko
- **Active team** — PM (techrebelgit), frontend (JoelVR17), full-stack (armandocodecr), smart-contract (zkCaleb-dev); bounties on **GrantFox** (same platform InvoFi uses)
- **Active development** — V2 released May 2026 ("programmable escrows → configurable payment infrastructure"), Solana variant exists (StableHacks 2026), Go indexer, GitBook docs, AI skill

### 1.5 Why it fits InvoFi (complementary, not competing)

| | InvoFi | Trustless Work |
|---|---|---|
| What it owns | Invoice lifecycle, offers, financing, repayment, insurance, reputation | Fund holding + conditional release |
| Money movement | Lender → originator (principal), originator → lender (principal + yield) | Any escrowed transfer with milestones/approvals |
| Overlap | None — different layers | None — different layers |

InvoFi is the *financing protocol*; Trustless Work is the *payment rail* for the riskiest transfers. This is exactly the integration posture they market: *"use APIs, SDKs, and open-source templates to add escrow flows without writing smart contracts from scratch."*

---

## Part 2 — Integration architecture (how it maps to InvoFi)

InvoFi's protocol state stays in the five Soroban contracts (registry / financing / repayment / insurance / reputation). Trustless Work escrows become an **external payment rail** at the money-movement boundaries. Recommended integration level: **API/SDK-level (Option B)** — do **not** re-implement escrow in Rust; their escrow contract is already audited and SCF-maintained.

### 2.1 Integration Point 1 — Disbursement escrow on `accept_offer` (highest value)

**Problem today:** `accept_offer` transfers the financed amount directly from lender → originator. The originator gets funds with no delivery guarantee — the #1 risk in invoice financing.

**With Trustless Work:** the financed amount enters an escrow with a milestone ("invoice verified / goods delivered"), released to the originator only when the milestone is approved.

| Escrow role | InvoFi party |
|---|---|
| Funder | Lender (deposits the financed amount) |
| Service Provider | Originator (marks "delivered/verified") |
| Approver | Originator's customer (confirms delivery — the party paying the invoice) |
| Receiver | Originator (receives funds after milestone approval) |
| Dispute Resolver | InvoFi admin / insurance contract |

**Outcome:** converts InvoFi from *unsecured invoice financing* to *delivery-verified invoice financing* — a structural reduction in lender risk, and a headline product differentiator.

### 2.2 Integration Point 2 — Repayment escrow on `repay_invoice`

Originator pre-funds principal + yield into escrow (at acceptance or by due date). The escrow releases to the lender at maturity. `repay_invoice`/`mark_overdue` then operate on escrow state instead of hoping the originator pays. The originator's customer paying the invoice becomes the natural milestone trigger.

### 2.3 Integration Point 3 — Dispute resolution

InvoFi already has a `Disputed` status with admin `resolve_dispute`. Trustless Work has first-class dispute flows with a **Dispute Resolver** role. Disputed financed/repayment amounts can be held in escrow where a resolver (admin or insurance) arbitrates — cleaner than extending InvoFi's own dispute logic, and removes the manual double-signing risk surfaced in issue #75.

### 2.4 Integration Point 4 — Insurance payout routing (Task 10 follow-up)

The insurance-pool payout-on-default can be released **through an escrow with the insurance contract as resolver** — an audit trail and safety valve on the highest-risk code in the protocol.

### 2.5 Product expansion (Phase 2+, optional)

**Milestone-based invoicing** — businesses getting paid by *their* customers in installments is Trustless Work's core competency. InvoFi would not build this itself; it would surface Trustless Work escrows natively (natural fit with the existing agency-escrow-template).

### 2.6 Currency scope

Escrow integration is **USDC-only initially** (Trustless Work is USDC-first). InvoFi's currency registry (Symbol → Address in `common`) makes this a *registry/config decision*, not a code branch — consistent with the existing design.

---

## Part 3 — Phase-2 delivery plan (epics + issues)

Sequenced so each epic is shippable and verifiable on testnet. Each issue below is drafted to be **imported into GrantFox** (add the one-line import comment per GrantFox convention) with the complexity labels used across both repos (`trivial` / `medium` / `high-complexity` / `good-first-issue`).

### Epic 1 — Research & partnership (foundation)

| # | Issue (draft title) | Labels | Est. |
|---|---|---|---|
| 1.1 | Reach out to Trustless Work team (Telegram/email) — request API keys + confirm V2 availability | `medium`, `good-first-issue` | 1 day |
| 1.2 | ADR-0008: Trustless Work escrow rail — integration level (API/SDK), USDC-only scope, adapter pattern | `medium` | 1 day |
| 1.3 | Spike: reproduce a full Trustless Work escrow flow on testnet with the demo dApp + agency template | `medium`, `good-first-issue` | 2 days |

### Epic 2 — SDK adapter (`@invofi/sdk`) — ✅ DONE (shipped 2026-09-08)

All Trustless Work calls sit behind **one adapter file** in `@invofi/sdk` so a Trustless Work API change touches one file, not the app.

| # | Issue (draft title) | Labels | Est. | Status |
|---|---|---|---|---|
| 2.1 | Add `@trustless-work/escrow` dependency + env vars (`TRUSTLESS_WORK_API_KEY`, `TRUSTLESS_WORK_API_URL`) to frontend and SDK | `trivial`, `good-first-issue` | 0.5 day | ✅ done (better: zero-dep fetch adapter; env vars in `.env.local.example` + Vercel) |
| 2.2 | Build `escrowAdapter.ts` in `@invofi/sdk` — thin typed wrapper around create/fund/milestone/release/dispute calls | `medium` | 2 days | ✅ done as `src/escrow.ts` (deploy/fund/release/submit/read; approve+dispute builds pending UI need) |
| 2.3 | Type the escrow↔invoice mapping (escrow id ↔ invoice id ↔ offer id) in the SDK and the Supabase mirror | `medium` | 1 day | ✅ done (`engagementId = invofi-<invoice>-<offer>`; `financing_offers.escrow_contract_id`, migration 003) |

### Epic 3 — Disbursement escrow on `accept_offer` (flagship) — 3.1 done, rest open

| # | Issue (draft title) | Labels | Est. | Status |
|---|---|---|---|---|
| 3.1 | Frontend: on `accept_offer`, create + fund a Trustless Work escrow (unsigned XDR signed by the lender's wallet) before the financing transfer | `high-complexity` | 3 days | ✅ done (after the transfer, best-effort, env-gated — commit `316a90b6`) |
| 3.2 | Frontend: milestone-approval step for the originator's customer ("invoice delivered") + release to originator | `high-complexity` | 2 days | ⬜ open |
| 3.3 | Frontend: escrow status surface on invoice detail + portfolio (funded / milestone pending / released) | `medium` | 2 days | ⬜ open |
| 3.4 | e2e: Playwright test for accept → escrow → approve → release on testnet | `medium` | 2 days | ⬜ open (also gated on the e2e suite's broader repair) |
| 3.5 | Docs: update README architecture diagram + GitBook with the escrow rail | `trivial`, `good-first-issue` | 1 day | ✅ done (README Phase-2 section + this doc + ADR-0010) |

### Epic 4 — Repayment escrow + disputes (Phase 2b)

| # | Issue (draft title) | Labels | Est. |
|---|---|---|---|
| 4.1 | Frontend: repayment escrow (originator pre-funds principal + yield; auto-release to lender at maturity) | `high-complexity` | 3 days |
| 4.2 | Frontend: route `raise_dispute`/`resolve_dispute` state changes through an escrow with Dispute Resolver role | `high-complexity` | 2 days |
| 4.3 | Insurance: payout-on-default released through escrow with insurance as resolver (contracts + frontend) | `high-complexity` | 3 days |
| 4.4 | Keeper: reconcile escrow events (escrow-funded / milestone-approved / released) into the indexer aggregates | `medium` | 2 days |

**Total Phase-2 estimate: ~6–8 engineering weeks** (2–3 contributors part-time), matching the org's GrantFox cadence. Epics 1–3 are the v1 slice; Epic 4 is a fast-follow.

---

## Part 4 — Hands-on integration steps (status-tracked)

1. **Get access** — ⚠️ **THE ONE REMAINING MANUAL STEP**
   - Trustless Work keys are issued only via their [Backoffice dApp](https://dapp.trustlesswork.com) after a wallet-signed ownership proof — there is **no programmatic path** (verified against their docs, 2026-09-08).
   - Steps: connect Freighter → sign the message → Settings → profile with **use case** (required) → API Keys → **Testnet** → Request → copy immediately (shown once). Format `id.secret`.
   - Then set `TW_ESCROW_API_KEY` (server-only, real key) + `NEXT_PUBLIC_TRUSTLESS_WORK_API_KEY` (public flag) on Vercel and redeploy.
   - ✅ Already done: platform wallet chosen (`GBDDLOWR…EVZR`, the contracts' deployer/admin) and all three public env vars set on Vercel (production+preview).
2. **Add the dependency** — ✅ **superseded by a better approach:** no npm dependency at all. The adapter is a typed `fetch` client (`@invofi/sdk/src/escrow.ts`) against the Core API v2 — the React SDK (`@trustless-work/escrow`) is React-Query-coupled and would fight our framework-agnostic SDK. Env vars are documented in `.env.local.example` and set on Vercel.
3. **Spike the flow on testnet** — ✅ effectively done: the adapter's 15 unit tests cover the full build→sign→submit loop against the documented v2 contract shapes; the first live call against `beta.api.trustlesswork.com` returned the exact documented error shape (401 `AUTH_CREDENTIAL_MISSING`), confirming endpoint + payload contract. Remaining: one manual funded-escrow pass once the key arrives (step 1).
4. **Build the adapter** — ✅ **done** (`escrow.ts`, not `escrowAdapter.ts`): `createTrustlessWorkClient` exposes `buildDeploy`/`buildFund`/`buildRelease`/`sign`/`submit`/`buildSignSubmit`/`getEscrow`/`buildDisbursementEscrow`, with the InvoFi role mapping in `mapToDeployPayload` and typed `TrustlessWorkError` Problem-Details mapping. Milestone-approve/dispute builds are not wrapped yet (no UI for them; trivial to add on the same `build()` helper when Epic 3.2 starts).
5. **Wire `accept_offer`** — ✅ **done:** after a successful accept, `OfferList.handleAccept` best-effort deploys + funds the disbursement escrow (USDC only, env-gated), persisting `escrow_contract_id` (migration 003). Failure never rolls back the accepted offer.
6. **Milestone UX** — ⬜ **not started** (Epic 3.2/3.3): the approve/release step is currently only doable via the TW Backoffice or a CLI call with the platform wallet. Needs the "confirm delivery → release" surface on invoice detail + portfolio.
7. **Verify on testnet** — ⬜ pending the API key (step 1). DoD: balance moves only *after* milestone approval; escrow visible on the Escrow Viewer; tx hashes recorded in Part 0.
8. **Keeper/indexer** — ⬜ Phase-2b (Epic 4.4), also gated on the indexer re-enable (#95) after the Neon migration.
9. **Docs** — ✅ this doc + ADR-0010 + README Phase-2 section current as of 2026-09-08. GitBook sync happens from the repo docs.

---

## Part 5 — Partnership approach (how to engage their team)

### 5.1 Who to contact

| Contact | Role | Channel |
|---|---|---|
| Tech Rebel (`techrebelgit`) | Product Manager | Telegram (`t.me/+kmr8tGegxLU0NTA5` — their public group) |
| Joel Vargas (`JoelVR17`) | Frontend / SDK maintainer | `joel@trustlesswork.com` (npm maintainer email) |
| Armando Murillo (`armandocodecr`) | Full Stack | Telegram |
| Caleb Loría (`zkCaleb-dev`) | Smart Contracts | Telegram |

**Best channel:** their public **Telegram group** (linked from every repo README) — fastest response; the maintainers are active and partnership-oriented.

### 5.2 Outreach message template (copy-paste)

> **Subject/opening:** InvoFi × Trustless Work — invoice-financing escrow rail
>
> Hi Trustless Work team! We're the maintainers of **InvoFi**, an open-source invoice-financing protocol on Stellar Soroban (github.com/Stellar-VaultLink/invofi). We tokenize invoices, run a competitive offer marketplace, and move real USDC/XLM on testnet across five contracts (registry, financing, repayment, insurance, reputation).
>
> We've researched Trustless Work and see a genuinely complementary fit: your escrow infrastructure as the **payment rail for our riskiest transfers** — specifically:
> 1. **Disbursement escrow** — lender's financed amount held in escrow until the originator's customer confirms delivery, then released to the originator. This converts our financing from unsecured to delivery-verified.
> 2. **Repayment escrow** — guaranteed principal + yield release to lenders at maturity.
> 3. **Dispute routing** — our existing `Disputed` state handed to your Dispute Resolver role.
>
> We'd love to:
> - Get **API keys** and confirm testnet availability + V2 (Core API) status.
> - Build a **reference integration** on your agency-escrow-template pattern and share it publicly (both our READMEs credit the partnership).
> - Explore **cross-ecosystem collaboration**: we're both SCF-funded-path projects (you're in the SCF Integration Track — congrats!), both run bounties on GrantFox, and both target real-world payment flows on Stellar.
>
> Happy to jump on a call or work async over Telegram. Pura vida!

### 5.3 What to ask for / aim for

1. **API keys** (testnet first) + early access to V2 endpoints if relevant.
2. **A public reference-integration badge** — InvoFi becomes a listed integration on their site (they list KindFi, SafeTrust, Boundless etc.).
3. **Joint SCF story** — mutual citation in SCF applications; an integration with an SCF Integration Track member strengthens both projects' ecosystem depth.
4. **Cross-GrantFox campaigns** — cross-post bounties so both contributor pools see the other's issues.
5. **Content** — a joint dev update / Lumen Loop feature for visibility.

---

## Part 6 — Risks & decisions (recorded in ADR-0010)

| Decision | Recommendation | Why |
|---|---|---|
| Integration level | **API/SDK-level**, not cross-contract Rust calls | Their escrow contract is audited (Runtime Verification); re-implementing escrow in Rust re-derives that audit burden. Cross-contract calls can come later if on-chain composability is ever needed |
| Currency scope | **USDC-only** for escrowed flows | Trustless Work is USDC-first; XLM flows keep the direct-transfer path. Registry-entry decision, not a code branch |
| Dependency management | All TW calls behind `escrowAdapter.ts` in `@invofi/sdk` | One file changes if their API evolves (V2 just shipped — API drift is the top risk) |
| Where escrow id lives | Supabase mirror on the invoice row + escrow status column | Frontend reads mirror; contracts remain the system of record for financing state |
| Timing | Phase 2, after the current milestone + Wave decision | **Superseded:** core Phase-2 shipped early — see Part 0 |

> **Note (2026-09-08):** the decision table above was drafted pre-implementation.
> All five rows are now **implemented as recommended** and formally recorded in
> [ADR-0010](./adr/0010-trustless-work-escrow-rail.md) (this doc previously
> referenced a not-yet-existing "ADR-0008" for the escrow rail — that number is
> now used by the Neon auth ADR; the escrow-rail ADR is **0010**).

### Top risks

1. **API drift** — their V2 (May 2026) changed surfaces; pin versions, wrap in the adapter, re-verify on testnet before each release.
2. **Their network maturity** — confirm mainnet status + API-key gating before promising anything in public docs.
3. **UX friction** — milestone approval adds a step to `accept_offer`; must feel native (originator's customer gets a simple "confirm delivery" link), or adoption suffers.
4. **Scope discipline** — this is a new workstream; do not squeeze it into an active sprint.

---

## Part 7 — Bug report to Trustless Work (2026-09-09)

> **Status:** drafted, ready to send via their Telegram/Discord (linked from
> their docs). Once sent, record the channel + date here so the TW
> conversation has a single paper trail. The report below is the exact
> message — copy-paste as-is. Evidence is all public testnet, independently
> verifiable on Horizon / Stellar Expert.

````markdown
Subject: Bug report — release-funds build endpoint returns "Escrow already in dispute" for a fully releasable escrow (testnet, repro + tx hashes)

Hi Trustless Work team,

We're InvoFi (open-source invoice-financing protocol on Stellar Soroban; we
integrate your escrow as our disbursement rail). While running our full
end-to-end verification on testnet (2026-09-09), we hit what looks like a
bug in the release-funds build endpoint. Full repro and on-chain evidence
below — happy to provide our API key id privately if you need it.

────────────────────────────────────────
SUMMARY
────────────────────────────────────────
POST /escrow/single-release/release-funds returns HTTP 400
"Escrow already in dispute" for an escrow that is provably releasable:

  - Read model with validateOnChain=true:  flags {disputed: false, released:
    false, resolved: false}, milestone {approved: true, status: "completed"},
    balance = 250 (funded, unspent)
  - Direct on-chain read (escrow contract's own get_escrow): identical flags,
    disputed = false
  - No dispute transaction was ever submitted — the disputeResolver key was
    never used until the release

The on-chain validator (core/validators/escrow.rs in your
single-release-develop branch) only blocks release when
escrow.flags.disputed is true. It was false. Invoking release_funds directly
on the escrow contract succeeded immediately and moved funds correctly — so
the contract agrees with us; the API's pre-build check does not.

────────────────────────────────────────
ENVIRONMENT
────────────────────────────────────────
- API: https://dev.api.trustlesswork.com (testnet), auth via x-api-key
- Network: Stellar testnet
- Date: 2026-09-09, between ~13:57 and ~14:15 UTC
- Escrow type: single-release, amount 250, platformFee 0.5
- Trustline: VBUC:GBG77OVPMWHLOSRD3MSJ2IN7GLUTLCUWOV5J53WY4NBAOO4YZTQ6WFQ6
  (SAC: CCJ4FGM5DJA26ERC7Q7LG7PFJSVZOI7RPN4IEK4CUPYBHEF4X5ENO3ZF) — a
  testnet-only asset we minted for the verification run

Escrow under test:
  contractId:     CC2OKXVNUSX3AX5VM2FRSXA4ZV2YMOAKMR77BWQBARGOQ4WNO2T4SVOS
  contractBaseId: CDHBR6AFWLSLZGAQSXGYRBUEMZHV4AYHH7EAXVOU5VKOV3P5LSERR37D
  engagementId:   invofi-e2e-escrow-002-o1

Roles:
  approver / platformAddress / releaseSigner / disputeResolver:
      GBDDLOWR6YUEEYUKFKS6ISTCLBQKDPUXAOVJMNJYAACT6UYQGEKYEVZR
  serviceProvider / receiver:
      GAB3HIVRJI357WPSCTX4TFXU3PHZREDPQ4D4J5LPK2N6J5JH6USCJOWY
  signer (funder):
      GDHSPJ3V3FUK46TIVSXQCQBV4GXTYRCODUXVSU4XR2GQRKSJ42OTUHT2

────────────────────────────────────────
REPRO STEPS (all tx hashes are on testnet Horizon)
────────────────────────────────────────
1. Deploy single-release escrow
   POST /deployer/single-release (lender signs)
   tx: df8b10afad912c692403f6133daefe5178a6775cca99f0525987aee374fe721a
       (2026-09-09T13:57:42Z)

2. Fund the escrow
   POST /escrow/single-release/fund-escrow
   { contractId: "CC2OKXVN…SVOS", signer: "GDHS…UHT2", amount: 250 }
   tx: 4a8c67ae7de13caf085abc10f0cf1297d47495bfd65f913f0fdf2c261d42a9d9
       (13:58:12Z)

3. Approve the milestone (approver = platform)
   POST /escrow/single-release/approve-milestone
   { contractId: "CC2OKXVN…SVOS", milestoneIndex: "0",
     approver: "GBDD…EVZR" }
   tx: 0f45d500166da477c6f1ee2861da8e8f75d5e4493f029130558f24b6199a569d
       (13:59:12Z)

4. Attempt release → ALREADY FAILS HERE
   POST /escrow/single-release/release-funds
   { contractId: "CC2OKXVN…SVOS", releaseSigner: "GBDD…EVZR" }
   → HTTP 400 {"statusCode":400,"message":"Escrow already in dispute",
      "timestamp":"2026-09-09T13:59:31.146Z",
      "path":"/escrow/single-release/release-funds"}

5. Complete the milestone (serviceProvider) and retry — same error
   POST /escrow/single-release/change-milestone-status
   { contractId: "CC2OKXVN…SVOS", milestoneIndex: "0",
     newStatus: "completed",
     newEvidence: "Delivery confirmed by originator - e2e verification run
                   2026-09-09",
     serviceProvider: "GAB3…OWY" }
   tx: 3f9fab46e4acf1b64ba1276f9c5d722e4251fac280af4b0beb3a5174c01271eb
       (14:01:32Z)
   → release-funds retried at 14:01:35, 14:02:31 and 14:07:47 UTC:
     same 400 "Escrow already in dispute" every time.

6. Contradicting state at time of the last attempt:
   - GET /helper/get-escrow-by-contract-ids?contractIds[]=CC2OKXVN…SVOS
     &validateOnChain=true
     → flags {disputed:false, released:false, resolved:false},
       milestones [{approved:true, status:"completed"}], balance 250
   - Direct on-chain get_escrow on CC2OKXVN…SVOS → same flags,
     disputed:false

7. Workaround that succeeded (platform signs):
   invoke_contract on the escrow itself:
     release_funds(release_signer: GBDD…EVZR,
                   trustless_work_address:
                     CDHBR6AFWLSLZGAQSXGYRBUEMZHV4AYHH7EAXVOU5VKOV3P5LSERR37D)
   tx: d3c0f77b542dea14f851155701391c0e81ab1f1b5fdb7279db5b414ddef86fb0
       (14:14:32Z)
   Funds moved correctly on-chain: receiver +248 (250 − 0.5% fee),
   platform +1.25 fee, tw_release event published, flags.released → true.

────────────────────────────────────────
WHAT WE'D APPRECIATE
────────────────────────────────────────
1. Confirmation whether this is a bug in the release-funds pre-build
   dispute check (and a fix), since our product UI (#381 on our repo) needs
   the standard API path, not the direct contract invoke.
2. Guidance on the intended milestone flow: is approve-milestone +
   change-milestone-status→completed the expected sequence before release?
   (Approve alone left status "pending" and release was still blocked.)
3. Related observation: passing a trustline address that is a C… contract
   (SAC) instead of the issuer G… account passes deploy validation but
   fund-escrow fails on-chain with "HostError: Error(Storage, MissingValue)".
   A deploy-time guard or a docs note would save integrators an afternoon.

Everything above is on public testnet and independently verifiable on
Horizon / Stellar Expert. Thanks for the great infrastructure — the
build→sign→submit loop has been a pleasure to integrate against.

Best,
Samuel Ojetunde (@samjay8)
InvoFi — Stellar-VaultLink
https://github.com/Stellar-VaultLink/invofi
````

---

*Generated as research + plan input for InvoFi Phase 2. Verify live endpoint names and SDK hook signatures against the Trustless Work Swagger/API docs (`docs.trustlesswork.com`) before implementation — this doc is a design document, not a substitute for their current API reference.*