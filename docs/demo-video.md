# Demo Video — Shot List & Production Notes

> **This is a human-track deliverable** — recording and uploading are done
> by the maintainer; this document is the full recording script. Target:
> **3–5 minutes**, uploaded **unlisted** to YouTube, then linked from both
> READMEs (invofi + invofi-contracts).
>
> **Environment check (verified 2026-08-06):** live app returns HTTP 200 on
> `/` and `/stats`; Soroban testnet is up (protocol 27, Friendbot available);
> the 5 contracts + POS token are deployed. You can record right now.

---

## Before you record

- [ ] Use a **fresh funded testnet account** for the business and one for the
      lender (Freighter can create testnet accounts; fund via Friendbot —
      enabled on testnet as of this doc).
- [ ] Have **Freighter installed + connected** on the recording browser.
- [ ] Confirm the app points at the live testnet contracts (it does — the
      Vercel deployment is configured).
- [ ] **Check `/stats` in a browser first.** If it shows zeros/empty state,
      that's expected until the indexer's Supabase secrets are configured —
      the shot still works, but you may prefer to add the secrets first so
      real aggregates show.
- [ ] Close all tabs except the app; hide bookmarks bar; disable notifications.
- [ ] Recording quality: 1080p, mic on, cursor highlighted, no auto-pausing.

---

## Shot list with narration (≈ 4 minutes)

Read the lines under each shot. Feel free to trim — these are guides, not a
script to memorize.

| # | Time | Scene | Narration |
|---|---|---|---|
| 1 | 0:00–0:20 | **Intro** (landing page) | "InvoFi is open-source invoice financing on Stellar Soroban. Small businesses often wait 30 to 90 days to get paid. InvoFi lets them tokenise an invoice on-chain and get funded by a global pool of lenders — no banks, no middlemen." |
| 2 | 0:20–0:45 | **Connect wallet** | Click **Connect Wallet**, pick **Freighter** (mention LOBSTR is equally supported via the approved-wallet allowlist). Approve. "One click, and my Stellar wallet is connected." |
| 3 | 0:45–1:20 | **Register an invoice** | Business flow: fill amount + currency (XLM) + due date, submit. "The invoice is now registered on-chain — let's open the registry contract on stellar.expert to show the entry." (Show the registry contract link.) |
| 4 | 1:20–1:55 | **Lender creates an offer** | Switch to the lender wallet; Marketplace → find the invoice → create offer with an interest rate + duration. "Any lender can now compete with a financing offer." |
| 5 | 1:55–2:30 | **Accept offer — real token transfer** | Business accepts. **Key moment.** "Watch this: the XLM actually moves from the lender to the business in this transaction — and the lender receives a SEP-41 position token, one per unit of principal." (Show the stellar.expert transaction and the invoice flipping to **Financed**.) |
| 6 | 2:30–2:55 | **Position token transfer** | Lender portfolio: add the POS trustline (one click), then **Transfer Position** to a second wallet. "Position tokens are plain Stellar assets — I can send my claim to any wallet." |
| 7 | 2:55–3:30 | **Repay** | Business repays (partial or full). "The business repays principal plus interest — watch the remaining balance update — and the invoice reaches Repaid. The lender just earned yield." |
| 8 | 3:30–3:55 | **Stats dashboard** | `/stats` page. "Every action publishes an on-chain event, and an indexer aggregates them here: invoices financed, total volume, repayment rate, active lenders, and the insurance pool." |
| 9 | 3:55–4:10 | **Outro** | Show repo cards. "InvoFi is open source — apps and docs in the invofi repo, the auditable smart contracts in invofi-contracts. Contributions welcome." |

---

## After recording

