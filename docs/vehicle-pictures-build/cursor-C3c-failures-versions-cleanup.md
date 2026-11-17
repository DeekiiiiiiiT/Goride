# Give Cursor this — Round C3c: Failures, versions and cleanup

The plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 6). Read **§3.4 worker steps 3–6, the per-minute job, §3.7, §11 runbooks and §13 (`last_error`)**. Rounds C1–C3b are done. This round fills in every `// C3c` hook left in `vehicle_picture_worker.ts` and adds versions and cleanup. Don't change C3b's behaviour beyond what's listed.

**Settings store:** every vehicle-picture setting named below lives in the one KV row `kv_store_37f42386.key = 'vehicle_pictures:settings'` (a JSON object), never in `platform:settings:*`. Missing keys use the defaults in the audit.

## 1. Failure classes (worker step 4)
- **Outage:** timeout, network error, HTTP 5xx, HTTP 429 → backoff and retry as C3b does; after max attempts → `failed`.
- **Content:** Imagen answered but refused or returned no image → straight to `failed`, `last_error = "The picture service refused this car"`, no auto-retry. Never counts toward the breaker.
- **Key:** HTTP 401 / 403 →
  - setting `vehicle_pictures_paused_until = now() + 1 h` and `vehicle_pictures_pause_reason = "key"`
  - put the row back to `queued` with **`attempts = attempts - 1` in the same update**
  - stop the run; try no further rows
- `ProviderBlockedError` from `trackedProviderCall`:
  - **live rows:** back to `queued`, `next_attempt_at = now() + 1 h`, attempts given back the same way as the key case
  - **remake rows:** **every** queued and claimed remake row back to `queued` with `next_attempt_at` = the 1st of next month (Jamaica time), attempts unchanged (worker step 6)
- `last_error` is always stored through C2's `cleanLastError`.

## 2. Circuit breaker (worker step 5)
After 5 outage-class failures within 10 minutes with **no** success in between (content failures neither reset nor add):
- set `vehicle_pictures_paused_until = now() + 30 min` and `vehicle_pictures_pause_reason = "outage"`
- stop claiming

Keep the streak in settings: `vehicle_picture_outage_streak` (`{ count, firstAt }`); a success resets it.

## 3. Stuck sweep (already in SQL)
The minute tick already runs `private.vehicle_picture_sweep_stuck()` (C1 fix). The worker also calls it once at the start of each run (via RPC, after taking the lease), so a run started by a kick sweeps too. Attempts stay as they are; the call may have gone out.

## 4. Versions (§3.7)
Server functions, used by C3d's Dominion routes:
- `regeneratePicture(id, staffUserId)`:
  - `version + 1`, `status = 'queued'`, `lane = 'live'`, `next_attempt_at = now()`
  - kick the worker
  - the new file is `…/v{n}.png`; when it becomes ready, "becomes ready" retires the old version
- `replacePicture(id, uploadedKey, staffUserId)`:
  - takes a file already uploaded through the R2 flow (purpose `catalogue-images`)
  - **R2 server-side copy** to `catalogue/images/<id>/v{n+1}.png`, then "becomes ready" with source `staff_upload`
  - deletes the uploaded temporary object
- `restorePrevious(id, staffUserId)`:
  - finds the newest retired version whose file still exists
  - **copies** that file to a new `…/v{n+1}.png`, then "becomes ready" with source `restore`
  - never reuses an old key
- `removePicture(id)`:
  - when any vehicle has this `picture_id` → error `PICTURE_IN_USE`
  - otherwise `deleted_at = now()` and retire all versions
- "Becomes ready" sets `vehicle_picture.source` to the version's source (`ai`, `staff_upload` or `restore`).

## 5. Cleanup (§3.7, every worker run, after the sweep)
Retention = setting `vehicle_picture_retention_days` (default 30).
- **Live pictures:** keep the current version and the newest retired one; delete the files of other versions retired more than the retention ago.
- **Removed pictures:** after the retention from `deleted_at`, delete **all** their version files. Keep the picture row.
- `file_deleted_at` is set only after R2 confirms (2xx or 404). A failed delete leaves it null and is retried on the next run.
- At most 50 deletes per run.

## 6. Tests (write them first)
Extend `vehicle_picture_worker.test.ts` and add `vehicle_picture_versions.test.ts`:
- **T8:** a `generating` row past its lease → `queued` at the next run
- **T9a:** 5 content failures on one look → that row `failed`; other rows keep being claimed; no pause
- **T9b:** 5 timeouts in a row → paused 30 min, reason `outage`, no claims until then
- **T9c:** 401 → paused 1 h, reason `key`, row `queued` with attempts unchanged, no other row tried
- **T7c (extend):** the same 401 three runs in a row (clock moved an hour each) → still `queued`, never `failed`
- **T10:** first picture v1 + version row; regenerate → v2 file + row, v1 retired; restore → v1's file copied to v3, row source `restore`, v2 retired; no key reused
- **T24b:** resurrect → ready → the old version retired in the same step; cleanup deletes its file after the retention
- **T25:** v1→v4 by three regenerates; clock +31 days; cleanup → only v4 and v3 files remain, v1 and v2 `file_deleted_at` set; a failing delete stays null and succeeds next run
- **T35:** restore → `vehicle_picture.source = 'restore'` and the version row `restore`; replace → `staff_upload` on both; each version keeps its own `cost_usd`
- **T11 (server half):** remove a used picture → `PICTURE_IN_USE`; unused → soft-deleted, all versions retired

## 7. Run
- `deno test --no-check --allow-env --allow-read` on all vehicle picture test files. All pass.
- Add any new test file to the "Deno test vehicle pictures" CI step.
- At the end, run `pnpm install` at the repo root.

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database or real R2 / Imagen (stubs only). Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
