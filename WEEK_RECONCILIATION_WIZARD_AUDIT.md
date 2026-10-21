# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 12 · 2026-10-22 · verification of working tree on `6327239c` (48 files uncommitted) + prod**
Open items only. Earlier revisions are in git history.

## Status

**No open code findings.** Nothing has changed in git or prod since Rev 11. The same four steps remain, and step 1 blocks the rest.

---

## Remaining

**1 · Commit and deploy (blocks everything below).**
- Still uncommitted: `driverPeriodSettlement.ts`, `driver_financial_periods.ts`, `coverageInputHash.ts`, the new `closeBlockerSteps.ts` + test, `recon_routes.ts`, the two recon UI files, and the migration rename to `20261021180000`.
- Prod `fleet-pay` **v58** still calls `cashHeldClampStamp(…adjCashBalance)`, which is the old code. Kenny's Oct 12 row is unchanged (`cashHeldClamped: true`, −3,221.23, last updated 2026-10-21 15:32).
- Commit, then redeploy **`fleet-core` and `fleet-pay`**.

**2 · Close Oct 12–18 through the wizard.** The lanes are already sealed (toll / fuel / earnings statements closed 2026-10-20/21).
1. **Refresh**, and expect `cashHeldClamped: false`, `unclampedCashHeld: 13970.65`.
2. **Pay** Kenny's $17,183.53 from the Settlement step.
3. **Close**, then check `recon.week_runs.state = 'closed'` and that the week shows as Completed.

**3 · One upload through the wizard.** `recon.import_staging` is still 0. Upload the Oct 19–25 toll CSV with "This file covers", then check that coverage equals the declared days and there's exactly one `toll_usage` per inserted toll.

**4 · After two wizard closes,** flip `SOURCE_ENFORCE=enforce` (`docs/recon-source-enforce-flip.md`).

---

## Noted (outside recon)

- The trip-analytics work has migration drift. Prod recorded `20261021192724 trip_analytics_public_api`, but the repo file is `20261021203000_…`. `20261021190000_trip_analytics_facts` isn't recorded in prod even though its `fleet.trip_analytics_*` functions exist. Repair before the next `db push`. Its `public` `SECURITY DEFINER` functions are correctly closed to `anon` / `authenticated`.
- The Oct 5–11 run is open (4 sources missing, $635.59 owed). Normal ops.
- Delivery stays behind its readiness card. Q2, Q3 and Q5 wait for it.
