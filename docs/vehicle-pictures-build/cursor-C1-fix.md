# Give Cursor this — Round C1 fix (before C2)

Claude reviewed C1 (`supabase/migrations/20261116175911_vehicle_pictures.sql`, `supabase/tests/vehicle_pictures_checks.sql`). The tables, indexes, RLS, revokes and the lock row are correct. Fix these three things **in the same migration file**. It has only ever run on the local test copy, so edit it in place and re-apply locally.

## 1. Don't hard-code the production functions URL
`private.invoke_vehicle_picture_worker()` and `private.invoke_vehicle_picture_fill()` post to `https://csfllzzastacofsvcdsc.supabase.co/functions/v1/...`. On the local test copy the cron would then call the **production** server every minute, and the pre-production run (round C4) can't point at the local `functions serve`.

Fix: read the base URL from `private.fleet_ops_secrets` row `name = 'functions_base_url'` (for example `http://host.docker.internal:54321/functions/v1`), falling back to `https://csfllzzastacofsvcdsc.supabase.co/functions/v1` when the row is missing. Build `<base>/fleet-core/internal/vehicle-pictures/run` and `.../fill` from it. Don't change the existing catalogue-research function.

## 2. The minute tick must sweep stuck rows and wake the worker for cleanup
Today `private.vehicle_picture_minute_tick()` only calls the worker when a `queued` row is due. So:
- a `generating` row whose lease ran out is never swept
- old version files are never cleaned up when the queue is empty

Fix:
- New function `private.vehicle_picture_sweep_stuck()` returns the count. It runs `update public.vehicle_picture set status = 'queued', lease_until = null, next_attempt_at = now() where status = 'generating' and lease_until < now() and deleted_at is null`, leaving `attempts` unchanged.
- The tick calls it **first**, every minute.
- The tick then calls the worker when **any** of these is true:
  - a `queued` row is due
  - a version row has `retired_at` older than the retention and `file_deleted_at is null`
  - a removed picture (`deleted_at` older than the retention) still has a version with `file_deleted_at is null`
- Retention = `vehicle_picture_retention_days` from the settings key below, default 30. Read it as `make_interval(days => coalesce(...,30))` so 0 works.
- The fill-cursor re-kick stays as you wrote it.

## 3. Own settings key
Vehicle-picture settings must not live inside `platform:settings:global`, which belongs to the product-line platform settings. Use one dedicated KV row: **`kv_store_37f42386.key = 'vehicle_pictures:settings'`** (a JSON object).

- Update `private.vehicle_picture_fill_cursor_set()` and the tick to read `vehicle_picture_fill_cursor` from it.
- Every later round reads and writes **all** vehicle-picture settings there: `vehicle_picture_model`, `vehicle_picture_max_attempts`, `vehicle_pictures_paused_until`, `vehicle_pictures_pause_reason`, `vehicle_picture_org_daily_max`, `vehicle_picture_retention_days`, `vehicle_picture_fill_cursor`, `vehicle_picture_outage_streak`, `reader_provider`, `reader_model`.

## 4. Checks
Add to `supabase/tests/vehicle_pictures_checks.sql`:
- a `generating` row with `lease_until` in the past → after `select private.vehicle_picture_sweep_stuck()` it's `queued` with `attempts` unchanged
- with `vehicle_pictures:settings` = `{"vehicle_picture_retention_days": 0}`, a retired version with `file_deleted_at null` makes a new helper `private.vehicle_picture_cleanup_due()` (used by the tick) return true
- `private.invoke_vehicle_picture_worker` uses the `functions_base_url` row when present. Check it by reading the URL it would build: split the URL building into `private.vehicle_picture_functions_url(path text)` and test that.

Re-apply on the local test copy and run the checks file: every row `ok`.

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
