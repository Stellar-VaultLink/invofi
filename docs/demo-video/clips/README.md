# InvoFi demo — recorded clips (2026-09-15)

Live site (invofi-five.vercel.app), real testnet transactions — every on-chain
shot below is verifiable on stellar.expert / Horizon.

| Clip | Shot | Duration | On-chain evidence |
|---|---|---|---|
| clip-01 | Intro / landing | 23s | — |
| clip-02 | Connect wallet | 23s | — (dialog handshake, retaken 09-17) |
| clip-03 | Register invoice | 41s | `register_invoice` — invoice `inv_mu2iknberwbf`, 5000 XLM |
| clip-04 | Lender creates offer | 40s | `create_offer` — `off_mu2jhf1p7we6`, 5% / 30d |
| clip-05 | Accept offer (XLM moves) | 19s | accept tx `de08c93451e987…`, invoice → Financed |
| clip-06a | Recipient trustline | 15s | — |
| clip-06b | Transfer position | 36s | POSI payment — lender 5000→4000, recipient 1000 |
| clip-07 | Repay | 30s | repay tx `246431d1215f3d…`, invoice → Repaid |
| clip-08 | Stats dashboard | 23s | stats seeded from real v2 `get_stats` (1 financed / 1,000 XLM / 5 invoices+offers), retaken 09-17 |
| clip-09 | Outro / repos | 37s | — |

Total ≈ 4:46 after the Sep-17 retakes (script target 3–5 min ✓)

## Notes for the edit
- Voice-over pacing: scenes 3–7 recorded slightly longer/shorter than the
  script slots; trim pauses to taste.
- POSI mint: at recording time (Sep 16) the deployed financing contract
  predated Task 7 minting, so the lender's 5000 POSI claim was minted
  issuer-side (payment, 1:1 with principal). **As of the v2 stack
  (Sep 16, 2026) `accept_offer` mints the position token natively** —
  verified end-to-end on testnet; future recordings need no workaround.
- Retakes (Sep 17): clip-02 (the first take's on-camera dialog handshake
  failed — it targeted the login-card connect, whose flow ends in a SEP-10
  prompt against the paused backend; the retake uses the navbar connect,
  pure wallet-kit handshake) and clip-08 (the first take showed the
  paused-Supabase fetch error; the retake stubs `protocol_stats` with the
  real v2 `get_stats` values). Both retakes recorded against the live v2
  stack via `invofi-migration/demo-recorder/record-clips-v3.mjs`.
- Personas: `/tmp/demo_personas.json` (business / lender / recipient, all
  friendbot-funded testnet keys).
