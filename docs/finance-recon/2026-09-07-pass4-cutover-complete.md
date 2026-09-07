# Pass 4 cutover complete — 2026-09-07

**Project:** GoRide (`csfllzzastacofsvcdsc`)  
**Org:** `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`  
**Driver:** `73e5b1dc-01b4-45ee-a34a-25a3256b9841`  
**Flag:** `PROJECTION_READS_WEEK_STATEMENTS=true` (Supabase secret set)

## Gate result: **PASS**

Re-shadow (`scripts/shadow-week-statements.mjs --since=2026-08-10 --org=…`):

| Metric | Value |
|--------|------:|
| Periods | 4 |
| Clean weeks | 4 |
| Drift fields | 0 |
| Missing lanes | 0 |

Artifact: `docs/finance-recon/2026-09-07-shadow-week-statements.json`

## What we did

1. **Thawed** frozen Aug 24 DFP (close had locked stale columns) with audit metadata `pass4-shadow-align-rebuild`.
2. **Rebuilt flag-off** first — engines still disagreed with standing seals (fuel consumption_strip vs DFP fuel path; toll spend/reimbursed).
3. **Set** `PROJECTION_READS_WEEK_STATEMENTS=true` and **rebuilt** Aug 24 + Aug 31 — projection sources show `week_statement` for fuel/toll/fares; Aug 24 money now matches standing closed seals.
4. **Published** closed zero toll statement for Aug 31 (`zero_activity_na`) so the toll lane is not missing.
5. **Code:** `sealTollWeek` now publishes closed $0 statements for zero-activity weeks (future N/A weeks).

## Residual note

Flag-off rebuild alone cannot make Aug 24 fuel match `fuel_week_seal:consumption_strip`. Cutover path **(b)** from the first shadow report is the accepted residual: statements are SSOT on rebuild when the flag is on.

Aug 24 remains **unfrozen** after thaw (no re-sign in this pass). Re-run Close Week for that week when you want a new freeze hash on the statement-backed totals.
