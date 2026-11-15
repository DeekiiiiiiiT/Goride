# Give Cursor this — Powertrain job fit, Round S1 fix (route tests)

Round S1 is built and reviewed. One part of `docs/powertrain-build/cursor-S1.md` section 5 is missing: `supabase/functions/_fleet-server/maintenance_powertrain_fit.test.ts` has only 3 small tests. Write the route tests that section asks for. **Only tests.** Don't change the routes; if a test shows a route is wrong, stop and say which one in your report.

Note: Claude made 4 small fixes after your S1 round. Read them before you start; don't undo them:
- `maintenance_routes.ts` `loadJobFitContext`: a failed car lookup now returns `{ mode: "error" }` (the "Couldn't check" fallback) instead of throwing.
- `vehicle_catalog_write_routes.ts` `powertrain-summary`: count queries (`count: "exact", head: true`), because the API returns at most 1,000 rows and there are 2,679 models.
- `vehicle_catalog_write_routes.ts`: `get` added to the route type; typed rows in `powertrain-check`.
- `maintenance_jobs_admin_routes.ts`: `"value" in parsed` narrowing for `fitsPowertrains` / `fitsFuels`.
- The S1 DRYRUN stop message (`regen-dryrun.mjs`) now reads `would retire=%, models list = count on 4 jobs, ELEC-ALT same-as-group=%`.

## Tests to add (same file; pattern: `maintenance_jobs_admin_routes.test.ts`, a fake Supabase client, no network)
Fleet job-list routes (`GET /maintenance-categories`, `/quick-jobs`, `/systems/:id/components`, `/systems/:id/sections`):
1. **Done-test 11:** flag `job_fit_filter` off → each route's JSON is deep-equal to the response with no `vehicleId`, and has no `fits`, `fitJobCount`, `hiddenJobCount` or `jobFit` keys. Flag on but no `vehicleId` → the same.
2. **Done-test 9 (route half):** flag on, for 6 fake models (ice/petrol, ice/diesel, hev/petrol, phev/petrol, bev, needs_check), each job's `fits` equals what the fake `job_fits_car` returned for it, on all 4 routes (including jobs inside sections and their `recommendedWith` jobs). `jobFit.status` is 'known' for the first 5 and 'unknown' for needs_check. `job_fits_car` is called **once** per request.
3. **Done-test 13:** an unlinked car (and one with a malformed `vehicle_catalog_id`) → `job_fits_car` is called with `p_vehicle_catalog_id: null`, every job 'unknown', `jobFit.status` 'unknown', status 200.
4. **Fallback:** `job_fits_car` returns an error → 200, the normal job list, no `fits` keys, `jobFit: { status: "error" }`. The car lookup returns an error → the same.
5. A car in another organisation → 404 `{ error: "Car not found." }`.
6. Group counts: a group with 3 active jobs answered yes / no / unknown plus 1 retired job → `fitJobCount` 2, `hiddenJobCount` 1.

Dominion routes:
7. `PATCH /admin/maintenance/jobs/:id`: `fitsPowertrains: []` → 400; `["ice","banana"]` → 400; `null` → saves NULL; `["ice","ice","hev"]` → saves `["ice","hev"]`; key missing → that column isn't in the update; `isHighVoltage: "yes"` → 400. Works on a **used** job (not refused).
8. `PATCH /admin/maintenance/groups/:id/fits`: `isHighVoltage` in the body → 400 "Groups can't be marked high-voltage."; a job id → 400; no fit fields → 400.
9. `GET /admin/maintenance/jobs/:id/fit-count`: bad JSON in `overrides` → 400 with `code: "job_fit_count_bad_override"`; the database's `job_fit_count_bad_override` error → 400 with its hint and the same code.
10. `GET /admin/maintenance/jobs/:id/fit-models`: `limit=5000` → the database gets `p_limit: 200`.
11. `PATCH /make-server-37f42386/admin/vehicle-catalog/:id/powertrain`: an unknown powertrain or fuel → 400; a good body → updates with `powertrain_status: "confirmed"`, `powertrain_note: null`, the signed-in user as `powertrain_last_confirmed_by`.
12. `GET …/powertrain-summary` uses count queries (no row fetch) and returns `{ total, needsCheck, byPowertrain }` with all 7 codes.
13. **Done-test 8 (server half):** saving an edit to an old line (`fit_at_log` NULL) through the real save route returns 200 with the line intact.

## How to check your work (local only)
1. `deno test --allow-all supabase/functions/_fleet-server/maintenance_powertrain_fit.test.ts`. All pass.
2. `deno test --allow-all supabase/functions/_fleet-server/maintenance_jobs_admin_routes.test.ts`. Still passes.
3. `pnpm check`. Passes.

## Rules
- Only change `supabase/functions/_fleet-server/maintenance_powertrain_fit.test.ts`.
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code. Do not create, switch or commit git branches, commit, push or deploy.
- Deno runs write into `node_modules/.deno`. The owner's local apps on ports 3000 and 3001 are running; say in your report that the owner should run `pnpm install` after stopping them.
- Before you finish, stop anything you started (ports 4173, 5180–5183).
- In your report, give a clickable link to the test file and the pass / fail results (with any error text). Don't paste file contents.
