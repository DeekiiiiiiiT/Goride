# Give Cursor this — Log service parts gaps, Slice C, Round C-Server

You are building **Slice C, Server layer only** of `docs/log-service-parts-gaps-audit.md` (Rev 5.1). Read first; they are the spec:
- section 6 (Slice C): LC-01 … LC-09, "Decision — where a planned job lives", Rules 1–5, done-tests C1–C7
- section 2 (gates), especially 1, 3, 6 and 7
- the Data round you can build on: `supabase/migrations/20261119012823_log_service_parts_that_fit.sql` (`fleet_plan_job`, `fleet_open_found_work` new keys, `fleet_parts_notices` read state + `fleet_parts_notices_mark_read`, `catalog_resolve_request_group`) and its checks file

Do **not** build any screen (Fleet or Dominion) or change any `apps/` code. Claude builds the screens next. Do not change any migration; if you think SQL must change, stop and say why.

The working tree has many uncommitted changes. Keep them: never revert, reformat or stash anything.

All new Log-service behaviour is behind the switch `FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS` (per company, `isFeatureEnabled`). Switch off = today's answers, byte for byte.

## What to build

### S1. Find parts knows the oxygen-sensor places (LC-07)
`supabase/functions/_fleet-server/parts_finder.ts`:
- Today `axis()` keeps only `front | rear | both` and turns `before_cat` / `after_cat` into "no place", and `keepForPosition` lets "no place" fit everywhere. So a Front search also returns the rear sensor.
- Carry the listing's place as it is when it is one of the place codes in `packages/types/src/partPositions.ts` (import that list; never copy it). Keep `front | rear | both` working exactly as today for wheel and axle parts.
- New optional finder input `placeCodes: string[] | null` (the job's place codes, e.g. `["before_cat"]`). When given and not just `["unknown"]`: keep a part when its place is blank / `both`, or is one of the codes. `["unknown"]` or none → no place filter.
- `GET /make-server-37f42386/parts/find` (`fleet_find_parts_routes.ts`): new optional query `places=before_cat,after_cat` (comma list). Validate it with the same rule as the save (`positionCodesProblem` for the job); a bad code → 400 `position_invalid`. It feeds `placeCodes`. Old callers (no `places`) get today's answer unchanged.
- Each returned part gets `fitLabel`: `"check_before_buying"` when `status = 'needs_checking'`, else `"made_for_car"` for tier 1, else `"also_fits"`. Do not remove any existing field.
- Unit tests in `parts_finder.test.ts` (or a new `parts_finder_places.test.ts`): a before_cat listing, an after_cat listing and a blank one → `["before_cat"]` keeps before_cat + blank; `["after_cat"]` keeps after_cat + blank; `["unknown"]` keeps all three; front/rear wheel filtering unchanged; `fitLabel` for the three cases.

### S2. "Has Roam been asked?" on the Find parts answer (LC-02)
In the same `GET /parts/find` answer, when the car is linked and `componentId` is given, add:
```
ask: { state: "none" | "looking", askedAt: string | null, byYou: boolean }
```
- Build the v2 key exactly as a new ask would (`researchGroupKeyFromRow` with the car's catalogue id, the job, the places as `position_codes` with the job's `position_scheme`, no part number, no name).
- `looking` when any company has an `add_part_info` request with that key in `open` / `in_progress`; `askedAt` = the earliest `created_at`; `byYou` = this company has one.
- Never return organisation ids, names or counts (gate 3).
- `POST /parts/request` stays as it is. Prove with a test that an ask for car · job · `["after_cat"]` and the `ask` read for the same three give the same key (so the panel turns to "Roam is looking" right after the tap).

### S3. Plan a job (LC-05)
New route in fleet-ops, next to the found-work routes in `maintenance_routes.ts`: `POST /maintenance-planned-jobs`, body `{ vehicleId, jobId, places?: string[], partId?: string|null, note?: string, idempotencyKey }`.
- Same auth and permission as saving a service. Switch off → 404 `{ code: "log_service_parts_gaps_off" }`.
- The car must be this company's (`filterByOrg` / `recordVisibleToOrg` rule) → else 404.
- `partId` given → it must fit the car: the same rule as items (`verifiedCarForVehicle` + `partFitsCatalogIds`) → else 400 `line_part_not_for_car`.
- Call `fleet_plan_job`. Map its exceptions: `position_invalid` → 400, `vehicle_not_found` / `job_not_found` / `part_not_found` → 404, `actor_required` → 401.
- Answer `{ workOrderId, lineId, created, alreadyListed }`.
- `GET /maintenance-found-work` (and the counts route) must pass the new keys `source`, `partId`, `partName`, `partBrand`, `partNumber` through unchanged. Check the mapping; add them if it picks keys.

### S4. Planned work orders stay out of everything else (Decision)
A `planned` work order is never a service. Make every read and write respect that:
- `GET /maintenance-work-orders` with no `status`: never returns `planned` (Fleet's service history and Work orders tab call it this way). `status=planned` asked explicitly → allowed.
- By id, a `planned` work order: `PATCH` (any edit or status change) → 409 `{ code: "planned_job", error: "This job is on the Not done yet list. Use Log it now or Not needed." }`; `POST …/complete` → same 409 before claiming; `POST …/void` → same 409. `GET` by id still works.
- Grep every read of `maintenance_work_orders` and every SQL view or function the server calls that lists services, spend, odometer, due items, KPIs or history (start with `rg -n "maintenance_work_orders" supabase/functions/_fleet-server` and the `status` filters you find). In your report, list each one with "already excludes planned because …" or "fixed: …". Nothing that counts money, mileage or services may include `planned`.
- **Log it now** from a planned line is today's found-work path (`fromFoundLineId`); the link guard already checks same company and car. When the completed service's line has `from_found_line_id` = the planned line, the planned job leaves the list (proven in SQL). The planned work order itself stays `planned` (never completed).

### S5. A chosen part on a saved job must fit the car (LC-01)
When a line in a save (create, PUT, PATCH, complete) has `partId`, the part must fit the car (same rule as S3) → else 400 `line_part_not_for_car` with the line's job name. A saved line that sends back the `partId` it already has is not re-checked (same "unchanged lines re-save" rule as positions, gate 7). Only when the switch is on.

### S6. Parts messages for the bell (LC-03, LC-08)
In fleet-core, next to the Find parts routes (`fleet_find_parts_routes.ts`), same `view` permission:
- `GET /make-server-37f42386/parts/notices` → this company's notices, newest first, at most 30: `{ items: [{ id, kind, title, body, createdAt, read, carLabel, jobId, jobName, places }] }` and `unreadCount`. `carLabel` from `vehicle_catalog` (make model year) when `vehicle_catalog_id` is set; `jobName` from `maintenance_service_categories`. Never another company's rows.
- `POST /make-server-37f42386/parts/notices/read` body `{ ids: string[] }` → `fleet_parts_notices_mark_read`; answer `{ marked }`. Ids of another company are ignored (the SQL already scopes).
- The not-found path (`notifyFleetsRequestOutcome`) also fills `vehicle_catalog_id`, `maintenance_component_id`, `position_codes` from the group's first request.

### S7. Dominion "Added — pick the part" (LC-09)
In `pending_parts_catalog_routes.ts`:
- `GET …/parts-queue/:groupId/candidates` → the catalogue parts that could answer this ask: parts for the group's car (`vehicle_catalog_id`) and job, with the group's places, using `findParts` with `placeCodes` from S1. Answer `{ items: [{ partId, name, brand, number, place, fitLabel }] }`. Staff guard + `catalog.read`. Legacy groups (`legacy:`) → `{ items: [] }`.
- The `PATCH …/parts-queue/:groupId` action `added` (today it answers 400 "Use promote proposal instead") now takes `{ action: "added", partId }`: staff guard + `catalog.write`; legacy group → 400 `legacy_group`; missing `partId` → 400; call `catalog_resolve_request_group(groupId, partId, actorId)`; `part_not_found` → 404. Answer `{ ok: true, resolved, companies }`.
- Never return organisation ids, names or counts (gate 3); keep `stripPii` on everything.

### S8. Tests and builds
- Deno unit tests for S1–S7 (finder places + fitLabel, ask key equality, plan route mapping + switch off + part-not-for-car, planned 409s and list exclusion, line part fit + unchanged re-save, notices scoping, candidates + added action incl. legacy and part_not_found). Run them with `deno test --no-check --allow-env --allow-read --allow-net --node-modules-dir=none <files>` (never without `--node-modules-dir=none`: it breaks the local apps).
- Re-run, unchanged and still passing: `maintenance_completion.test.ts`, `log_service_unknown_parts.test.ts`, `parts_sourcing_drain.test.ts`, `log_service_positions.test.ts`, `inspection_findings.test.ts`, `catalog_research_intake.test.ts`, `service_items_save.test.ts`, `pending_parts_catalog_routes.test.ts`, `fleet_find_parts_routes.test.ts`.
- Rebuild the bundles: `node scripts/build-edge-bundle.mjs fleet-ops` and `node scripts/build-edge-bundle.mjs fleet-core`, then `node scripts/edge-route-manifest.mjs --all` and `--all --check` (keep the manifest files only if routes changed, not just the timestamp).
- Local database only. Never call or deploy anything live.

## Report back
Links only: every file you changed or added, the S4 list (each read → "already excludes" / "fixed"), and the test output lines (passed / failed counts). Say plainly if anything failed or if you had to guess.

Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
