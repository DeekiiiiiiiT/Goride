# Phase 6 — Flawless Weekly Close: performance notes (2026-09-07)

Shipped in this PR (high-impact, low-risk):

1. **Week bucketing in the rebuild context** (`supabase/functions/_fleet-server/driver_financial_periods.ts`)
   - New `bucketByWeekKey()` helper pre-buckets arrays into `Map<weekKey, T[]>` using
     `periodKeyFor(fleetCalendarDay(date))` — identical to the old `d >= anchor && d <= end` range test.
   - `loadRebuildContext` now attaches `tollsByWeek`, `allTollsByWeek`, `chargeTxByWeek`,
     and `fuelReportsByWeek`. `rebuildDriverFinancialPeriod` does an O(1) Map lookup per week
     instead of re-filtering the full ledger for each of W weeks (was O(W×N)).
   - `rebuildDriverFinancialPeriod` documents that multi-week callers MUST pass a shared `ctx`.
     New `rebuildOneDriverPeriod(driverId, anchor, ctx?)` wrapper loads ctx once when missing.

2. **Settlement queue fail-closed org scope (M-4)** (`settlement_commands_controller.tsx`)
   - `GET /queue` now returns `400 ORG_REQUIRED` when `organizationId` is missing instead of
     running the period list queries unscoped (which leaked every tenant's rows). `/movements`
     already fails closed; the mutate endpoints already use `requireOrgId`.

3. **Client scroll throttle** (`apps/fleet/src/components/fleet-financials/settlements/useWindowedRows.ts`)
   - `setScrollTop` is now coalesced with `requestAnimationFrame` (one commit per frame),
     cancelled on unmount — removes per-wheel-tick re-renders on long settlement/reconciliation lists.

## Remaining KV → SQL migrations (follow-ups, intentionally NOT in this PR)

These are still full KV prefix scans loaded per driver context. Each should move to an
org-/driver-scoped SQL query (or materialized read model) in its own PR with a golden-parity check:

| # | Source (in `loadRebuildContext` / helpers)                | Current call                                   | Target |
|---|-----------------------------------------------------------|------------------------------------------------|--------|
| 1 | Toll ledger + linked trips                                | `loadAllTollLedgerWithTrips()`                  | SQL: `toll_ledger` join, driver+week scoped |
| 2 | Dispute / refund records                                  | `loadDisputeRefundRecords()`                    | SQL: `dispute_refunds` by driver |
| 3 | Finalized fuel reports                                     | `loadAllByPrefix("finalized_report:")`          | SQL: `fuel_reports` (status=Finalized) by driver |
| 4 | Claims                                                     | `loadAllByPrefix("claim:")`                     | SQL: `toll_claims` by driver |
| 5 | Earnings policies                                         | `kv.getByPrefix("earnings_policy:")`            | SQL: `earnings_policies` by org |
| 6 | Driver transactions (KV fallback path)                    | `kv.getByPrefix("transaction:")` in `loadDriverTransactionsForSettlement` | SQL: `settlement_transactions` mirror (flag already exists — retire KV fallback once backfilled) |

Notes:
- Item 6 already has a table read behind `settlementTxTableReadEnabled()`; the KV scan is the fallback.
  Retire the fallback after confirming the mirror is fully backfilled per org.
- Bucketing added here is safe to keep after migration — the maps just get built from SQL rows instead.
- Do each migration behind a projection flag with a `periodBaseline.golden` parity assertion so
  settlement/payout numbers can be diffed before cutover.