- [ ] Trim to 3–5 min; add captions (YouTube auto-captions, corrected).
- [ ] Upload **unlisted**: "InvoFi — Testnet Demo (Aug 2026)".
- [ ] Copy the YouTube URL and send it to the maintainer chat — the README
      links are added the moment the URL is available:
      `- 🎬 [Demo video](<youtube-url>) — 4-minute testnet walkthrough.`
      (added to the **Security/Compliance** area of the invofi README and the
      **Changelog** area of the invofi-contracts README)

---

## Voiceover script v2 — next-phase cut (wallet-only, ElevenLabs-ready)

> **This version describes the product as it will be after the Neon
> migration + wallet-first onboarding (#376/#380) land:** wallet-only
> sign-in, username/role onboarding, and the current 5-contract system.
> Record **after** those ship — the v1 shots above stay valid for a
> pre-migration cut.

### ElevenLabs production notes

- **Model:** eleven_multilingual_v2 (or the current flagship) — natural,
  steady pace; set stability ~0.55, similarity ~0.80, style ~0.25.
- **Voice:** one calm, confident narrator; keep speed at 1.0 and let the
  screen do the excitement.
- **Generate per scene** (each block below is one generation) so re-records
  never touch the whole track. Numbers and IDs are written out so TTS
  doesn't garble them.
- Pauses: add `<!-- 0.8s -->` style breaks via the pause widget or split
  clips on the timeline at scene boundaries.

### Script (per scene, ≈ 4 minutes total)

**Scene 1 — Cold open (0:00–0:18).**
"A small business just delivered the goods. The invoice says thirty, sixty,
ninety days. InvoFi says today. InvoFi is open-source invoice financing,
built on Stellar Soroban: businesses tokenise invoices on-chain, and a
global pool of lenders funds them directly — no banks, no middlemen."

**Scene 2 — Wallet-only sign-in (0:18–0:45).**
"There's no password to forget. One click on Connect Wallet, and my Stellar
wallet is my account. First time here? Pick your role — lender, or business
— choose a username, and you're in. Your wallet is the identity; the
username is just how people find you."

**Scene 3 — Register an invoice (0:45–1:15).**
"As a business, I register an invoice: amount, currency, due date. It's
written to the on-chain registry in seconds — anyone can verify it, nobody
can quietly change it."

**Scene 4 — A lender makes an offer (1:15–1:40).**
"On the marketplace, lenders compete to finance it. I set my rate, my
duration, and submit an offer. The business sees it instantly."

**Scene 5 — Accept: real money moves (1:40–2:20).**
"Here's the moment that matters. The business accepts — and watch the
transaction: the funds actually move from the lender to the business, on
testnet, on-chain. The lender receives a SEP-41 position token — a claim on
the repayment, held in their own wallet. Not an IOU in a database. An
asset."

**Scene 6 — Position token transfer (2:20–2:45).**
"That position token is portable. One click, and I can send my claim to any
Stellar wallet — the new holder earns the yield when repayment lands."

**Scene 7 — Repayment (2:45–3:15).**
"When the invoice comes due, the business repays principal plus interest.
The balance updates live, the invoice flips to repaid, and the lender has
earned yield on money that used to sit idle."

**Scene 8 — Safety nets (3:15–3:40).**
"Underneath it all: an insurance pool staked by lenders, a circuit breaker
the team can pull in an emergency, and a reputation score that follows every
business across every invoice."

**Scene 9 — Stats + outro (3:40–4:05).**
"Everything you just saw is aggregated on the public stats dashboard —
invoices financed, total volume, repayment rate. InvoFi is fully open
source: the apps in the invofi repo, the auditable Soroban contracts in
invofi-contracts. Fork it, break it, build on it. Contributions welcome."

### Recording checklist (v2 deltas)

- [ ] Fresh testnet accounts via Freighter **or LOBSTR** (both approved
      wallets — show both in the connect shot if easy).
- [ ] Complete the wallet-only onboarding on camera once (role + username
      picker) — it's a differentiator, don't skip it.
- [ ] If the escrow rail (Trustless Work) ships before recording, swap
      Scene 5's line for the escrow version in the integration doc.
