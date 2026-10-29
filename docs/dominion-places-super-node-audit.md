# Audit: Dominion Places (Super-Node register) + Fuel Price Engine

**Rev 9 · 2026-10-29 03:00 UTC** · Status: **Register live and correct. Price engine live but only 4 prices publish: 3 engine bugs. CI blocked by 2 fixable checks.** · Project `csfllzzastacofsvcdsc`

Audit only; the owner implements. This is a full sweep:
- git and CI runs
- edge versions
- migration history
- DB functions and triggers
- the live sites
- the UI against the Stitch prompts
- data

Closed since Rev 8:
- item 3 (place Evidence and Prices tabs)
- item 4 (migration history matches production)
- item 5 (the Places workflows now run on `main`)

The price engine is built and deployed:
- 7 engine migrations
- `fleet-fuel` v144, `explorer` v28, `platform-catalog` v150, `petrojam-prices` v146
- the Dominion Price Engine tabs, including the station drawer
- Plug price states live on roamplug.app
- delete-my-data removes the user's reports (and the delete trigger recalculates)

## A. Price engine bugs (fix first: they stop prices publishing)

**1 · High: Fleet never reads the vehicle's grade, so half the reports have no grade.**
- Evidence:
  - 39 of 77 Fleet reports are `grade = unknown`, and 0 have `grade_source = 'vehicle'`.
  - Both Fleet vehicles are 87: `fleet.vehicles.vehicle_catalog_id` → `vehicle_catalog.fuel_grade = '87'`, and `5179KZ` also has `fuelSettings.fuelType = 'Gasoline_87'`.
  - But `catalogGrade()` in [plug_public_price.ts](../supabase/functions/_fleet-server/plug_public_price.ts#L71) and the backfill in `20261028230000_places_price_engine_functions.sql` (around line 905) look for `payload_json->>'vehicleCatalogId'` / `'catalogId'`, which don't exist.
  - Result: 53 reports in review, only 4 prices published, and the health view shows `outdated_share = 1.0` (every live price is from an older week, because the recent fills are stuck in review).
- Root cause (owner, confirmed in code): the driver app's fuel log has **no grade step**. `apps/driver/src` only has a `fuelType` type definition; no screen asks for it.
- Fix:
  1. **Driver app (Roam Fleet), fuel log:** add a grade step with large chips (E-10 87 | E-10 90 | Diesel | ULSD), pre-selected from the vehicle and changeable by the driver. Save it as `fuelType` on the fill. The pump photo step is unchanged.
  2. **Pre-select source:** read the vehicle's grade in this order: `fleet.vehicles.vehicle_catalog_id` → `vehicle_catalog.fuel_grade`, then `payload_json->>'vehicle_catalog_fuel_grade_hint'`, then `fuelSettings.fuelType`. `catalogGrade()` in `plug_public_price.ts` uses the same order as a fallback for fills saved without a grade.
  3. **The 39 old reports:** set their grade with **Change grade** in Price Engine → Review (both vehicles are 87), or in one pass by re-running `places.price_engine_check` after step 2. Then press **Recalculate all**.
- Check: `select count(*) from places.fleet_price_report where grade = 'unknown'` → 0, and `price_current` has prices dated this Petrojam week.

**2 · Medium: an unknown grade is also labelled "out of bounds".**
- Evidence: 40 reports carry `OUT_OF_BOUNDS`, but 39 of them are normal prices (J$221–250) whose only real problem is the missing grade. With no grade there's no Petrojam row, and the rule counts that as out of bounds (that was this plan's wording). Only the J$39.07 report is truly out of bounds.
- Fix: in `places.price_engine_check`, skip the bounds and big-change checks when the grade is `unknown`, so `GRADE_UNKNOWN` is the only reason. Add a new migration; don't edit the applied one.

**3 · Medium: fills are counted twice, and duplicates flood the review queue.**
- Evidence:
  - 19 reports come from gas-card statement rows (`Card_Transaction`). 18 of them carry `metadata.jaaMatchedDriverEntryId`, which points at a driver log that already has its own report. So the same fill counts twice.
  - The matching rule sends `DUPLICATE` to **review** (13 reports, e.g. FESCO Beechwood, 13 Oct 02:34, three rows). The plan meant "keep, don't count twice", not review.
- Fix:
  - At intake, don't create a report for a `Card_Transaction` whose `jaaMatchedDriverEntryId` already has one. Instead, if the driver's report has no grade, copy the statement's `jaaFuelType` onto it (`grade_source = 'statement'`).
  - Unpaired statement rows still report.
  - Give `DUPLICATE` its own status `duplicate` (kept, weight 0, not in review), and move the existing 13 to it.

