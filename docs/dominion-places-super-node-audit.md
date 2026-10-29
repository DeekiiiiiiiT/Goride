# Audit: Dominion Places (Super-Node register)

**Rev 8 · 2026-10-28 21:40 UTC** · Status: **Live. 5 engineering items + data work open. Retirement on or after 12 Nov.** · Project `csfllzzastacofsvcdsc`

Audit only; the owner implements. This doc lists open items only. Rev 8 is a full sweep:
- git and CI runs
- edge versions and the repo bundles
- migration history
- DB functions and grants
- the live API
- the Rev 2 UI and test plan
- data

All Rev 7 engineering items (1–12) were verified closed:
- the retirement script now keeps Fleet's views
- coverage counts are right (56 + 12 verified, 148 pending)
- statement-level coverage triggers
- grants revoked
- Review inbox evidence and the import chip
- commits pushed
- the edge deploy is green (`fleet-core` v174)

## Open: engineering

> Items 1 and 2 are now replaced by the Fuel Price Engine. See [fuel-price-engine-plan.md](fuel-price-engine-plan.md).

**1 · High: Plug can never show a fuel price.**
- Evidence: `places.latest_retail_estimate()` returns `null` unless `fuel.retail_price_markup` has a published row. That table has **0 rows**, so the estimate is `null` and [plug_public_price.ts](../supabase/functions/_fleet-server/plug_public_price.ts) holds every Fleet price. `price_current` has 0 rows, and 0 public places have prices. The only observation (27 Oct, J$39.07/L) was held. Petrojam data is current (2026-10-22, 87 = 201.81).
- No screen writes `retail_price_markup`. Dominion → Fuel → Prices only syncs Petrojam, and Fleet analytics only reads markups. (Rev 8 wrongly pointed at that screen.)
- The markup exists because Petrojam publishes the **wholesale** price, while drivers pay the **pump** price. The check only publishes a price that is at least 50% of the expected pump price and less than 18% above it. That is how it threw out the J$39.07 entry.
- Petrojam alone is close enough. Fleet fills since 1 Sep paid a median J$229.2/L against wholesale J$201.81 (+13.6%). With no markup, 71 of 75 fills pass. The 4 that fail are the J$39.07 entry and higher-priced fills that are probably diesel or 90, which item 2 fixes.
- Owner rule: every price is captured. A normal price goes public automatically. An outrageous one goes to a person in the Review inbox. Nothing is thrown away. Prices come from the driver's pump photo (Fleet calculates amount ÷ litres), and that flow is unchanged. The J$39.07 entry came from that flow, so this is exactly the misread the review catches.
- Fix:
  - The reference is the Petrojam wholesale price for the grade (no markup).
  - In `noteFleetPrice` and the Plug fill path, always insert the `price_observation`.
  - If the price is between 80% and 150% of wholesale, also write `price_current` (public).
  - Otherwise mark the observation `needs_review` and add it to the Places **Review** inbox under a new chip, **Price**. Approve writes `price_current`; Reject marks it rejected.
  - With no wholesale row for the grade, send it to review.
  - Replace the markup-based `plugPriceDecision` / `latest_retail_estimate` gate with this rule.
- Check: with today's Fleet fills (median J$229.2 vs J$201.81 wholesale), 74 of 75 publish and the J$39.07 entry lands in Review.
- Check after the next matched fill: a new `price_observation` with `in_band = true` and a `price_current` row for that station.

**2 · Medium: every Fleet price is filed as 87, even diesel.**
- Evidence: `noteFleetPrice` hard-codes `grade: "e10_87"`. Fills carry a grade in `fuelType` (25 rows) or `metadata.jaaFuelType` (73 rows).
- Fix: map `fuelType ?? metadata.jaaFuelType` to `e10_87` / `e10_90` / `diesel`, use it for the estimate and both writes, and skip the note when the grade is unknown.

