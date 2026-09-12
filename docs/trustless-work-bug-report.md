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
