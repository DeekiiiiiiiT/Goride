# Give Cursor this — Round C4b: finish the C4 run (Parts 2 and 3)

Read [cursor-C4-preprod-and-reset.md](./cursor-C4-preprod-and-reset.md) first. Its rules still apply. Part 0 and Part 1 (T22) are done. Parts 2 and 3 didn't run, so redo them in full.

## What Claude found and fixed (16 Nov), don't redo these
1. **`boolean > integer`** came from `public.vehicle_picture_try_worker_lease` in `supabase/migrations/20261116193000_vehicle_picture_become_ready.sql`: `v_ok` was declared `boolean` but holds `ROW_COUNT`. The migration file is fixed in place (`v_rows integer`), because it was never applied to production. The fixed function is also applied to the local database and returns `t`.
2. **`Invalid schema: fleet`**: the local `supabase/config.toml` `[api] schemas` was missing `fleet`. Production already has it. `fleet` is now added, and the local API needs a restart to pick it up (step 1 below).
   - This wasn't why the read failed. The rate-limit check only logs that error and carries on.
   - It did stop `recordRead`, so Part 3's "read log has rows" check couldn't have passed.
3. **Parse 500 "We couldn't read this file"**: the real reason was never logged. `READER_FAILED` now logs `reason` (the provider error text, e.g. `Gemini HTTP 503: …`; a JSON parse error logs only "reader reply was not JSON"). Claude's test of `gemini-3.8-flash` got 503 "high demand" earlier the same day, then 200 later, so a busy model is the likely cause.
4. **The real documents are back** in `C:\Roam\Goride\.vehicle-docs-test\` (`fitness.png`, `registration.png`). The folder is git-ignored.

## Steps
1. Restart the local stack so the API exposes `fleet`: run `npx supabase stop` then `npx supabase start`. **No `db reset`.** Check that the local `anon` `statement_timeout` is still 15s (see the C4 prompt). Confirm with one `GET /rest/v1/vehicle_document_read_log` call using `Accept-Profile: fleet` and the service key: it returns 200, not "Invalid schema".
2. Add a check to `supabase/tests/vehicle_pictures_checks.sql` that **calls** `vehicle_picture_try_worker_lease` (inside a transaction that rolls back): the first call is true, a second call while the lease is held is false. This bug got past 120 tests because they all used fakes. Run the checks file locally and report pass/fail.
3. Serve fleet-core with your git-ignored env file, then redo **Part 2 checks a–e in full**:
   - **a:** one real `gemini-3.1-flash-image` picture lands in `roam-scratch` as `catalogue/images/<id>/v1.png`. Give the real object key and its size.
   - **b:** download it to the git-ignored scratch folder, open it, and compare it with the owner's two reference pictures. Write what matches and what doesn't: background, facing right, right-hand drive, reflection, colour, the right car.
   - **c:** kill the serve while a row is `generating`. Write the row before and after the sweep.
   - **d:** regenerate. Write the v1 and v2 rows and the `file_deleted_at` value, and confirm v1 is gone from `roam-scratch`.
   - **e:** the real WebP check on `media.roamfleet.co`, then delete `_test/preprod.png`. Give the response `Content-Type`.
4. Redo **Part 3** with the real documents. If Gemini answers 503, wait 30 s and try again, up to 3 times, and write each attempt.
5. **Delete `.vehicle-docs-test\` only after Part 3 passes.** If it fails, leave the folder and write the logged `reason`.
6. Add a parity check for the reset script: `scripts/vehicle-pictures-reset.mjs` keeps its own copy of the colour rules. Write a small Deno test that runs both the script's `mapVehicleColor` and `_shared/vehiclePictures/color.ts` on the same list of 30+ colour strings and fails on any difference. Export the script's function if needed.
7. Set retention back to 30 and `ai_vehicle_pictures` back to `false`.

## preprod-run.md
Rewrite it with **real results only**. No "Procedure:" placeholders. Every check line says pass or fail, with the row or response that proves it.

## Rules
Same as the C4 prompt: no screen files, no production (except `_test/preprod.png`), no git branch/commit/push, no secrets or personal details printed, run Playwright once only if at all, stop everything you started (ports 3000/3001 are the owner's own app servers, leave those alone).
