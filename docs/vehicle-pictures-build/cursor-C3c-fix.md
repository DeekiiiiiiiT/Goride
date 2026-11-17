# Give Cursor this — Round C3c fix (before C3d)

Claude reviewed C3c. The failure classes, key pause, outage breaker, remake budget wall, version naming, restore-copies-a-file and remove-in-use guard are right. Fix these.

**Settings store:** every vehicle-picture setting lives in the one KV row `vehicle_pictures:settings`, as before.

## 1. Clean-up would read every picture on every worker run (critical for the database)
`listCleanupDeleteCandidates` in `vehicle_picture_db.ts`:
- loads **every** live picture
- then calls `listVersions` once **per picture**
- and does the same for removed pictures

With 5,000 pictures that's ~5,000 queries every time the worker runs, and the worker runs in `finally` on every run. Roam's database had disk-IO trouble on 9 Nov.

Fix: one SQL function, one call.
- New migration (`npx supabase migration new vehicle_picture_cleanup_candidates`) with `public.vehicle_picture_cleanup_candidates(p_retention_days int, p_limit int)` returning `(picture_id uuid, version int, r2_key text)`.
- **Removed pictures:** `deleted_at < now() - retention` → every version with `file_deleted_at is null`.
- **Live pictures:** versions with `retired_at < now() - retention` and `file_deleted_at is null`, **excluding** the picture's current version and its newest retired version. Use `row_number() over (partition by picture_id order by version desc)` among the retired versions.
- `order by` the oldest first, `limit p_limit`. Security definer, service_role only, like the others.
- `listCleanupDeleteCandidates` calls this one RPC.
- **Run clean-up at most once every 10 minutes:** store `vehicle_picture_cleanup_last_run_at` in settings and skip if it's newer. The minute tick's `cleanup_due()` is still what wakes the worker.

## 2. A budget block inside the AI call is treated as an outage
`trackedProviderCall` can throw `ProviderBlockedError` **inside** the call (the budget runs out between the pre-check and the call). The `catch` in `processOneRow` sends it to `classifyPictureGenerationError`, which returns `outage`. That counts the attempt, can mark the picture `failed`, and adds to the outage streak (it could even trip the breaker).

Fix: in the `catch`, check `e instanceof ProviderBlockedError` first and handle it exactly like the pre-check block:
- live row → `requeueGiveBackAttempt(row.id, now + 1 h)` (the attempt was counted, so give it back)
- remake row → `deferAllRemakeRows(first of next month)` and stop the run
- never touch the outage streak

## 3. The pre-check block gives back an attempt that was never taken
When `checkProviderGuards` blocks **before** `incrementAttempts`, the code calls `requeueGiveBackAttempt`, which subtracts 1 from attempts that were never added. That gives a picture an extra retry.

Fix: before the increment, use a plain requeue (`requeuePicture(row.id, now + 1 h)`). Only give back after an increment.

## 4. Replace stores every upload as PNG
`replacePicture` copies the upload to `…/v{n}.png` with `content-type: image/png`, even for a JPEG or WebP.

Fix:
- `head` the uploaded object
- use its real content type, and the matching extension (`png` / `jpg` / `webp`) in the new key
- reject anything else with `UPLOAD_TYPE_NOT_ALLOWED`

## 5. Who replaced or restored isn't saved
`staffUserId` is passed in but never written, so `vehicle_picture.made_by` stays empty.

Fix:
- add `p_made_by uuid default null` to `public.vehicle_picture_become_ready` (new migration, `create or replace` with the extra argument; drop the old signature in the same migration so there's only one)
- set `made_by` from it; pass `staffUserId` for `staff_upload` and `restore`, and null for AI

## 6. Apply and check locally
Your report didn't say the new migrations were applied or checked:
- apply all vehicle-picture migrations on the **local test copy**
- add checks to `supabase/tests/vehicle_pictures_checks.sql`:
  - `vehicle_picture_cleanup_candidates` with seeded versions (v1–v4 retired at different times plus a removed picture) returns exactly the expected rows
  - `vehicle_picture_requeue_give_back_attempt` never goes below 0
- run it with Docker's psql: every row `ok`

## Tests (extend the existing files)
- `ProviderBlockedError` thrown **from inside** the stubbed Imagen call → live row requeued +1 h, attempts back to where they were, streak untouched, row not failed
- pre-check block → attempts unchanged (not minus one)
- clean-up makes **one** database call no matter how many pictures exist (count calls on the fake), and is skipped when it ran less than 10 minutes ago
- a JPEG replacement lands as `…/v{n}.jpg` with `image/jpeg`
- restore sets `made_by`

Then:
- all vehicle-picture Deno tests pass
- `deno check supabase/functions/fleet-core/src/main.ts` shows no errors in `vehicle_picture*` files
- at the end, run `pnpm install` at the repo root

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database or real R2 / Imagen. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
