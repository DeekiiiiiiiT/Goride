# Audit: Dominion Places (Super-Node register)

**Rev 7 · 2026-10-28 21:00 UTC** · Status: **Engineering items closed 28 Oct. Data work and the 12 Nov retirement are still open.** · Project `csfllzzastacofsvcdsc`

Remediation (28 Oct): the retirement script no longer drops Fleet's station or toll views. Coverage now counts each verified place once (live: 56 fuel and 12 toll verified, 148 fuel pending) after parish codes were filled from the pin. Evidence shows in Review. Imported stations use the Import chip, and fuel hand-review rows link to station resolution. Coverage rebuilds once per save, not once per row. Extra public grants are revoked. SQL checks, a Plug restroom journey, and a Dominion register check are in CI. The data steps are in [places-register-data-ops.md](places-register-data-ops.md). Do not run the retirement script before 12 Nov 2026. `places.migration_health` is empty. The health job is scheduled for 04:15 UTC and had not run yet at the time of this note. GitHub ran the fuel station and Places review tests green on 28 Oct. The rest of CI still stops on an older edge typecheck that is outside this Places work.

Audit only; the owner implements. This is a **full sweep**, not a re-check of the last round. It covers code, database, security, CI, deploys, both live sites, the screens planned in Rev 2, tests and data.

Already proven and not repeated here:
- Register, ids and the public map (56 stations + 12 tolls)
- R1 fix in `fleet-fuel` v139
- Live `platform-catalog /places/taxonomy` and `/places/search` (fuel near Half Way Tree returns stations)
- Dominion redeployed (hook fired 19:23)
- Plug live bundle uses taxonomy and search
- anon blocked from `places` (REST RPC → `permission denied for schema places`)

## A. Must fix before 2026-11-12 (the retirement script)