**4 · Low: no "Fix and approve" on a review item.**
- Evidence: [PriceEngineReview.tsx](../apps/admin/src/components/admin/fuel-prices/PriceEngineReview.tsx) has Approve, Reject and Change grade, but not the "Fix and approve" from Stitch P3 (edit amount and litres, original kept beside them).
- Fix: add `POST /admin/prices/review/:source/:id/fix`. It stores the corrected amount and litres in `price_report_check.detail.corrected`, keeps the intake row unchanged, approves, and recalculates the place. The UI shows the original greyed next to the edit.

## B. CI: two checks stop everything after them

**5 · High: the Stitch check fails, so the price tests and Plug journeys are skipped.**
- Evidence: `ci.yml` step **Dominion Stitch contract** (run 40807657500) reports that `PlacesReviewQueue.tsx`, `PlacesReviewSplit.tsx`, `PlacesReviewMerge.tsx` and `PlacesReviewCoverage.tsx` are missing `// Stitch: dominion-redesign/<id>`. They have `// Stitch D1: docs/...html` instead. Every later step is skipped, including **Deno test price engine math** and **Plug journeys**.
- Fix: add these exact first lines (ids from `docs/stitch/dominion-redesign/README.md`):
  - Queue: `// Stitch: dominion-redesign/19c9df8ede1f4635be7f188be5c24f94`
  - Split: `// Stitch: dominion-redesign/6348f0f2c36149fa9bb2cc9e8fa39577`
  - Merge: `// Stitch: dominion-redesign/a87e5505779043e2a48a64a6f6266d2e`
  - Coverage: both `…/7da088e95e1e4fe088a2add010bf9bd3` and `…/53ad2876cac241b1aaceeb7bbc307045`

**6 · High: the Places and price SQL checks can't run on a fresh database.**
- Evidence: `Parts SQL checks` (run 40807657489) stops at `public gas stations changed: place 0 card 0`. [20261028173000_places_phase4_public.sql:451](../supabase/migrations/20261028173000_places_phase4_public.sql#L451) asserts exactly 56 public stations. That's true in production but 0 on the empty CI database, so `places_checks.sql` and `price_engine_checks.sql` never run. Any replay (`verify-migrations-replay`, a branch, local) fails the same way.
- Fix: wrap that assertion in `if exists (select 1 from places.place) then … end if;`. Production already applied this file, so the edit only affects replays. Then confirm `Parts SQL checks` is green.

**Note:** after 5, `ci.yml` will still stop at **Deno check edge functions** (106 type errors, all outside Places: `week_close.ts`, `toll_controller.tsx`, finance/recon). The Places and price steps already run before it.

## C. Checks to run

- **Next GPS-matched Fleet fill** (there have been none since 28 Oct 18:00 UTC):
  - its station is unchanged: `select name, brand_id, address, parish, phone, pin_state, geofence_m from places.place where id = '<matchedStationId>'`
  - a `fleet_price_report` row appears with a grade from the vehicle (after item 1), status `accepted`, and `price_current` updated for this Petrojam week
- **2026-10-29 after 05:00 UTC:** `places-migration-health` (04:15) and `places-price-engine-daily` (05:00) both show `succeeded` in `cron.job_run_details` (neither has run yet), and `places.migration_health` returns 0 rows.
- **After items 1–3:** `places.price_engine_health` shows `review_count` ≈ 1 (the J$39.07 report) and `outdated_share` well below 1.

## D. Data (Dominion, no code; steps in [places-register-data-ops.md](places-register-data-ops.md))

| Gap | Now | Do |
|---|---|---|
| Review queue | 53 reports (≈1 real once items 1–3 are done) | Reject the J$39.07 report (wrong reading) |
| Facilities | All 204 stations have only `fuel_pump` | Add real facilities, verified stations first |
| Brands | 99 brandless: Gulfstream 12, First 5, Jampet, Blaize, Tomijam, JamGas, G.A. Hamilton, MZ, Buds, Johnson's | Add the brands, bulk-assign |
| Other place types | 0 places outside gas stations and tolls | Map mechanic, parts, tyres & air, car wash, restroom, roadside first |
| Detail forms | Check in **Categories** after `places_register_forms` | Gas station (hours, attendant) and ATM (bank) first |
| Verification | 148 stations pending, 0 pins confirmed | Work the queue; confirm pins on site |

## E. On or after 2026-11-12 00:00 UTC

Run [places_phase8_retire.sql](../scripts/sql/places_phase8_retire.sql). It already includes `price_observation`, `in_band` and `latest_retail_estimate`. Run it after 14 days with no errors from `places.public_station` or `public.station_merchant_aliases`. In the same release, stop sending `station_id` on price writes, and rebuild and redeploy `fleet-fuel` and `explorer`.
