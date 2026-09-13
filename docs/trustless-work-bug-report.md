# Bug report — Trustless Work release-funds build endpoint

> **Subject:** Bug report — release-funds build endpoint returns "Escrow already in dispute" for a fully releasable escrow (testnet, repro + tx hashes)
> **From:** Samuel Ojetunde (@samjay8) — InvoFi, Stellar-VaultLink · <https://github.com/Stellar-VaultLink/invofi>
> **Date:** 2026-09-09 · **Network:** Stellar testnet · **API:** `https://dev.api.trustlesswork.com`
> **Companion doc:** [trustless-work-integration.md](./trustless-work-integration.md) (Part 0 findings, full e2e evidence)
>
> **Status:** shared with the TW team (2026-09-12, via a core team member on
> Telegram) — under active discussion. The integration doc's
> [Part 6](./trustless-work-integration.md#part-6--bug-report--engagement-with-trustless-work)
> tracks the engagement timeline; this file is the canonical repro evidence.

> **⚠️ Re-verified 2026-09-10 — bug REPRODUCED on a brand-new escrow.**
> Everything below remains accurate; a second, independent repro with fresh
> tx hashes is in the [Re-verification section](#re-verification-2026-09-10--bug-still-live).
> A **second defect** was also confirmed: their indexer did not index a new
> escrow deploy for 40+ minutes, so `fund-escrow` via the API returns
> "Escrow not found" for escrows that exist on-chain.
>
> **⚠️ Re-verified again 2026-09-12 — third repro, 100% API-path escrow.**
> TW's infra was healthy this time (indexer lag 2s, every build endpoint
> instant) and the release build **still** returned 400 "Escrow already in
> dispute" for a provably releasable escrow — see the
> [2026-09-12 section](#re-verification-2026-09-12--third-repro-full-api-path-escrow-infra-pause-theory-ruled-out).
> This rules out the "backend was paused" explanation for the release bug
> itself; the separate indexer-lag defect from 09-10 may still have been
> pause-related.
>
> **⚠️ 2026-09-13 — TW's release-signer hypothesis tested and refuted.** A
> fifth escrow (011) with fully distinct `releaseSigner`/`disputeResolver`
> wallets and a schema-perfect payload still got the false "Escrow already
> in dispute" 400 — while the same on-chain release signed by that distinct
> release signer succeeded immediately. See the
> [role-collision experiment](#role-collision-experiment-2026-09-13-00030020-utc--tws-hypothesis-tested-and-refuted)
> plus a newly-found **corrupted fund-build defect** (funds credited to the
> signer instead of the escrow) and the full error-message timeline.
>
> **✅ 2026-09-13 (final) — ROOT CAUSE IDENTIFIED: the asset.** A controlled
> A/B experiment minutes apart — identical code, roles, trustlines, balances,
> API path — showed the release-funds build endpoint **succeeds (HTTP 201)
> on official testnet USDC** (escrow 013) and **fails with the false
> "Escrow already in dispute" 400 on our custom VBUC SAC** (escrow 014).
> The release pre-check is **token-conditional**. An earlier note in this
> report claiming the token hypothesis was "refuted" was wrong — it was
> retracted after the A/B run. See the
> [A/B experiment](#ab-experiment-2026-09-13-01140117-utc--token-is-the-trigger).

---

## Re-verification (2026-09-10) — bug still live

**Method:** deployed a completely fresh single-release escrow through TW's
own `/deployer/single-release` on 2026-09-10 (~00:08 UTC), drove it to the
releasable state directly on-chain, and re-attempted the release build.

| Item | Value |
|---|---|
| Escrow contract | `CDNY5U5VFWZXX5DCCQIWY2Q5ZOBD3LSVUQQWHALYDLZOGAR7QUP3EMR3` |
| Engagement | `invofi-e2e-escrow-003-o1` · 250 units · platformFee 0.5 |
| Deploy tx (lender) | `d880ab0edfc2a4369196d6083ad5cf7a7171efdbb7b49daefc5f59494c1f9629` |
| Fund tx (250 units, direct on-chain) | `c014105d2cd04279c2036432b2311ec6b64730039e41015a5a5bc61d66e1cbf2` |
| Approve milestone (platform) | `9d6eec45697724dbc05b6afcaba9d67c89eafd7086ad05b6f387acf3e222660f` |
| Milestone → completed (originator) | `62918df22545e14feadb1f2e22563003e337eec1f6a6437b5f5ab166da304a32` |
| Release build attempt (API) | **HTTP 400 "Escrow already in dispute"** at 00:47:05 and 00:48:03 UTC |
| Direct release tx (platform) | `5058b6f7a9490ce32ddaaa2b3b95e5f8a2515bdfeda029747107b9d2095a57f4` |

- On-chain state at both failed attempts (`get_escrow`): `flags.disputed =
  false`, `flags.released = false`, milestone `approved: true`, `status:
  "completed"` — provably releasable; the contract itself agreed (direct
  `release_funds` succeeded immediately and moved funds correctly:
  receiver +248, platform fee +1.25, TW fee +0.75, `tw_release` event).
- Variants tried: retry after 30s (same 400), and passing the escrow
  factory/base ID instead ("Escrow not found"). No API path to release.
- **Second defect (indexer):** TW's read model did not index the new
  escrow for 40+ minutes after its successful deploy tx —
  `helper/get-escrows-by-signer` omitted it and `fund-escrow` returned
  "Escrow not found". On 2026-09-09 the same deploy path indexed in <60s.
  We funded via direct contract invocation instead. (The read model also
  still shows yesterday's escrow 002 as `released: false` although
  on-chain `released: true` since 2026-09-09.)

---

## Re-verification (2026-09-12) — third repro, full-API-path escrow; infra-pause theory ruled out

A TW core member asked whether the error is reproducible and noted a single
release had just worked for him, suggesting (via the maintainer) that a
recent backend/DB pause on TW's side might explain our failures. Retested
2026-09-12 ~22:16 UTC with a **brand-new escrow driven 100% through the API
path** (deploy → fund → approve → complete — all builds, signs, and submits
via `dev.api.trustlesswork.com`):

| Item | Value |
|---|---|
| Escrow contract | `CD7G7S2RXCXIRTVSVUUZNTI3V3IPS5TJV56W434CFAZ2EGXPW6LMTB74` |
| Engagement | `invofi-e2e-escrow-004-o1` · 250 units · platformFee 0.5 |
| Deploy tx | `aaf6db91d9e2fb2ed290a31444fc5a8436cbfd580298dd88bf993524dc84cb63` |
| Fund tx (via API) | `ff33ef13f3243449d8bc35a97c535001b6ebc03db533bf3c1f18eb3b4628ba45` |
| Approve milestone | `3a1cf231dbf49869a29eb53e5d17918c245521f132066d58cd3d3e8bfd32e338` |
| Milestone → completed | `ba36a3febe381b93d1b1c6880d216455ca2d860062c4edac7be74d946781d852` |
| Release build attempts | **HTTP 400 "Escrow already in dispute"** at 22:16:58 and again after 30s (22:17:31) |
| Direct release tx | `4d155c417e946f31c7cf8147250b6f5724d72735c91e99d5faa9f5c08bf15716` — funds moved correctly |

**Infra-pause theory ruled out for THIS bug:** the read model was healthy
throughout — indexer lag was **2 seconds** from deploy confirmation to the
escrow appearing in `get-escrows-by-signer`, and every build endpoint
resolved the escrow instantly. On-chain state at both failed attempts:
`disputed: false, released: false`, milestone approved + completed, balance
250 unspent — provably releasable; the direct `release_funds` succeeded
immediately (receiver +248, platform fee +1.25).

**Additional read-model defect confirmed:** after the on-chain release,
the 004 row updated `balance` to 0 but still reports `released: false`
(same as escrow 002 since 2026-09-09). The flags-sync pipeline is not
picking up `tw_release` events even though balance changes propagate —
consistent with the stale-flag state the release pre-check appears to key on.

Script: `invofi/scripts/tw-retest.ts` (runs the full flow end-to-end and
prints a summary block; idempotent per fresh engagement id).

### Video proof (escrow 006, 2026-09-12 23:32 UTC)

A recorded terminal session of a complete fourth repro — deploy → fund →
approve → complete → **release build HTTP 400** → direct release **SUCCESS**
— is embedded below (animated; ~1 min at 2× speed) and also hosted at
<https://asciinema.org/a/SKwLDC7oj7XUfhyk> (interactive, scrubbable).

![Recorded reproduction of the release-funds bug: full escrow lifecycle via
the TW API, release build rejected with "Escrow already in dispute" for a
releasable escrow, then a successful direct on-chain
release_funds](./tw-bug-repro.gif)

- Escrow: `CDBU3TDENP7UJ4APLR6AE4Y5R6EUZFTZHV5CDFY74APHYAHK7MPL6LYF`
  (engagement `invofi-e2e-escrow-006-o1`)
- Indexer lag: 2s · Release build: HTTP 400 twice
- Direct release tx:
  `6324fd5075075259a6648177aff34ae0a1b7b4c35ae06c3f816a36d5469db5e4`

---

## Role-collision experiment (2026-09-13 00:03–00:20 UTC) — TW's hypothesis tested and REFUTED

A TW core member suggested the failure was payload-related — "it should be
the release signer address and the contract ID." Our payloads always matched
the live OpenAPI schema (`ReleaseFunds: { contractId, releaseSigner }`), but
one variable had never been isolated: in every failing escrow, the platform
key held **releaseSigner + approver + disputeResolver + platformAddress**
simultaneously. Escrow **011** was built to test exactly that:

| Role | Wallet |
|---|---|
| signer/funder | e2e-lender `GDHS…UHT2` |
| approver + platformAddress | platform `GBDD…EVZR` |
| serviceProvider + receiver | originator `GAB3…OWY` |
| **releaseSigner** | **buyer `GCPN…USQ7` (distinct)** |
| **disputeResolver** | **keeper `GCEC…QJ6` (distinct)** |

Lifecycle (escrow `CBYM6BIVKW5PBX7KMXZZB6TWZXU4F2JOP7IA4CZMME5VHICW4EJGF2ZU`,
engagement `invofi-e2e-escrow-011-o1`, deploy via their API):

| Step | Result |
|---|---|
| Deploy (API build, lender signs) | ✅ `df26fe30`-lineage submit 201 |
| Fund (direct on-chain, correct order: fund → approve → complete) | ✅ `9edadbb1…` |
| Approve milestone (platform) | ✅ `3f77f893…` |
| Complete milestone (originator) | ✅ `d166fd73…` |
| **Release build via API — `{contractId, releaseSigner: buyer}`** | ❌ **HTTP 400 "Escrow already in dispute" — the exact same false error** |
| On-chain state at probe time | `disputed: false, released: false`, milestone `completed`, balance = amount |
| Direct on-chain `release_funds` **signed by the distinct buyer** | ✅ `dcf65068…` — receiver +248, platform fee paid, `released: true` |

**Verdict:** with fully distinct roles, a schema-perfect payload, and a
provably releasable escrow, the endpoint still returns the false dispute
error. The release-signer/role-collision theory is **refuted**; the defect
is in the API's pre-build check and it fires precisely when an escrow
becomes releasable (balance == amount).

### Additional defect discovered the same night: corrupted fund-escrow build

At 2026-09-12 23:50 UTC, a `fund-escrow` build for escrow 008
(`CCII3LRD…SKLA`) produced a transaction that — after successful on-chain
execution — credited **250 VBUC to the signer's own address** instead of the
escrow contract (Horizon effects of tx `1b7ed1aa6bef77da8dfa112e3873f4a5b2319402d3b4c1947307640867c8d316`:
`account_debited GDHS… 250 VBUC` + `contract_credited GDHS… 250 VBUC`). The
escrow contract balance remained 0. This looks like the API assembled the
fund invocation against the wrong contract address — and it coincided with
two further error-message changes on the release endpoint within one hour
("must be completed to release" → "balance must be equal to the amount of
earnings" → back to "already in dispute"), indicating active redeployment of
the API during this window.

### Token + trustline hypothesis (2026-09-13 00:48 UTC) — tested; final verdict below

A TW core member then suggested the "random messages" come from our test
asset, and that `platformAddress`, `receiver`, and TW's address may be
missing the trustline. Our asset is **VBUC**, a testnet-only SAC we minted
for verification (issuer `GBG77OVP…`, SAC `CCJ4FGM5DJ…`). TW's own
[Trustlines doc](https://docs.trustlesswork.com/trustless-work/introduction/stellar-and-soroban-the-backbone-of-trustless-work/trustlines)
says escrows "can use any Stellar-issued asset" as long as "every participant
must be able to hold that asset." Escrow **012** tested that exact bar:

| Wallet | Role in 012 | Trustline | Balance at test time |
|---|---|---|---|
| e2e-lender `GDHS…UHT2` | signer/funder | ✓ | 500 VBUC |
| invofi-deployer `GBDD…EVZR` | approver + platformAddress | ✓ | 7.5 VBUC |
| e2e-originator `GAB3…CJOWY` | serviceProvider + receiver | ✓ | 1,988 VBUC |
| e2e-buyer `GCPN…VUSQ7` | releaseSigner | ✓ | 300 VBUC |
| keeper `GCEC…4G6QJ6` | disputeResolver | ✓ | 300 VBUC |

Every step succeeded through the API — deploy (indexed in 2s), fund,
approve, complete (`CDSH3O7S…P4SO5X`) — and the release build **still
returned 400 "Escrow already in dispute" twice** (00:50:04, 00:50:25 UTC)
while on-chain state was releasable and TW's own read model showed
`disputed: false` for the same contract at the same minute. The buyer-signed
on-chain release then succeeded instantly (`5f8699f2…d803c1f1`): receiver
+248, platform fee +1.25 — the exact flow TW's member described.

The trustline theory is also contradicted by history: receiver and platform
held trustlines **and** balances during all five failing release attempts
(004, 006, 011, 012 among them), and the 09-12 23:59 probes showed the
endpoint returning *correct* state-based errors for unfunded/released
escrows — impossible if trustline/mint state corrupted the pre-check.

### A/B experiment (2026-09-13 01:14–01:17 UTC) — TOKEN is the trigger

Controlled comparison, minutes apart, identical everything except the asset
(same script `tw-role-test.ts`, same five wallets with distinct roles, same
250 amount / 0.5% fee, same API path, every wallet trustlined and funded in
both runs):

| | Escrow 013 — **USDC** | Escrow 014 — **VBUC** |
|---|---|---|
| Contract | `CCR4WZRK…RPG75` | `CAOYPJKU…IOPDL` |
| deploy → index | 3 s | 3 s |
| fund (API) | ✓ `bb440a56…` | ✓ `19f1589a…` |
| approve (API) | ✓ `debdaca6…` | ✓ `9ed08f66…` |
| complete (API) | ✓ `62faf041…` | ✓ `63b8157e…` |
| **release build** | **HTTP 201 — accepted** (`bfcdecbb…`) | **HTTP 400 "already in dispute"** ×2 |
| funds moved | receiver +248, fee +1.25 | stuck → direct invoke needed (`e23dd336…`) |
| read-model flags after release | `released: true` ✓ | stale `released: false` |

**Conclusion (retracting our earlier "refuted" note):** TW's core member was
right — the failure is tied to the token used. The release-funds pre-check
(built XDR validation and/or its read-model lookup) rejects escrows denominated
in our custom VBUC SAC while working correctly for USDC. Trustlines were a
necessary precondition (all satisfied) but not the discriminator. InvoFi has
since switched its testnet verification to official testnet USDC, which is
also our production asset — so the integration is now fully green through the
standard API path. The residual ask for TW: confirm whether non-USDC issued
assets are *supported-but-buggy* or *unsupported* in the release pre-check, so
other integrators with custom assets know what to expect.

### Error-message timeline on `release-funds` (all observed live)

| When | Message | Escrow state |
|---|---|---|
| 09-09 13:59–14:07 | "Escrow already in dispute" | releasable (false) |
| 09-10 00:47–00:48 | "Escrow already in dispute" | releasable (false) |
| 09-12 22:16–22:17 | "Escrow already in dispute" | releasable (false) |
| 09-12 23:29 | "Escrow already in dispute" | releasable (false) |
| 09-12 23:59 | "The escrow must be completed to release earnings" | unfunded (correct check, new message) |
| 09-12 23:59 | "The escrow funds have been released" | released (correct) |
| 09-13 00:03 | "The escrow balance must be equal to the amount of earnings" | funded+completed (false — balance was equal) |
| 09-13 00:03 | "Escrow already in dispute" | funded+completed, distinct roles (false) |
| 09-13 00:46 | "The escrow funds have been released" | released (correct — pre-check healthy again) |
| 09-13 00:50 | "Escrow already in dispute" ×2 | funded+completed, distinct roles, all wallets trustlined+funded, VBUC (false) |
| 09-13 01:14 | **HTTP 201 — release accepted** | same setup, USDC (correct) |
| 09-13 01:16 | "Escrow already in dispute" ×2 | same setup, VBUC (false) |

---

## Message to send (copy everything below this line as-is)

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
