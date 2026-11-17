# Give Cursor this — Round C3d fix (before the screens)

Claude reviewed C3d. Access rules (staff + 2FA, owner-only switch and remake-all), audit logging, error shape, the 30-a-day regenerate limit and the no-fleet-data rule (with the leak scanner in tests) are all correct. One design problem breaks at real catalogue size. Fix it.

## The "stale look" filter and counts don't scale
`loadActiveLookKeys` builds every catalogue row × 16 colours: about 2,700 × 16 ≈ **43,000 keys**.
- `listAdminPictures` with `stale=1` sends all of them in one `look_key not in (...)` filter, which is about 1.5 MB in the request address. PostgREST/Kong reject requests that size, so the Stale filter fails.
- `countAdminStatusBuckets` downloads **every** picture row (status + look key) on every gallery load to count Stale in code.

Fix — store staleness on the row, keep it fresh in the background, and count in SQL:
1. New migration (`npx supabase migration new vehicle_picture_stale_flag`):
   - `alter table public.vehicle_picture add column stale boolean not null default false`
   - `create index vehicle_picture_stale_idx on public.vehicle_picture (stale) where deleted_at is null`
   - a function `public.vehicle_picture_admin_counts()` returning `ready`, `being_made` (queued + generating), `failed` and `stale` for live rows in **one** query; service_role only
   - a function `public.vehicle_picture_set_stale(p_stale_ids uuid[])` that, in one statement, sets `stale = (id = any(p_stale_ids))` for all live rows whose value changes; service_role only
2. Stale refresh, in `vehicle_picture_stale.ts`:
   - build the set of **look bases**: the look key **without the colour** (`make|model|generation|body|facelift`) from active catalogue rows, about 1,756 strings, not 43,000
   - read live pictures in pages of 1,000 (`id, look_key`)
   - a picture is stale when its look key minus the last `|colour` part isn't in the set
   - call `vehicle_picture_set_stale` with the stale ids
   - runs inside the worker's clean-up step, sharing the same 10-minute throttle (`vehicle_picture_stale_last_run_at`), plus once at the end of every fill run
3. Admin routes:
   - `stale=1` → `.eq("stale", true)`
   - counts → `rpc("vehicle_picture_admin_counts")`
   - each list item's `stale` comes from the column
   - remove `loadActiveLookKeys` and the in-memory cache from the request path
4. Tests:
   - the stale refresh with 3 catalogue rows and 5 pictures (2 stale) sets exactly those 2
   - the list route with `stale=1` makes one filtered query with no `in (...)` list; check the fake's recorded filters
   - a gallery load makes a fixed, small number of database calls (count them; no full-table read)
   - the checks file: `vehicle_picture_admin_counts()` and `vehicle_picture_set_stale` on seeded rows; run on the local test copy with Docker's psql, every row `ok`

Then:
- all vehicle-picture Deno tests pass
- `deno check supabase/functions/fleet-core/src/main.ts` shows no errors in `vehicle_picture*` files
- the new test file is in the "Deno test vehicle pictures" CI step
- at the end, run `pnpm install` at the repo root

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database or real R2 / Imagen. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183), and run `pnpm testcopy:stop` if you started the test copy.
