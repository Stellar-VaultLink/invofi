# RLS policy inventory (Supabase era) — source of truth for the #377 port

Extracted from the repo's recorded DDL (2026-09-18 schema baseline,
`migrations/0000_baseline.sql`) — 53 policies across 22 tables. Every
policy below has a defined successor enforcement point in the
server-layer model (ADR-0009). This document is acceptance checkbox 1 of
issue #377.

Legend for "New enforcement point":

- **SL-party** — server-layer helper checks the session wallet against the
  row's party column(s) (`requireUser` + per-table rule).
- **SL-admin** — server-layer helper checks an admin claim (`requireRole`).
- **SL-public** — no check; safe for anonymous reads (marketplace/stats).
- **SL+RLS** — server check **and** retained RLS with per-request context
  (the four defense-in-depth tables; queries must use the context wrapper).

| Table | Policies (legacy) | New enforcement point |
|---|---|---|
| `user_profiles` | own_profile_select / insert / update | SL-party (owner wallet = session) |
| `invoices` | invoices_select (`using (true)`) / insert / update | SL-public read; SL-party writes (originator) |
| `financing_offers` | offers_select (`using (true)`) / insert / update | SL-public read; SL-party writes (lender) |
| `position_listings` | listings_select (`using (true)`) / insert / update | SL-public read; SL-party writes (seller) |
| `invoice_documents` | documents_select / insert / verify | SL-party (invoice parties only) |
| `protocol_stats` | public read | SL-public |
| `price_history` | Anyone can read | SL-public |
| `contract_state_snapshots` | Public read snapshots / Admin write snapshots | SL-public read; SL-admin write |
| `health_metrics` | Public read / Admin write | SL-public read; SL-admin write |
| `audit_log` | Admin insert / Authenticated read | **SL+RLS** (tamper-evident trail) |
| `alert_configs` | Authenticated read / Admin insert / Admin update | SL-party read; SL-admin writes |
| `reminder_configs` | Admin read / Admin update | **SL-admin** (the admin-gate acceptance case) |
| `reminder_preferences` | Originator read / update / upsert | SL-party |
| `invoice_reminders` | Originator read | SL-party |
| `notifications` | Users read / insert / update / delete own | SL-party (owner wallet = session) |
| `lender_preferences` | Lender can manage own preferences | SL-party |
| `fractional_positions` | Lender read own / update own | SL-party |
| `fractionalization_records` | Anyone read / Originator create / Originator update own | SL-public read; SL-party writes |
| `dividend_distributions` | Anyone read / Originator manage | SL-public read; SL-party writes |
| `pending_transactions` | Read / Create / Participants update | **SL+RLS** (multisig signature store, ADR-0006) |
| `transaction_approvals` | Read approvals / Insert own approval | **SL+RLS** (multisig signature store, ADR-0006) |
| `encrypted_messages` | Participants read / Sender insert | **SL+RLS** (worst-breach table) |

## Notes

- The four **SL+RLS** tables are exactly ADR-0009's defense-in-depth set.
  Their queries route through the context wrapper (`withUserContext`)
  which issues `SET LOCAL app.user_id` on the pooled transaction; the
  retained policies read that setting. A wrapper bypass fails loudly in
  the unauthorized-access tests, not silently.
- `sep10_used_challenges` has **no** legacy policy — it was always
  service-role only (SEP-10 replay guard) and stays server-only.
- `user_profiles.username` uniqueness is a DB constraint, not a policy;
  claim races are arbitrated by `UPDATE ... WHERE username IS NULL`
  (shipped with #380).
- Anything added after this inventory lands inherits the server-layer
  convention: an explicit `requireUser`/`requireRole` check at the
  endpoint, noted in the PR checklist.
