# Give Cursor this — Round C3a fix (before C3b)

Claude reviewed C3a. The reader, whitelist, dates, chassis rule, plate guard, logging and the Fleet modal changes are correct. Fix these four things.

## 1. Every vehicle save would fail — the store reads a view that lacks the new columns
`vehicle_save_fleet_store.ts` reads and writes `public.fleet_vehicles`. That is a **view** over `fleet.vehicles` with a fixed column list, and it has **no** `color_standard` or `picture_id` (checked on the live database 16 Nov 2026). `getVehicle` selects both, so every `POST /vehicles` errors once this ships. The tests didn't catch it because they use a fake store.

Fix:
- In the C1 migration file (`20261116175911_vehicle_pictures.sql`, still local-only), recreate the view with the two new columns **added at the end**. Use `create or replace view public.fleet_vehicles as select <every existing column, same order>, color_standard, picture_id from fleet.vehicles;` and keep its existing grants and options. Read the current definition from the baseline/migrations first, so nothing else changes.
- The store keeps using `public.fleet_vehicles` for vehicle reads and writes. `fleet.vehicle_document_check` stays through `.schema("fleet")`, as `catalog_routes.ts` already does for `fleet.master_change_log`.
- Add a check to `supabase/tests/vehicle_pictures_checks.sql`: `select color_standard, picture_id from public.fleet_vehicles limit 0` succeeds.

## 2. Nothing may be written before the rest of the save is known to succeed
In `register_residual_monolith_routes.tsx`, `applyVehiclePictureSaveRules` runs **before** the org check, the catalogue gate (which can return 422) and the KV save. It already inserts or updates the vehicle row and the document checks, so a save rejected later leaves a half-saved vehicle and checks behind.

Split the rules into two exported steps in `vehicle_save_rules.ts`:
- **`validateVehicleSave(deps, input)`** — no writes. Plate required, chassis mismatch, plate mismatch on update, another-org pre-check, colour resolve. Returns the normalized plate, `colorStandard` and the stripped vehicle. Runs where the rules run today.
- **`commitVehicleSave(deps, input, validated)`** — the insert-or-update with the primary-key conflict guard (another org → 409 `PLATE_IN_OTHER_FLEET`), the unlink rule, the document check rows, then `runPictureLookup`. Runs **after** the catalogue gate passed and after `kv.set` / the existing fleet write succeeded, just before the success reply.
- If commit returns `PLATE_IN_OTHER_FLEET` (the race case), the route returns 409, and the KV write for that id is rolled back (delete `vehicle:<id>` if this request created it).

Tests (extend `vehicle_save_rules.test.ts`):
- `validateVehicleSave` makes no store calls that write (the fake store throws on any write during validate)
- the T17a race now runs through `commitVehicleSave`
- a route-level test with a fake catalogue gate that returns 422: no document check rows and no vehicle row are written

## 3. The read limits must hold across server instances
`allowRequest` in `_shared/rateLimit.ts` falls back to an in-memory map per isolate when Deno KV isn't available, which is the case on Supabase. So "20 per user per hour / 200 per org per day" would really be per instance.

Fix:
- New small migration (`npx supabase migration new vehicle_document_read_log`):
  - `fleet.vehicle_document_read_log (id uuid pk default gen_random_uuid(), organization_id text not null, user_id uuid not null, read_at timestamptz not null default now())`
  - index on `(user_id, read_at)` and `(organization_id, read_at)`
  - RLS on, no policies, revoke from anon/authenticated
- `recordRead` inserts a row (it's a no-op today).
- The user limit counts that user's rows in the last hour. The org limit counts the org's rows where `(read_at at time zone 'America/Jamaica')::date` = today in Jamaica. Use one SQL function `fleet.vehicle_document_read_counts(p_user uuid, p_org text)` returning both counts.
- Count **before** calling the reader; insert the log row **after** a successful read, as now.
- Rows older than 7 days are deleted by the existing nightly pattern. Add `delete … where read_at < now() - interval '7 days'` to the `vehicle-picture-fill` cron command in the C1 migration, or as its own daily job.
- Checks file: the counts function returns the right numbers for seeded rows around a Jamaica midnight.

## 4. Two small ones
- `vehicle_document_read.ts`: `normalizeCertificateDates` uses `new Date()`. Pass `deps.now()` through so tests control "today".
- When the reader is blocked by the budget or kill switch (`ProviderBlockedError`), return 503 `READ_PAUSED`, error "Scanning is paused right now — type the details instead.", instead of a 500 `READ_FAILED`. Add the toast to the Fleet modal's code map, and add a test.

## Run
- Re-apply the C1 migration plus the new one on the **local test copy only**. The checks file shows all `ok`.
- `deno test --no-check --allow-env --allow-read` on the vehicle picture tests. All pass.
- Fleet vitest from PowerShell (`C:\Roam\Goride\apps\fleet`), the certificate flow test. Passes.
- At the end, run `pnpm install` at the repo root.

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
