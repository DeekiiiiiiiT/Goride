# Give Cursor this — Round C3b: Picture lookup, worker and fill run

The plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 6). Read **§3.4 completely, §3.6, §7, and build notes BN1, BN2, BN4, BN5** (the "SIGNED OFF" section near the top). Rounds C1, C2 and C3a are done. This round makes pictures **work end to end on the happy path**. Failure classes, the breaker, the sweep, versions beyond v1, and cleanup come in C3c: leave clear TODO hooks for them, not half-built versions.

Put the logic in new modules with injected dependencies (database, R2 store, Imagen caller, clock, flags/settings) so it tests without the network:
- `supabase/functions/_fleet-server/vehicle_picture_lookup.ts`: replaces C3a's no-op `runPictureLookup`
- `supabase/functions/_fleet-server/vehicle_picture_worker.ts`
- `supabase/functions/_fleet-server/vehicle_picture_fill.ts`
- `supabase/functions/_fleet-server/vehicle_picture_routes.ts`: registers the routes below; wire it into fleet-core the way other `register*Routes` files are wired

**Settings store:** every vehicle-picture setting named below lives in the one KV row `kv_store_37f42386.key = 'vehicle_pictures:settings'` (a JSON object), never in `platform:settings:*`. Missing keys use the defaults in the audit.

## 1. Lookup (§3.4 "On vehicle save", steps 1–5)
- **Step 1, stop conditions:** parked; `color_standard` null; the look can't be built; the global flag `ai_vehicle_pictures` off **and** no ready picture for the look.
- **Per-org daily limit:**
  - setting `vehicle_picture_org_daily_max` (default 50)
  - "today" = `(created_at at time zone 'America/Jamaica')::date` (BN5)
  - counted by `queued_by_org`; every new row counts; a resurrect never changes `queued_by_org`
  - over the limit → no row, `picture_id` stays null, reply `limited`
- **Step 2, insert or read:**
  - `insert … on conflict (look_key) where deleted_at is null do nothing returning *`
  - nothing back → read the live row
  - no live row but a removed one → the guarded resurrect `update … where id = $1 and deleted_at is not null returning *`
  - 0 rows from the resurrect → re-read the live row
  - no locks held
- **Step 3:** set `fleet.vehicles.picture_id`, return the status.
- **Step 4:** only when a row was inserted or resurrected, fire one `pg_net` kick: `select private.invoke_vehicle_picture_worker()` via RPC, or the existing way internal kicks are sent. Never await the worker.
- Hook it into: the vehicle save (C3a's hook), Dominion catalogue approval (`pending_vehicle_catalog_routes.ts`, both `approve` and `approve-existing`; unlink `picture_id` in the same write when the catalogue id changes), and a new route `POST /fleet-core/vehicles/:id/color` (`{ colorStandard }`; must be one of the 16; the vehicle must belong to the caller's org; unlink + lookup).

## 2. Worker — `POST /fleet-core/internal/vehicle-pictures/run`
- Auth: service role or cron secret only (use `_shared/authorizeCronOrServiceRole.ts` as the other internal routes do).
- **Step 0, lease row:** the `update public.vehicle_picture_worker_lock … returning holder` statement from §3.4. No row → `{ skipped: true }`. Clear it at the end (only where `holder = runId`).
- **Step 1, no claims when:** the global flag is off, `vehicle_pictures_paused_until` is in the future, or `checkProviderGuards("gemini")` from `api_usage_logger.ts` throws (BN4).
- **Step 2, rounds:**
  - up to 5 rows per round: live first, oldest first; remake rows only fill spare places, at most 2 per round
  - claim with the §3.4 statement, which **does not** touch `attempts`
  - stop starting rounds after 90 s
  - **lease check:** a claimed row is only started if `lease_until - now() > 60 s`; otherwise it goes back to `queued` (attempts unchanged) before exit
  - up to 5 Imagen calls at once
- **Step 3, one row:**
  1. `attempts = attempts + 1`, written immediately before the call (after `checkProviderGuards` passed)
  2. the Imagen call through `trackedProviderCall({ provider: "gemini", service: "image", model: setting vehicle_picture_model (default "imagen-4.0-generate-001"), … })`, with the C2 prompt, `aspectRatio: "4:3"`, `sampleCount: 1`, 50 s timeout
  3. R2 `put` to `roam-public` key `catalogue/images/<picture id>/v<version>.png`, `Cache-Control: public, max-age=31536000, immutable`
  4. **"Becomes ready" in one transaction:** insert the version row (source `ai`, cost, provider, model, `prompt_version`); retire every lower unretired version; set the picture `ready` with `r2_key`, `source`, cost, model, `prompt_version`, `made_at`, `lease_until = null`. Use one SQL function `public.vehicle_picture_become_ready(...)` created by a small new migration in this round (`npx supabase migration new vehicle_picture_become_ready`) so it's truly one transaction.
