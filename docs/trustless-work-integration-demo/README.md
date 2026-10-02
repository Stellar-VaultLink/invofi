# Trustless Work Escrow Integration — Demo Video

> **`demo.mp4`** · 3 min 14 s · 1920×1080 · recorded **2026-10-02** from real runs on **Stellar testnet** (USDC, single-release escrows). No mocks in the lifecycle section — every hash, contract id and balance below is on-chain and independently verifiable.

[▶ Download / play the video](./demo.mp4) · [Full run transcript](./demo-run-transcript.txt)

## What the video covers

| Time | Section |
|---|---|
| 0:00 | Intro — InvoFi × Trustless Work |
| 0:09 | The escrow rail: app → `/api/escrow/*` proxy → TW Core API (`dev.api.trustlesswork.com`) → Soroban escrow contract; role mapping (InvoFi actor → TW role) |
| 0:24 | SDK surface — `createTrustlessWorkClient` in `@invofi/sdk` (deploy/fund/milestone/release builds, sign+submit loop, read-model helpers, indexer-lag retry, direct-release fallback) |
| 0:36 | Frontend key proxy — `/api/escrow/[action]`: server-only `TW_ESCROW_API_KEY`, stateless relay, proxy-can-never-sign guard |
| 0:46 | Product UI — milestone flow on the invoice page, portfolio-wide escrow status board, `financing_offers.escrow_contract_id` (migration 003), en/ar i18n |
| 0:56 | Test gate 1 — **@invofi/sdk suite: 368/368 green** (40 dedicated escrow tests) |
| 1:02 | Test gate 2 — escrow UI tests: **12/12 green** |
| 1:11 | **LIVE lifecycle** — deploy → resolve → fund → approve milestone → complete (delivery evidence) → on-chain state proof → release (HTTP **201** on USDC) |
| 2:43 | Settlement — every USDC accounted for (Horizon effects) |
| 3:02 | Recap + links |

## The live run (engagement `invofi-demo-1002-o3`)

| Artifact | Value |
|---|---|
| Escrow contract id | `CAECVQNUILIC6IQ2OLUUXPUWCU2WZ57KYAP2ZHZZYLFBARDY5DCV2KID` |
| Base contract id | `CDHBR6AFWLSLZGAQSXGYRBUEMZHV4AYHH7EAXVOU5VKOV3P5LSERR37D` |
| Deploy tx | [`6d2b7048…47154`](https://horizon-testnet.stellar.org/transactions/6d2b70483ede4824a1036cac96c961514d64a7e63354f802c9893f7cf1f47154) |
| Release tx | [`65b253a8…ffa24`](https://horizon-testnet.stellar.org/transactions/65b253a801f325b45f3cf21ffe2b5906c4e82f19dfa90eff80f1f736290ffa24) |
| Release build | `POST /escrow/single-release/release-funds` → **HTTP 201** on USDC |
| Indexer lag (deploy → indexed) | 3 s |

**Settlement (from Horizon tx effects):** lender −250.00 → receiver (originator) +248.00 · platform fee +1.25 (0.5%) · Trustless Work protocol fee +0.75 (0.3%, `GA6KH5VWPCHB…`) — escrow balance zeroed.

**Escrow Viewer:** <https://viewer.trustlesswork.com/escrow/CAECVQNUILIC6IQ2OLUUXPUWCU2WZ57KYAP2ZHZZYLFBARDY5DCV2KID>

## Reproduce

```bash
cd invofi/scripts
TW_API_KEY=<your TW key> TW_ENGAGEMENT=invofi-demo-<date>-o1 npx tsx tw-retest.ts
```

The script drives the full lifecycle through TW's build → sign → submit loop, prints Horizon confirmations, and finishes with a reconciliation summary (`AFTER` balances + `SUMMARY` block).

## Further reading

- [docs/trustless-work-integration.md](../trustless-work-integration.md) — full integration status & reference
- [docs/adr/0010-trustless-work-escrow-rail.md](../adr/0010-trustless-work-escrow-rail.md) — decision record
- Trustless Work: [org](https://github.com/Trustless-Work) · [API docs](https://docs.trustlesswork.com) · [Backoffice](https://dapp.trustlesswork.com)
