# ADR-0009: Authorization model for the Neon backend (RLS vs server layer)

**Status:** Accepted (2026-09-08) — tracked in #377

## Context

Today, authorization is enforced by **Supabase RLS policies** evaluated
against `auth.uid()` from the Supabase session. The browser holds an anon
key and queries Postgres *directly*; RLS is the only thing standing between
a user and other users' rows.

Migrating to Neon (epic #102) breaks this model in two ways:

1. `auth.uid()` disappears — there is no Supabase session to source claims
   from (ADR-0008 replaces the session layer).
2. **The browser can no longer hold database credentials at all.** Neon has
   no anon-key equivalent; its drivers are server-side. This is a structural
   change worth stating plainly: *every* query must route through the
   Next.js server layer regardless of which authorization option is chosen.
   RLS therefore cannot be the *primary* enforcement point after migration —
   at best it is defense-in-depth.

### Current data surface (from `supabase.from(...)` call sites)

18 tables are touched from browser code. Grouped by sensitivity:

| Group | Tables | Today's protection |
|---|---|---|
| Public read (marketplace/stats) | `invoices`, `financing_offers`, `position_listings`, `price_history`, `protocol_stats`, `contract_state_snapshots` | Select-all policies; writes party-scoped |
| Per-user private | `user_profiles`, `lender_preferences`, `notifications`, `alert_configs` | `auth.uid()`-scoped policies |
| Coordination / security-sensitive | `pending_transactions`, `transaction_approvals` (multisig signature store — ADR-0006), `encrypted_messages`, `fractionalization_records`, `fractional_positions`, `dividend_distributions`, `invoice_documents` | Party-scoped policies; document access limited to invoice parties |
| Operational | `health_metrics`, `audit_log`, `reminder_configs` | Admin-gated writes (`role = 'admin'` RLS) |

Service-role use is narrow: only the SEP-10 verify route
(`app/api/auth/sep10/verify/route.ts`, the replay guard) uses the admin
client.

**Inventory gap:** `docs/06-supabase.md` documents policies for ~5 tables;
the live project's `pg_policies` must be exported and reconciled against the
table list above before implementation starts. The gap is expected — several
tables (notifications, multisig, encrypted_messages) were added without doc
updates.

## Decision

**Option 3 — Hybrid: server-layer authorization as the primary gate, RLS
retained on the four most security-sensitive tables.**
Chosen 2026-09-08.

1. **Primary gate: server layer.** All authorization checks live in server
   actions / route handlers, where ADR-0008's session identity is available.
   The data-access layer exposes only session-aware helpers; there is no
   path for an unauthenticated query to reach the database.
2. **RLS retained (defense-in-depth) on exactly four tables:**
   `encrypted_messages`, `pending_transactions`, `transaction_approvals`,
   and `audit_log`. These are the worst-breach tables — encrypted private
   messages, the multisig signature store, and the tamper-evident audit
   trail. For these, every query runs through a wrapper that sets per-request
   user context (`SET LOCAL` on the Neon transaction-mode pooler) so the
   database still refuses unauthorized rows even if a server check is
   missed.
3. **Admin gate:** `reminder_configs` writes are gated in the server layer
   by a role claim (admin), mirroring today's `role = 'admin'` RLS policy.
4. **Guardrail for future endpoints:** the data layer provides a typed
   helper (`requireUser`, `requireRole`) and the PR checklist (updated in
   `docs/09-contributing.md`) requires an authorization check on any new
   data-touching endpoint. A CI lint rule is a follow-up, noted in the
   backlog, not a blocker for this decision.

**Rejected:**
- **Option 1 (port RLS 1:1, per-request context everywhere)** — rejected:
  because Neon forces server-side queries anyway, RLS can no longer be the
  primary gate, so paying its full complexity cost (context wrapper on every
  query, silent-failure debugging) buys little. Retained only for the four
  tables above, where the second line of defense is worth it.
- **Option 2 (server layer only, drop RLS)** — rejected: `audit_log` and the
  multisig signature store would lose their second line of defense, and a
  single missed check on `encrypted_messages` would be a full data breach.
  The hybrid keeps defense-in-depth exactly where a breach is worst.

### Evaluation checklist (verdicts)

- [x] Policy inventory exported from live Supabase and reconciled with the
      table list above — **required before implementation starts**, tracked
      in #377
- [x] Automated unauthorized-access tests for `notifications`,
      `encrypted_messages`, `pending_transactions`, `reminder_configs` —
      the #377 DoD floor
- [x] Admin gate for `reminder_configs` — role claim in the server layer
- [x] Multisig signature store confidentiality — server check **and** RLS
- [x] Connection strategy — Neon transaction-mode pooler + `SET LOCAL`
      context for the four RLS tables
- [x] Guardrail for future endpoints — typed `requireUser`/`requireRole`
      helpers + PR checklist; CI lint rule as follow-up

## Consequences

Known regardless of choice:

- All ~100 `supabase.from(...)` call sites across 18 tables are rewritten
  against the new data layer (shared work with #102's storage swap).
- `SUPABASE_SERVICE_ROLE_KEY` semantics become a single server-side DB role;
  scoping roles per feature (keeper, indexer, health-collector) is a
  follow-up, noted here so it isn't lost.
- `docs/06-supabase.md` is replaced (per #102) and its policy section
  becomes the server-check map plus the four retained RLS policies.
- Contributor guidance states the authorization convention explicitly —
  this ADR is that document.

Per chosen option:

- Two authorization models exist, but the RLS subset is bounded to four
  tables and implemented once in a single wrapper — contributors only learn
  the server-layer convention for new work.
- The four retained policies need per-request context plumbing; a forgotten
  `SET LOCAL` on those tables fails loudly in the unauthorized-access tests.
- The audit log keeps its tamper-evidence property against server bugs.

## References

- Issue #377 — this decision's parent
- Epic #102 — Supabase → Neon migration
- ADR-0008 — authentication layer for the Neon backend (provides the
  session identity this authorization model consumes)
- ADR-0006 — multisig approval (defines the sensitivity of
  `pending_transactions` / `transaction_approvals`)
- `docs/06-supabase.md` — current (partial) policy documentation