**3 · Medium: the Evidence and Prices tabs on every place are always empty.**
- Evidence: `GET /admin/register/:id` in [place_admin.ts:151-153](../supabase/functions/explorer/place_admin.ts#L151):
  - selects `kind` from `place_evidence` (that column doesn't exist)
  - selects `updated_at` from `price_current` (the column is `observed_at`)
  
  Both errors are dropped (`{ data: evidence }`, `{ data: prices }`).
- Fix: select `id, note, origin_app, accuracy_m, created_at` and `grade, price_per_litre, observed_at`, and return any query error instead of an empty list.

**4 · Medium: the migration history doesn't match the repo.**
- Evidence:
  - Production has `20261028195252 places_phase6_health`, `20261028205022 places_coverage_grants`, `20261028205141 places_fill_pcode`, `20261028205221 places_fill_pcode_guard` and `20261028205603 revoke_io_daily_temp_bytes_anon`.
  - The repo has `20261028200000_places_phase6_health.sql` and `20261028210000_places_coverage_grants.sql` (which also holds the pcode fill), and no file for the IO revoke.
  - A `supabase db push` would try to re-run the two repo files.
- Fix:
  - `supabase migration repair --status reverted 20261028195252 20261028205022 20261028205141 20261028205221`
  - `supabase migration repair --status applied 20261028200000 20261028210000`
  - Add the IO revoke to the repo as `20261028205603_revoke_io_daily_temp_bytes_anon.sql` and commit.
  - `supabase migration list` then shows no differences.

**5 · High: the Places SQL checks and browser tests have never run.**
- Evidence:
  - [places_checks.sql](../supabase/tests/places_checks.sql) runs only in `parts-sql-checks.yml` (trigger: `pull_request`).
  - [dominion-places.spec.ts](../e2e/dominion-places.spec.ts) runs only in `dominion-places-e2e.yml` (`pull_request` / manual).
  - Work goes straight to `main`, so neither workflow has a single run.
  - In `ci.yml`, **Plug journeys** (which hold the restroom journey) were skipped on every run, because the earlier step **Deno check edge functions** fails. That step has 106 type errors, all outside Places (`week_close.ts` 47, `toll_controller.tsx` 42, the rest finance/recon).
- Fix:
  - Add `push: branches: [main]` with the same `paths` to both workflows.
  - In `ci.yml`, move **Typecheck Plug**, **Install Playwright browser** and **Plug journeys** above **Deno check edge functions**, as was done for the Places Deno tests.
  - Run both workflows once manually and confirm they're green.

## Open: checks

- **Next GPS-matched fill** (none since 18:00 UTC): `select name, brand_id, address, parish, phone, pin_state, geofence_m from places.place where id = '<matchedStationId>'` is unchanged, and `geofence_m` is still `null` if it was before.
- **After 2026-10-29 04:15 UTC:** `places-migration-health` shows `succeeded` in `cron.job_run_details` (it has no runs yet), and `places.migration_health` returns 0 rows.

## Open: data (Dominion, no code; steps in [places-register-data-ops.md](places-register-data-ops.md))

| Gap | Now | Do |
|---|---|---|
| Facilities | All 204 stations have only `fuel_pump`. Restroom/ATM search returns nothing. | Add real facilities, verified stations first |
| Brands | 99 stations brandless: Gulfstream 12, First 5, Jampet, Blaize, Tomijam, JamGas, G.A. Hamilton, MZ, Buds, Johnson's 2 each; 1 TotalEnergies | Add the brands, bulk-assign |
| Other place types | 0 places outside gas stations and tolls | Map the Plug home-grid types first (mechanic, parts, tyres & air, car wash, restroom, roadside) |
| Detail forms | 42/44 facility types and 10/17 place types have no attribute schema | Gas station (hours, attendant) and ATM (bank) first |
| Verification | 148 stations pending, 0 pins confirmed | Work the queue; confirm pins on site |

## Then, on or after 2026-11-12 00:00 UTC

Run [places_phase8_retire.sql](../scripts/sql/places_phase8_retire.sql) after 14 days with no errors from `places.public_station` or `public.station_merchant_aliases`. In the same release, stop sending `station_id` on price writes, and rebuild and redeploy `fleet-fuel` and `explorer`.