**1 · Critical: the script would break every Fleet station and toll read.**
- Evidence: KV reads of `station:`, `toll_plaza:` and `learnt_location:` go through [baseRepo.ts](../supabase/functions/_fleet-server/repos/baseRepo.ts). `fleetTable()` maps them to `public.fleet_stations` / `public.fleet_toll_plazas`, which are built on `fleet.stations` / `fleet.toll_plazas`.
  - That's about 49 calls, including R1's `deps.get`.
  - KV deletes go through the same views.
  - [platform-catalog/index.ts:139,157](../supabase/functions/platform-catalog/index.ts#L139) reads `public.fleet_stations`.
  - [places_phase8_retire.sql](../scripts/sql/places_phase8_retire.sql) drops them all.
- Fix: remove from the script the drops of:
  - `fleet.stations`, `fleet.toll_plazas`, `fleet.station_quality`
  - `public.fleet_stations`, `public.fleet_toll_plazas`
  - `stations_view_write()`, `tolls_view_write()`
  
  These are Fleet's permanent interface to `places`. Cut the 14-day log check down to `places.public_station` and `public.station_merchant_aliases`.

**2 · Critical: the script would break every place save.**
- Evidence: `places.refresh_coverage()` reads `places.public_station`. It runs from the triggers on `place`, `place_facility` and `price_current`. The script drops `public_station` but doesn't rewrite `refresh_coverage`, so after it runs, every place, facility, price and Fleet KV station save errors.
- Fix: the script (or a migration before it) rewrites `refresh_coverage()` to count only `places.public_place` (verified) and `places.place` (pending). This also fixes item 7.

## B. Release

**3 · High: the latest code isn't in git.**
- Evidence: 6 files are modified and uncommitted (`plug_public_price.ts`, `station_merchant_aliases.ts`, `tollPlazaLoader.ts` + test, `explorer/index.ts`, `places_phase8_retire.sql`), and `main` is 2 commits ahead of `origin`. The live functions were deployed from the working copy.
- Fix: commit (after 1–2) and push.

**4 · High: CI has never run the places tests.**
- Evidence: the `CI` workflow failed on every push since at least 2026-10-27. The latest failure (run 40753713241) is `ENOENT …/20260908220000_settlement_queue_sql_aggregates.sql` in the service-line parity step. That step comes before the Deno tests, so the replay, parity and toll tests listed in `ci.yml` have never run on GitHub. They pass locally (13/13). The fix is in the unpushed `4a512efe`.
- Fix: push, then confirm the next `CI` run is green **through** the Deno test step.

**5 · High: the edge deploy workflow is red.**
- Evidence: `Deploy Supabase Edge Function` fails with `FAIL fleet-core: routes.generated.json is stale (committed 675, actual 676)` (runs at 04:46 and 19:22). The repo bundle [fleet-core/index.ts](../supabase/functions/fleet-core/index.ts) still has the old toll loader (`.from("fleet_toll_plazas")`).
- Fix: run `node scripts/edge-route-manifest.mjs fleet-core` and `node scripts/build-edge-bundle.mjs fleet-core`, commit both, and redeploy `fleet-core`. Confirm the workflow goes green.

## C. Bugs

**6 · Medium: the Review inbox never shows evidence.**
- Evidence: [place_admin.ts](../supabase/functions/explorer/place_admin.ts) (`/admin/review`, evidence branch) selects `kind` from `places.place_evidence`. That column doesn't exist, and the error is discarded (`const { data } = …`), so the **Evidence** chip is always empty.
- Fix: select `id, place_id, note, origin_app, accuracy_m, created_at`, use `note || 'Evidence'` as the title, and return the query error instead of dropping it.

**7 · Medium: the coverage numbers are empty and would double-count.**
- Evidence: `places.coverage_count` has **0 rows**, so the Places home and Plug `/admin/coverage` show no coverage. When `refresh_coverage()` does run, it counts each verified station twice: as `station` (from `public_station`) and as `fuel` (from `public_place`).
- Fix: the rewrite in item 2, then run `select places.refresh_coverage();` once. Check that `coverage_count` sums to 56 fuel + 12 toll verified and 148 fuel pending.

**8 · Medium: the inbox is flooded with CSV imports, and fuel's hand review is missing from it.**
- Evidence: `/admin/review` lists all 148 pending CSV-imported stations under the **hand** chip. The fuel hand-review and provisional-fill items (`/admin/provisional-fills`) aren't in the inbox. Fuel added its own "Fuel places" sub-tab instead (`ResolutionQueueTab.tsx`). Rev 2 U2 (one inbox) is only half done.
- Fix: give pending rows with `legacy_payload->>'dataSource' = 'import'` the chip **import**. Add `/admin/provisional-fills` rows with `reason = 'HAND_REVIEW'` as chip **hand review**, linking to the fuel resolution screen.

## D. Hygiene

**9 · Low: views and functions have more permissions than they need.**
- Evidence: `public.fleet_stations` and `public.fleet_toll_plazas` grant anon **and** authenticated INSERT/UPDATE/DELETE/TRUNCATE. `public.station_merchant_aliases` grants authenticated the same. (These are `public` schema defaults.) `stations_view_write`, `tolls_view_write`, `alias_view_write` and `sync_price_place_id` are executable by anon. These are blocked today only because the views are `security_invoker` and anon/authenticated have no `places` usage.
- Fix: `revoke all on public.fleet_stations, public.fleet_toll_plazas, public.station_merchant_aliases from anon, authenticated;` and `revoke execute on function` those four functions `from public, anon, authenticated;`.

**10 · Low: coverage is rebuilt in full on every row change.**
- Evidence: `refresh_coverage()` deletes and rebuilds the whole table from the row-level triggers. A 1,000-row CSV import does 1,000 full rebuilds, and this database is sensitive to disk IO.
- Fix: move the `refresh_coverage()` call to `FOR EACH STATEMENT` triggers on `place` and `place_facility`, and keep `refresh_public_place` per row.

## E. Missing tests from the plan

**11 · Medium: no SQL checks for search and the public projection.**
- Evidence: there is no `supabase/tests/places_*_checks.sql`.
- Fix: add `supabase/tests/places_checks.sql` asserting:
  - `search_facility` returns attached plus `search_as_facility` places, verified only, ordered by distance
  - a pending or `offset` place is not in `public_place`
  - adding or removing a facility updates `facility_types`
  - every `place_type` / `facility_type` category exists
  
  Run it in `ci.yml`.

**12 · Medium: no browser tests for the new screens.**
- Evidence: `e2e/plug-journeys.spec.ts` doesn't cover facility search or the place facility page. No `e2e` spec covers Dominion's Places register, editor, inbox or categories.
- Fix:
  - Plug: search "restroom" → results sorted by distance → tap → place opens with `?facility=` highlighted → facilities grouped by L1.
  - Dominion: add one place of each type; the duplicate panel appears within the radius; Verify is blocked until the checklist passes.

## F. Data work (Dominion, no code)

**13 · Facilities are almost empty, so most searches return nothing.**
- Evidence: all 204 gas stations have **only** `fuel_pump`. Searching restroom or ATM near Half Way Tree returns `[]`.
- Fix: in the Places register, add the real facilities (restroom, ATM, air/water, convenience store…) to the 56 verified stations first.

**14 · Brands are missing.**
- Evidence: 99 gas stations have no brand. Recurring names include **Gulfstream (12)**, First (5), Jampet, Blaize, Tomijam, JamGas, G.A. Hamilton, MZ, Buds and Johnson's (2 each). 1 station is named TotalEnergies but has no brand.
- Fix: add those brands in **Categories → Brands**, then bulk-assign them.

**15 · The other 15 place types have no places.**
- Evidence: every place is a `gas_station` or `toll_plaza`. Mechanics, pharmacies, supermarkets and the rest are empty, and 0 Plug proposals are open.
- Fix: map them in the register, starting with the types Plug shows on its home grid (mechanic, parts store, tyres & air, car wash, restroom, roadside help).

**16 · The forms, the verification backlog and the pins.**
- Evidence:
  - 42 of 44 facility types and 10 of 17 place types have no `attribute_schema`, so their editor forms show no detail fields (hours, ATM bank, EV connector…).
  - 148 stations are still pending.
  - 0 verified pins are `confirmed`.
- Fix:
  - Write the attribute schemas in **Categories** (start with the gas station's hours and attendant, and the ATM's bank).
  - Work the pending queue.
  - Mark pins confirmed as stations are checked on site.

## G. Checks to run

- **After the next GPS-matched fill** (there have been none since 18:00 UTC): `select name, brand_id, address, parish, phone, pin_state, geofence_m from places.place where id = '<matchedStationId>'` is unchanged, and `geofence_m` is still `null` if it was before.
- **After 2026-10-29 04:15 UTC:** the `places-migration-health` cron shows `succeeded`, and `places.migration_health` returns 0 rows.

## Order

1. Items 1, 2, 6, 7 and 9 together in one migration + code commit.
2. Then 3, 4 and 5 (commit, push, CI green, fleet-core redeployed).
3. Then 8, 10, 11 and 12.
4. Data work 13–16 any time.
5. Retirement on or after 2026-11-12, with 14 clean days. Afterwards, stop sending `station_id` on price writes and redeploy `fleet-fuel` and `explorer`.
