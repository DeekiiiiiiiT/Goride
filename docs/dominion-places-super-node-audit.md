# Audit: Dominion Places (Super-Node register)

**Rev 3 · 2026-10-28 18:45 UTC** · Status: **Built and mostly live. 1 Critical open: fix it before the next fuel fill.** · Project `csfllzzastacofsvcdsc`

The owner implements; this doc is audit only. It lists open items only. The design and the history are in Rev 2 (git history of this file).

## Verified done (production, 2026-10-28)

All 7 places migrations are applied (`20261028121805` … `20261028175000`). `places.migration_health` returns **0 rows**.

| Area | Proof |
|---|---|
| Register | 216 places = 204 gas stations (56 verified, 148 pending) + 12 toll plazas. 2 vendor rows archived. |
| Ids | 0 fuel fills point at a missing place |
| Public map | `public_place` holds 56 gas stations + 12 tolls. The `public_station` view returns 56. All pins are `unchecked`, so none were lost (P1). |
| Taxonomy | 5 groups, 16 categories, 17 place types (incl. Pharmacy), 44 facility types, 7 brands (Rubis/RUBIS merged) |
| Data clean-up | 0 duplicate names, plus code on every place, `"active"` amenity dropped, dangling learnt refs cleared |
| Old tables → views | `fleet.stations`, `fleet.toll_plazas` and `station_merchant_aliases` are views with write triggers. Fleet writes go through `fleet.upsert_master` → `places.apply_station_row`. |
| Search | `places.nearby` and `places.search_facility` are live. Plug `/pins` uses `nearby`. Plug search and taxonomy come from `platform-catalog /places/*`. |
| Security | RLS is on for every `places` table, with no anon or authenticated grants |
| Tests | Matcher, parity and toll replay: 10 passed. Plug `tsc` 0. |

## Open

**R1 · Critical: a GPS match saves a stripped-down copy of the station over the real one.** Live in `fleet-fuel` v136 since about 17:55 UTC.
- Evidence: the new pool builds stations with `fuelStationFromNearbyRow`, which sets `brand: ""` and `address: ""` and has no parish, phone, website or stats history ([fuel_station_match.ts](../supabase/functions/_fleet-server/fuel_station_match.ts)). On a match, `bumpStationPriceStats(matchedStation)` then `deps.set("station:"+id, matchedStation)` (around line 414) writes that copy through `apply_station_row`. The next matched fill will:
  - wipe the station's brand, address, parish, phone and website
  - replace its saved payload
  - reset a `confirmed` pin to `unchecked`
  - leave the fill's `stationAddress` blank
- No fill has arrived since the deploy (checked 18:43 UTC), so nothing is damaged yet.
- Fix: right before the bump, load the full record with `const full = (await deps.get(\`station:${matchedStation.id}\`)) ?? matchedStation;`. Bump, save and read the address from `full`. Add a test in `fuel_station_match.test.ts`: "a GPS match writes back the full station (brand and address unchanged)". Redeploy `fleet-fuel`.
- Check after the next matched fill: `select name, brand_id, address, parish, pin_state from places.place where id = '<matched id>'` is unchanged.

**R2 · Medium: every Fleet save turns the default geofence into a fixed one.**
- Evidence: the `fleet.stations` view sends `geofenceRadius = coalesce(geofence_m, type default, 150)`. `apply_station_row` stores that value back as `geofence_m`. The 149 places that use the type default become fixed at 150 m the first time Fleet saves them, and the register then shows "override".
- Fix: the view sends `'geofenceRadius', p.geofence_m` (no coalesce; `jsonb_strip_nulls` already drops it when null). The matcher's 150 m fallback stays.

**R3 · Medium: a Fleet save un-rejects a place.**
- Evidence: `apply_station_row` maps every status other than verified, learnt, pending and closed to `pending`. A gas station marked `rejected`, `duplicate` or `anomaly` in the register goes back to `pending` the next time Fleet saves it (status-migration, auto-heal or bulk routes).
- Fix: add `rejected`, `duplicate` and `anomaly` as pass-through cases in the status `case`.

**R4 · High: no proof yet that matching gives the same results on real fills.**
- Evidence: [fuel_station_match_places_parity.test.ts](../supabase/functions/_fleet-server/fuel_station_match_places_parity.test.ts) uses 4 hand-picked fills, not the replay of all real fills the plan asked for. A rough production check (nearest place inside geofence + 50 m) of the 264 `gps_smart_matching` fills found:
  - 257 land on the same station
  - 3 land on a different station
  - 4 find no station
- Fix: export every fill that has GPS and a station (`id, lat, lng, accuracy, matchedStationId, verificationMethod`) plus all places to a JSON fixture. The test replays `findMatchingStationSmart` over it with the real accuracy and expects the stored station for `gps_smart_matching` and `gps_handshake` fills. Each mismatch is listed in the fixture with its reason (alias, near-miss, later admin move). Keep it in `ci.yml`.

**R5 · Medium: Plug's hard-coded kinds are still in use.**
- Evidence: `PLACE_KINDS` drives the Plug home grid ([ServiceGrid.tsx](../apps/plug/src/live/ServiceGrid.tsx)) and the Dominion pin review type picker ([PlacesReview.tsx](../packages/platform-ops-ui/src/places/PlacesReview.tsx)). The `place_capability` table (0 rows) and its kind CHECK still exist.
- Fix: both screens build their options from `/places/taxonomy`. Then delete `PLACE_KINDS` and drop `place_capability` in the retirement step (R7).

**R6 · Low: 2 new type errors in Dominion.**
- Evidence: `admin tsc`: [PlaceEditor.tsx:142](../packages/platform-ops-ui/src/places/PlaceEditor.tsx#L142) and [PlacesInbox.tsx:96](../packages/platform-ops-ui/src/places/PlacesInbox.tsx#L96), both "Property 'message' does not exist on type '{}'". The admin total is 19.
- Fix: read the error as `error instanceof Error ? error.message : String(error)`.

**R7 · Low: retirement is blocked by readers of the old tables.**
- Evidence: Fleet still reads stations through the `fleet.stations` view (`listStationRecords` in `fleet_table_read_thru.ts`). [places_phase8_retire.sql](../scripts/sql/places_phase8_retire.sql) is a locked placeholder.
- Fix: point `listStationRecords` (and the toll loader's first read) at `places.place`. Then, after 14 days with 0 reads on the views (`pg_stat_user_tables` / API logs), drop:
  - `fleet.stations`, `fleet.toll_plazas`, `public_station` and `station_merchant_aliases`
  - the `station_id` columns on the price tables
  - `place_capability`

## Ship order

1. Fix R1, then R2 and R3. Redeploy `fleet-fuel`.
2. R4 replay test passes in CI.
3. Fix R5 and R6.
4. Commit. Nothing is committed yet: 19 modified + 23 new files, mixed with an unrelated `docs/unified-ledger-disk-io-audit.md` change, so commit it separately.
5. Deploy:
   - `fleet-toll`, still v94 from 03:44 UTC, so the new toll loader isn't live. That's harmless meanwhile, because the view still works.
   - Dominion admin
   - Plug (both frontends are built from the uncommitted tree, so the new screens aren't live).
   - `explorer` v19, `platform-catalog` v145 and `fleet-fuel` v136 are already deployed from the working copy, so redeploy them after the commit.
6. R7 after 14 quiet days.
