# Phase 4 — Fleet brakes execution report

## Migration

- `supabase/migrations/20261107012459_roomy_brakes_phase4_admin_part_fits.sql` — PLATFORM TWIN sisters + `engine` on `fits` in `admin_catalog_master_part`.

## Changed / added files (server)

- `supabase/functions/_fleet-server/fleet_parts_lookup.ts`
- `supabase/functions/_fleet-server/read_brakes_overview.ts`
- `supabase/functions/_fleet-server/parts_finder_group.ts`
- `supabase/functions/_fleet-server/fleet_find_parts_routes.ts`
- `supabase/functions/_fleet-server/parts_finder.ts`
- `supabase/functions/_fleet-server/catalog_api.ts`
- `supabase/functions/_fleet-server/fleet_parts_lookup.test.ts`
- `supabase/functions/_fleet-server/parts_finder_group.test.ts`
- `supabase/functions/_fleet-server/read_brakes_overview.test.ts`
- `supabase/functions/fleet-core/index.ts` (rebuilt bundle)

## Changed / added files (Fleet UI)

- `apps/fleet/src/components/vehicles/find-parts/BrakesFindPartsFlow.tsx`
- `apps/fleet/src/components/vehicles/find-parts/brakesFindPartsConstants.ts`
- `apps/fleet/src/components/vehicles/find-parts/FindPartsTab.tsx`
- `apps/fleet/src/components/vehicles/find-parts/PartStep.tsx`
- `apps/fleet/src/services/api.ts`

## E2E

- `e2e/fixtures/roomy_brakes_fleet_seed.sql`
- `e2e/roomy-brakes-fleet.spec.ts`
- `playwright.config.ts` — fleet `testMatch` includes `roomy-brakes-fleet.spec.ts`

## Fleet-core bundle

- `node scripts/build-edge-bundle.mjs fleet-core` — succeeded (≈2.0 MB).

## Playwright (single run — no rerun)

Command:

```powershell
$env:ADMIN_BASE_URL='http://127.0.0.1:5180'; $env:FLEET_BASE_URL='http://127.0.0.1:5181'; node node_modules/@playwright/test/cli.js test e2e/roomy-brakes-fleet.spec.ts --project=fleet --reporter=list --max-failures=1 --retries=0
```

| Test | Result |
|------|--------|
| done-test 1: one pad card with five brand numbers | **Fail** (beforeAll seed) |
| done-test 2 and 3: Also fits and Needs checking | Did not run |
| done-test 4: same card from FxSwift car | Did not run |
| done-test 6: every brake type listed with empty Ask Roam | Did not run |
| screenshots dark + 390px | Did not run |

**Failure (beforeAll):** `roomy_brakes_fleet_seed.sql` — `reject_mixed_maker_platform()` (multiple makers on one `platform_id`).

**Post-run fixes (in repo, not re-tested in Playwright):**

- One `vehicle_platform` per maker; Toyota sisters (Roomy + Rush) share Toyota platform only.
- Brake setup on `vehicle_catalog.front_brake_type` / `rear_brake_type` (not invalid `catalog_spec_value` keys).
- `read_brakes_overview` reads `vehicle_catalog` brake columns (aligned with vehicle context).
- `fleet.vehicles` org filter uses text `organization_id` (no `::uuid`).

Local seed apply after fixes: **COMMIT OK** via docker psql.

## Screenshots

None captured (run stopped in `beforeAll`).

Target folder when tests pass: `docs/stitch/roomy-brakes-fleet/screenshots/`

## Notes

- Brakes path bypasses generic FP4/5/6 for BRK-* picks and Brakes area (`PartStep` + `FindPartsTab`).
- UI is a single `BrakesFindPartsFlow` (list / results / empty / detail), not six separate Stitch screen files.
- Re-run Playwright once after `pnpm testcopy` + fleet-core bundle + seeds when you want green done-tests.
