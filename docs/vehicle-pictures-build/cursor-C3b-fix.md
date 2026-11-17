# Give Cursor this — Round C3b fix (before C3c)

Claude reviewed C3b. The design is right: lease row, lanes, lookup order, guarded resurrect, attempts counted at the call, one-transaction `become_ready`, fill chaining, the BN1 cursor and the BN2 read. But **four bugs would stop pictures being made in production**, and the unit tests can't see them because they use fakes. Fix all of these.

**Settings store:** every vehicle-picture setting lives in the one KV row `vehicle_pictures:settings`, as before.

## 1. The routes are registered at addresses nothing calls (critical)
`supabase/functions/_shared/edgeKernel.ts` → `normalizeFleetCorePathname` rewrites every `/fleet-core/<rest>` request to `/make-server-37f42386/<rest>` **before** routing. So:
- the cron's `pg_net` call to `.../fleet-core/internal/vehicle-pictures/run` arrives as **`/make-server-37f42386/internal/vehicle-pictures/run`**
- the Fleet app's `${API_ENDPOINTS.fleetCore}/vehicles/:id/picture` arrives as **`/make-server-37f42386/vehicles/:id/picture`**

`vehicle_picture_routes.ts` registers `/make-server-37f42386/fleet-core/...` and `/fleet-core/...`, which never match: the worker and fill would 404 forever. Register exactly:
- `POST /make-server-37f42386/internal/vehicle-pictures/run`
- `POST /make-server-37f42386/internal/vehicle-pictures/fill`
- `GET /make-server-37f42386/vehicles/:id/picture`
- `POST /make-server-37f42386/vehicles/:id/color`

Make sure the two `/vehicles/:id/...` routes are registered **before** any existing `/make-server-37f42386/vehicles/:id` route that could swallow them (check `register_residual_monolith_routes.tsx` order; line 516 is where they're registered now).

## 2. The global login gate would block the cron calls (critical)
`inventory_controller.tsx` mounts `app.use("*", requireAuth({ strict: true }))` for the whole app. `requireAuth` in `rbac_middleware.ts` only lets machine callers through for listed paths (`/internal/seal-`, `/internal/activity/`, …). The cron sends `X-Fleet-Cron-Secret`, not a user token, so it would get 401 before reaching the route.

Fix: add `path.includes("/internal/vehicle-pictures/")` to that skip list, with the same comment style ("Machine callers… the route handler checks the cron secret or service role"). The routes keep their own `authorizeCronOrServiceRole` check.

## 3. The catalogue columns don't exist (critical)
`vehicle_picture_db.ts` → `getCatalogRow` selects `start_year, end_year` from `vehicle_catalog`. Those columns are **`production_start_year`** and **`production_end_year`**, so the select errors, the error is swallowed, the row is null, and every lookup returns `none`.

Fix:
- select with aliases: `.select("make, model, generation, body_type, trim_series, start_year:production_start_year, end_year:production_end_year")`
- **throw** on a real query error instead of returning null (a missing row still returns null)

## 4. The worker rebuilds the look and loses the facelift (bug)
`processOneRow` rebuilds a catalogue-like row with `trim_series = row.facelift_stage` ("pre_facelift"). `faceliftStage("pre_facelift")` returns `standard`, because the underscore defeats the `\b` regexes. So every pre-facelift car would be drawn without "pre-facelift styling".

Fix: build the `VehicleLook` straight from the stored row (`look_key`, make, model, generation, body_type, `facelift_stage`, start/end year, colour). **Never re-derive it.**

## 5. Row lease too short — the sweep can requeue a picture mid-call
Claims set `lease_until = now + 65 s`. A 50 s Imagen call plus the R2 put plus `become_ready` can pass 65 s; the minute tick's SQL sweep then requeues the row while it's still being made, so the picture is made twice.

Fix:
- claim with `lease_until = now() + 3 minutes` (as the audit says)
- keep the "start only if more than 60 s of lease remain" check
- also start no new round after 90 s of run time (already there)

## 6. The vehicle list would make hundreds of database calls per page load
`enrichVehiclesWithPictures` calls `readPictureForVehicle` once per vehicle. Each call loads settings, checks the Gemini budget, reads the picture, counts the org's day, and maybe reads the catalogue and the live look. For a 50-vehicle list that's ~300 sequential calls on every load. Roam's database already had disk-IO trouble.

Fix — batch it:
- one settings load, one budget check, one `vehicle_picture` query `in (picture ids)`, one org-day count per distinct org
- for vehicles with no `picture_id`: one catalogue query `in (catalogue ids)`, build their look keys, one live-look query `in (look keys)`
- then work out each status with the same `resolvePictureForVehicle`
- the single-vehicle `readPictureForVehicle` can call the batch version with one vehicle

Test: 50 vehicles → at most 8 database calls on the fake (count them).

## 7. Small ones
- `releaseClaimedToQueued`, `requeuePicture` and `failPicture` ignore Supabase errors: check `error` and throw, like the other methods.
- Add `fleet-core/internal/vehicle-pictures` to whatever list `scripts/check-fleet-edge-duplicates.mjs` or `routes.generated.json` generation expects, if a new route must be declared there. Run the bundler `node scripts/build-edge-bundle.mjs fleet-core` once to confirm it builds, but **don't hand-edit** generated files.

## Tests
Add `vehicle_picture_routes.test.ts`:
- `normalizeFleetCorePathname("/fleet-core/internal/vehicle-pictures/run")` equals `/make-server-37f42386/internal/vehicle-pictures/run`, and the registered route list (capture `app.post` / `app.get` calls with a fake app) contains exactly the four paths in §1
- `requireAuth`'s skip check lets `/make-server-37f42386/internal/vehicle-pictures/run` through without a user token (call the middleware with a fake context and assert `next()` ran)
- `getCatalogRow` sends the aliased column list (fake Supabase records the select string)
- the worker prompt for a stored `pre_facelift` row contains "pre-facelift styling"
- claims set `lease_until` ≈ now + 3 min
- §6: the batch enrichment call count

Then:
- run all vehicle picture Deno tests: they must pass
- **run `supabase/tests/vehicle_pictures_checks.sql` on the local test copy** with Docker's psql, as in C1/C3a (`docker exec -i <db container> psql -U postgres -d postgres < supabase/tests/vehicle_pictures_checks.sql`): every row `ok`
- `deno check supabase/functions/fleet-core/src/main.ts`: no errors in any `vehicle_picture*`, `vehicle_save*`, `vehicle_document*` or `_shared/vehiclePictures` file
- at the end, run `pnpm install` at the repo root

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database or real R2 / Imagen. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
