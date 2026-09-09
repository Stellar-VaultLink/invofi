# Bug report — Trustless Work release-funds build endpoint

> **Subject:** Bug report — release-funds build endpoint returns "Escrow already in dispute" for a fully releasable escrow (testnet, repro + tx hashes)
> **From:** Samuel Ojetunde (@samjay8) — InvoFi, Stellar-VaultLink · <https://github.com/Stellar-VaultLink/invofi>
> **Date:** 2026-09-09 · **Network:** Stellar testnet · **API:** `https://dev.api.trustlesswork.com`
> **Companion doc:** [trustless-work-integration.md](./trustless-work-integration.md) (Part 0 findings, full e2e evidence)
>
> **Status:** drafted, ready to send via their Telegram/Discord (linked from
> their docs). Once sent, record the channel + date in
> [trustless-work-integration.md → Part 7](./trustless-work-integration.md#part-7--bug-report-to-trustless-work-2026-09-09)
> so the TW conversation has a single paper trail.

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