- Any error in this round → back to `queued` with `next_attempt_at = now() + 2^attempts min + 0–30 s jitter`; after `vehicle_picture_max_attempts` (default 3) → `failed`. C3c refines this; mark the spot `// C3c: failure classes`.

## 3. Fill run — `POST /fleet-core/internal/vehicle-pictures/fill`
- Auth as the worker. Takes the **same lease row**; held → `{ skipped: true }`.
- One batch of 200 vehicles (catalogue-matched, `color_standard` set, `picture_id` null), ordered by `id`, after `after_id`. Runs the lookup for each, **without** per-vehicle kicks.
- Full batch → save the cursor in setting `vehicle_picture_fill_cursor` (`{ afterId, startedAt }`), release the lease, then chain itself once with `pg_net`. Short batch → clear the cursor, kick the worker once.
- **BN1:** the per-minute worker invocation also re-kicks the fill when the cursor is set, the lease is free, and `startedAt` is less than an hour old. Older → clear it.

## 4. Picture status read — `GET /fleet-core/vehicles/:id/picture`
- The vehicle must belong to the caller's org, else 404. `Cache-Control: no-store`.
- Status from the §3.6 order table, rows 1–7 (`paused` and `limited` are worked out, never stored).
- **BN2:** when `picture_id` is null but a live row exists for the vehicle's look, return that row's status (rows 1–5 logic) without linking.
- `url` via `publicMediaUrl(r2_key)` only when ready.
- The vehicle list/detail API responses gain the same `picture` object. Find where Fleet loads vehicles and add it there; don't change other fields.

## 5. Tests (write them first)
In `supabase/functions/_fleet-server/`. Use an in-memory fake database for the tables you touch, a fake R2 store, a stub Imagen caller with a controllable delay, and an injected clock.
- `vehicle_picture_lookup.test.ts`:
  - **T3:** ready → linked, no kick, no Imagen
  - **T4:** two saves at once with a new look → one row, one kick-worth of work, the second sees `queued` at once
  - **T5:** parked / null colour → no row
  - **T6:** save fails → no row
  - **T24:** removed row → resurrected
  - **T24a:** two concurrent resurrects → `version + 1` once, one Imagen call
  - **T28:** org at its limit → `limited`, no row; an existing ready look is still linked; 23:59 and 00:01 Jamaica count as two days (BN5)
  - **T28b:** read route returns `limited` → after the fill `queued` → after the worker `ready`; ready during a pause → `ready`; the BN2 case
- `vehicle_picture_worker.test.ts`:
  - **T7:** ready row has `r2_key` ending `/v1.png`, cost and model set, version row written; the prompt contains make, model, generation and "right-hand-drive" and has no bare "reflection"
  - **T7a:** Imagen takes 45 s, 10 due rows → rounds of 5, nothing started after 90 s, unstarted claims back to `queued` with attempts unchanged, the next run finishes
  - **T7b:** 100 kicks at once → at most one run holds the lease; all pictures made
  - **T7c:** `checkProviderGuards` blocked → no claims, attempts unchanged
  - **T26:** 100 remake rows + 20 live rows → all 20 live rows claimed before more remake rows; ready within 60 s with Imagen at 10 s
- `vehicle_picture_fill.test.ts`:
  - **T33:** 2,000 vehicles → 10 chained batches of 200, each under 30 s, all linked or queued, one worker kick at the end; cursor re-kick after a dropped chain (BN1)
  - **T34:** two fills at once → one skips; a fill while the worker runs → skips

## 6. Run
- `deno test --no-check --allow-env --allow-read` on the three new test files plus the C3a ones. All pass.
- Apply the new small migration on the **local test copy only**. Add a check to `supabase/tests/vehicle_pictures_checks.sql` that calls `vehicle_picture_become_ready` on a test row and verifies the version row + retirement. All `ok`.
- Add the new Deno files to the "Deno test vehicle pictures" CI step.
- At the end, run `pnpm install` at the repo root.

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database or real R2 / Imagen (stubs only). Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
