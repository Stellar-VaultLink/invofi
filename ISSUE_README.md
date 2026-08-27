# Protocol Health Monitoring Dashboard

## Problem

InvoFi's public `/stats` page gives aggregate totals (total invoices, total volume,
repayment rate) but these are 6-hour snapshots from the indexer. There is no operational
view for protocol maintainers — no transaction success/failure breakdown, no contract
pause indicator, no alerting when the overdue rate spikes, and no audit trail of admin
actions. When something goes wrong on-chain, the only recourse is to manually query
Stellar Expert or grep GitHub Action logs.


Concretely:

- A lender watching their offer go stale has no visibility into *why* — is the overdue
  rate normal? Is the insurance pool healthy?
- An admin who ran `mark_overdue` or `resolve_dispute` leaves no in-app audit trail.
- There is no threshold mechanism to page someone when `overdue / financed > 15%`.
- Gas consumption and confirmation-time outliers are invisible.

---

## Solution Approach

### Architectural decisions

**No new always-on server.** The indexer already runs as a scheduled GitHub Action every
6 hours. We extend the same pattern: a lightweight GitHub Action (or Supabase Edge
Function) collects health metrics on a schedule, stores them in Supabase, and the
dashboard reads them. All hosting stays free.

**Admin role via `user_profiles.role`.** The existing `user_profiles` table already has a
`role` text column (`business | lender`). We extend the `CHECK` constraint to also allow
`admin` and add a server-side guard that redirects non-admin users to `/403`.

**Pure-SVG sparkline charts.** The codebase has no chart library. Rather than pulling in
`recharts` (adds ~300 KB to the bundle), we build a tiny reusable `<Sparkline>` SVG
component and a `<BarChart>` SVG component. They are sufficient for line trends and
distribution bars, and they have zero dependencies. If stakeholders later want richer
interactivity, `recharts` can be layered on top.

**Supabase tables as the metrics store.** Four new tables:
- `health_metrics` — one row per time bucket (hourly), with success/failure counts,
  avg confirmation time, and gas estimates. Written by the collector script.
- `contract_state_snapshots` — one row per 6-hour run, capturing invoice status
  distribution, pool utilisation, and position token supply.
- `alert_configs` — admin-managed threshold rules (e.g. `overdue_rate > 0.15`).
- `audit_log` — append-only log of admin actions taken through the app.

**Data collection via GitHub Actions.** The existing `indexer.yml` workflow is already
triggered on schedule. We add a companion `health-collector.yml` that runs hourly,
calls Soroban RPC `getEvents`, writes to `health_metrics`, and computes
`contract_state_snapshots`. The frontend dashboard is a pure reader — no server-side
API route required.

### File layout

```
src/
├── app/
│   └── dashboard/
│       └── health/
│           ├── page.tsx            ← main dashboard, admin-gated
│           └── layout.tsx          ← layout wrapper
├── components/
│   └── health/
│       ├── TxRateChart.tsx         ← SVG sparkline: success/failure rates
│       ├── ContractStateCards.tsx  ← KPI cards: invoices, pool util, overdue
│       ├── AlertConfigPanel.tsx    ← threshold editor
│       └── AuditLogViewer.tsx      ← paginated audit log table
└── lib/
    ├── health/
    │   ├── metrics.ts              ← Supabase read/write helpers
    │   ├── collector.ts            ← Soroban RPC event ingestion
    │   └── types.ts                ← TypeScript types for all health tables
    └── migrations/
        └── 004_health_monitoring.sql
```

### Implementation steps

1. **Migration** (`004_health_monitoring.sql`): create the four tables with RLS.
   Admin-only write on `alert_configs`; public read on `health_metrics` and
   `contract_state_snapshots`; authenticated read on `audit_log`.

2. **Types and helpers** (`lib/health/`): typed Supabase helpers for reading time-series
   data with a time-range filter (`1h | 24h | 7d | 30d`).

3. **Admin gate** (`components/health/AdminGuard.tsx`): wraps the page; reads
   `user_profiles.role` after auth check; redirects to `/403` if not `admin`.

4. **Chart components**: `<Sparkline>` (polyline SVG, responsive via viewBox),
   `<TxRateChart>` (stacked success/failure bars), both zero-dependency.

5. **Dashboard page** (`app/dashboard/health/page.tsx`): `<AdminGuard>` wrapper,
   time-range selector (tabs), four sections: KPI cards, transaction rate chart,
   alert config panel, audit log.

6. **Alert config panel**: reads `alert_configs`, lets admins set thresholds, writes
   back via Supabase insert/update. A separate `checkAlerts()` utility (called by
   the collector) evaluates thresholds and inserts into `audit_log` when breached.

7. **Audit log viewer**: paginated table of `audit_log` rows with filtering by action
   type and time range. Supports CSV export via the existing `toCsv / downloadCsv`
   helpers in `lib/csv.ts`.

8. **CSV export**: reuses `toCsv` / `downloadCsv` from `lib/csv.ts` with
   dashboard-specific column specs.

### Acceptance criteria mapping

| Criterion | Solution |
|---|---|
| `/dashboard/health` admin-only | `AdminGuard` checks `user_profiles.role = 'admin'`; redirects to `/403` |
| Real-time tx success rate chart | `TxRateChart` reads `health_metrics`, auto-refreshes every 60 s |
| Contract state summary cards | `ContractStateCards` reads `contract_state_snapshots` |
| Alert config panel | `AlertConfigPanel` reads/writes `alert_configs` |
| Audit log viewer | `AuditLogViewer` reads `audit_log` with pagination |
| CSV export | "Export CSV" button in both metrics and audit log sections |
| Time-range filtering | `TimeRangeSelector` controls a `since` timestamp passed to all queries |
| Responsive layout | Tailwind responsive grid identical to existing stats page |

### What is not included (and why)

- **Gas consumption** is not exposed by Soroban RPC's public API — `getTransaction`
  returns fee but not gas units. We track *fee* as a proxy in `health_metrics.avg_fee_stroops`.
- **WebSocket real-time push** is intentionally omitted (the live portfolio dashboard
  already covers that complexity). The health page polls on a 60-second interval, which
  is sufficient for operations monitoring without adding WebSocket infrastructure.
- **Recharts / charting library** is intentionally not added to avoid a large bundle
  dependency. The SVG approach is sufficient and auditable; a migration path to recharts
  is straightforward if ever needed.
