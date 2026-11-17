# Give Cursor this — Round C1: Database

You are building round C1 of the vehicle pictures feature. The full plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 6). Read **§3.4, §3.5, §3.7 and §4** before you start. Do only what this round asks.

## Goal
Create the database pieces for shared vehicle pictures and certificate checks. Code that uses them comes in later rounds.

## 1. Migration
Create it with `npx supabase migration new vehicle_pictures`. It must use the real current UTC time; never edit the date by hand.

Put in it exactly what §4 lists:
- `public.vehicle_picture`
  - every column, check and comment in §4, **including** `lane`, `queued_by_org`, `source` with `'restore'`, `version`, `deleted_at`
  - the partial unique index `vehicle_picture_live_look_uidx` on `(look_key) where deleted_at is null` (**no** plain `unique` on `look_key`)
  - indexes `vehicle_picture_due_idx`, `vehicle_picture_status_idx`, `vehicle_picture_make_model_idx`, `vehicle_picture_color_idx`, `vehicle_picture_org_day_idx`
  - trigger using the existing `public.update_updated_at_column()`
- `public.vehicle_picture_version`: columns per §4, including `cost_usd`, `provider`, `ai_model`, `prompt_version`, `unique (picture_id, version)`, and the cleanup partial index.
- `public.vehicle_picture_worker_lock`: one row, `id = 1`, inserted by the migration.
- `fleet.vehicles`:
  - add `color_standard` (check: the 16 colours from §3.2 in lowercase, **no** `'other'`, null allowed) and `picture_id` (FK to `public.vehicle_picture`, on delete set null)
  - indexes `vehicles_picture_id_idx` and `vehicles_needs_picture_idx` (partial, per §4)
  - note: `fleet.vehicles.vehicle_catalog_id` and `organization_id` are `text`
- `fleet.vehicle_document_check`:
  - `organization_id text`, `vehicle_id text references fleet.vehicles(id) on delete cascade`, and the other columns per §4
  - the index `vehicle_document_check_vehicle_idx`
- RLS **enabled** on all four new tables, with **no** policies. Revoke all on them from `anon` and `authenticated`.
- Two `private` functions that call the edge function with `pg_net`, copying the pattern of the existing `private.invoke_catalog_research()`:
  - `private.invoke_vehicle_picture_worker()` calls `POST /fleet-core/internal/vehicle-pictures/run`
  - `private.invoke_vehicle_picture_fill(after_id text default null)` calls `POST /fleet-core/internal/vehicle-pictures/fill`
  - both read the target base URL and the cron secret the same way `invoke_catalog_research` does
- `pg_cron` jobs:
  - `vehicle-picture-worker`, every minute: calls the worker **only when** a `queued` row is due (`next_attempt_at <= now()`) or a fill cursor is set (§3.4 per-minute job; the sweep itself runs inside the worker route, round C3c)
  - `vehicle-picture-fill`, `15 5 * * *` (00:15 Jamaica = 05:15 UTC): calls the fill
- The `schema_migrations` logbook line is **not** part of the migration file.

## 2. Checks file
Create `supabase/tests/vehicle_pictures_checks.sql`. Each check returns one row with `check_name` and `ok boolean`. Cover:
- all four tables exist with RLS enabled
- `anon` and `authenticated` have no SELECT/INSERT/UPDATE/DELETE on them (T23)
- the partial unique index exists and is partial
- inserting two live rows with the same `look_key` fails; the same key works when one has `deleted_at` set (T24's database half)
- `vehicle_picture.source` accepts `'restore'`; `fleet.vehicles.color_standard` refuses `'other'` and `'Grey'` (capital), accepts `'grey'` and null
- deleting a vehicle deletes its `vehicle_document_check` rows
- `vehicle_picture_worker_lock` has exactly one row
- both cron jobs exist

## 3. Run it
1. Start Docker Desktop. Apply the migration on the **local test copy only**, the way the other local migrations are applied (`pnpm testcopy` starts local Supabase and applies `supabase/migrations`).
2. Run the checks file against the local database. Every row must be `ok = true`.
3. Never connect to or change the production database.

## Rules
- Don't create, switch or commit git branches. Don't push. Don't touch files outside this round. Other uncommitted work in the repo belongs to other rounds: leave it alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
