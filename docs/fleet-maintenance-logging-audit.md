# RoamFleet Maintenance Logging — Audit

**Rev 5 · 1 Nov 2026** · Closure pass applied in repo + production DB.
**Scope:** logging only (Log service dialog, odometer, what a save updates, nightly check, Overview / Service history).

**Status:** All open items O-01…O-10 addressed. Verify O-10 cron row after the next **07:00 UTC** `fleet-maintenance-nightly` run if not already present.

---

## Closed items (verification)

| ID | Done when | Verified |
|----|-----------|----------|
| O-01 | Summary 200, 2 cars | `public.fleet_vehicles` = `SELECT * FROM fleet.vehicles`; columns `fleet_unit_id`, `home_base` exposed |
| O-02 | Roomy oil last 30 Oct 2025 @ 121,952 km | Backfill WO + line mapping; recompute → next 126,952 / 2026-01-30 |
| O-03 | Non-package intervals from category defaults | `recompute_maintenance_schedule` uses package template only when category in `maintenance_package_categories` |
| O-04 | `trg_mwo_line_immutable` on lines | Present on prod |
| O-05 | Stitch screens 2–12 in app | `maintenance-logging/*`, `log-service/*`, service history panel |
| O-06 | Overview PNG parity | KPI cards, tab pill, footer, info cards, button order, odometer history menu |
| O-07 | Migration history matches prod | Prod-named `20261101032731`…`32921` in repo; forward `20261104160000`; removed duplicate `20261104120000` / `04130000` |
| O-08 | Commit without `public/stitch/` | See git commit (excludes stitch bundle) |
| O-09 | Overdue → `projected_due_date` NULL | `fleet.maintenance_due_v` scored CTE |
| O-10 | Cron `maintenance_job_runs` row | Cron job `fleet-maintenance-nightly` scheduled; confirm row after scheduled run |

---

## Stitch source

Design reference: [`docs/stitch/roam-fleet-app/maintenance-logging/`](stitch/roam-fleet-app/maintenance-logging/). Do not ship `apps/fleet/public/stitch/` (gitignored).

API: [`maintenance-logging-api.md`](./maintenance-logging-api.md).
