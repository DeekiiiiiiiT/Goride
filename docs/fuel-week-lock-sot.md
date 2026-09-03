# Fuel week lock — single SoT (Recon ↔ Expenses)

**Gate:** Do not ship SQL-only Completed UI until `to_regclass('public.fuel_reconciliation_period')` is non-null on GoRide.

## Problem

Consumption Reconciliation **Completed** and Expenses **Fuel Status Finalized** used different “done” signals:

| Surface | Wrong / old SoT | Correct SoT |
|---------|-----------------|-------------|
| Recon Completed | Every spend vehicle has a KV `finalized_report` (`allFinalized`) | `fuel_reconciliation_period` locked |
| Expenses Finalized | (after sync) `fuel_status === finalized` from SQL lock | Same SQL lock |
| Money columns | Ledger / snapshots | Unchanged — money ≠ week closed |

**Prod gap:** `fuel_reconciliation_period` never applied on GoRide because migration version `20260902120000` collided with `dispute_resolution_unification` (dispute won). Landing therefore Completes from snapshots while Expenses stays Pending (`fuel_status = n/a`).

**Do not** re-trust `fuel_finalized` alone for Expenses badges — that reopens the original bug.

## Deploy order

1. Migrations (create period tables + RLS)
2. Deploy fleet-server (lock → rebuild Expenses)
3. Frontend (Completed === SQL lock only)
4. `POST /fuel/periods/backfill` then rebuild driver periods
5. Cert: Aug 17–23 Finalized in Expenses; Outstanding weeks not Finalized

## Wave 4 catch-up (GoRide)

- `fuel_reconciliation_period` created (migration collision fixed).
- Aug 17–23 locked in SQL; driver week `fuel_status = finalized`.
- Do **not** blind-lock every `finalized_report` week (Outstanding weeks can still have snaps). Prefer `POST /fuel/periods/backfill` with `{ weekStarts: ["YYYY-MM-DD"] }` for closed weeks only.

---

## Closeout unification (staging → lock → money)

1. **Staging vs closed:** Finalize may stage driver `finalized_report` snaps; week is closed only when `fuel_reconciliation_period` is **locked**.
2. **Money:** Wallet settle + SQL fuel ledger events post **only on lock** (not per-driver stage). Partial finalize must not leave orphan money.
3. **Expenses before lock:** show **estimates / staged** (tilde), not solid posted fuel $; Finalized badge only when `fuel_status === finalized`.
4. **Unexplained:** dollar residual stays on the period. Open gap = rose “Unexplained $X”. After review or lock with residual = neutral “Accepted unexplained $X”. Accept never silently zeros leftover.
5. **Never** map money-posted events alone → Expenses Finalized.
6. **Legacy** `POST /finalized-reports`: stages KV only unless the week is already locked (heal path may post ledger).

## PO cert checklist

1. Outstanding week: estimate/staged $, status Pending/In Progress, open Unexplained if any.
2. Accept gap → Accepted unexplained; still not Finalized.
3. Finalize/lock → solid $, Finalized, Completed tab.
4. Reopen → money reversed, not Finalized, leaves Completed.
5. Toll Status unchanged.
6. Auto-close: residual without review still skipped; with review can lock and post money.
