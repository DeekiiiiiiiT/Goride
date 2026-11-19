# Give Cursor this — Log service parts gaps, Slice A, Round A-Server

You are building **Slice A, Server layer only** of `docs/log-service-parts-gaps-audit.md` (Rev 2.8). Read these parts first; they are the spec:
- the status block at the top (Rev 2.7 and 2.8 notes)
- section 2, Slice A table (LS-01 … LS-08)
- section 3.2 Server, the Slice A bullet
- section 4 (Gates) and section 5 (Done-tests 1–7)

The Data round is done and checked: `packages/types/src/partPositions.ts`, migration `supabase/migrations/20261118181439_log_service_positions.sql` (the DB refuses a wrong position on a new or changed line with `position_invalid`), and `supabase/tests/log_service_positions_checks.sql`. Do not change that migration.

Do **not** build the screens (the chips, "Save line" rule, found-row chips, labels on screen). Do not build anything from Slice B. Those are later rounds.

The working tree already has uncommitted changes in many Fleet and server files. Keep them: change only the lines this prompt names, and never revert, reformat or stash anything.

## What to build

### 1. Make `partPositions.ts` safe for the edge functions
Edge code imports shared files by path (`../../../packages/types/src/<file>.ts`), and none of those files import a sibling. `partPositions.ts` has `import type { PartsFitPair } from "./partsFitParam";`. Remove that import and declare the same shape inline in `partPositions.ts`:
`type FitPair = { axle: "front" | "rear"; side: "left" | "right" | "both" };` and use it as `wheelCodesToFitPairs`'s return type. Change nothing else in the file. `packages/types/src/partPositions.test.ts` must still pass.

### 2. Positions left out must mean "keep" (LS-05, golden rule 10)
Today `mapApiLineToDb` in `supabase/functions/_fleet-server/service_items_save.ts:133` always sends a `positions` key: `null` when the screen left positions out. The database treats a sent `null` as "clear", so a save that leaves positions out wipes them.

- In `mapApiLineToDb`, add `positions` to the row **only when** `raw.positions` is an array: then it is `raw.positions.map(String)`. When `raw.positions` is missing, `undefined` or `null`, the row has **no** `positions` key at all. An empty array stays an empty array (that means "cleared").
- Check every place that reads `row.positions` from `mapApiLineToDb`'s output (for example the shim at `service_items_save.ts:873-895`, completion, the ledger input) still works when the key is missing. Do not change `loadWorkOrderLinesForRpc`: it copies saved lines from the database, so it sends their stored positions back.

**Matching Fleet change, in this same round,** so that clearing all wheels still works. Today the Fleet dialog sends `positions: undefined` when nothing is picked (`apps/fleet/src/components/vehicles/LogMaintenanceServiceDialog.tsx:317` and `:356`). With the server fix that would mean "keep" instead of "clear". Change **only those two lines** to always send the array: `positions: [...extras.positions]`. Old lines still re-save unchanged because the dialog loads their saved positions (line 962) and sends the same set back, which the database doesn't re-check. (The Screens round will change this to "send only when a chip was tapped".)

### 3. Translate the new error (LS-05)
In `SAVE_ERROR_MESSAGES` (`service_items_save.ts:240-260`), add
`position_invalid: { status: 400, error: "That position doesn't fit this job. Pick again." }`.
Today it falls through to a 500 `save_failed`. Make sure every route that calls `fleet_save_work_order` (create, update/PATCH, the completion path) uses `mapSaveWorkOrderError`, so the 400 `position_invalid` reaches Fleet.

### 4. Each line says its job's position type (LS-07)
`GET /maintenance-work-orders/:id` (`maintenance_routes.ts:3840`). Both Log service (editing a draft) and Service history → View service use it.

- Add one helper, e.g. `enrichLinesWithPositionScheme(supabase, lines)`: one query on `maintenance_service_categories` with `.in("id", <distinct component_id values>)` selecting `id, code, position_aware, position_scheme`. Set `position_scheme` and `position_aware` on each line row. A line with no `component_id`, or whose job is not found, gets `null` for both.
- Call it in that GET route, after `enrichApiLinesWithFound`. Also call it on the completed-replay path of `POST /maintenance-work-orders` (around line 3905), so a replay returns the same shape.
- In `mapDbLineToApi` (`maintenance_routes.ts:501`), add `positionScheme: row.position_scheme ?? null` and `positionAware: row.position_aware === true ? true : (row.position_aware === false ? false : null)`.
- In `apps/fleet/src/types/maintenance.ts`, add optional `positionScheme?: string | null` and `positionAware?: boolean | null` to the work-order line type (`MaintenanceLogLine`). Type only; no screen changes.

### 5. The found-work list carries positions (LS-06)
"Log it now" must open with the found job's position already picked (done-test 3), but `fleet_open_found_work` doesn't return positions. Create a migration with `npx supabase migration new found_work_positions` (real current UTC time; never pick or edit the date yourself). In it:
- a new version of `public.fleet_open_found_work(text, text)`. Copy the latest body from `supabase/migrations/20261118004433_inspection_findings.sql` and keep everything exactly as it is (same keys, order, filters, settings). Add only three keys: `"positions"` (`coalesce(l.positions, ARRAY[]::text[])`), `"positionScheme"` and `"positionAware"`, from a `LEFT JOIN public.maintenance_service_categories` on `l.component_id`;
- the same `REVOKE ALL … FROM PUBLIC, anon, authenticated` / `GRANT EXECUTE … TO service_role` lines as that file.

In `apps/fleet/src/types/maintenance.ts`, add `positions?: string[]`, `positionScheme?: string | null` and `positionAware?: boolean | null` to `FoundWorkItem`. Type only.

Add a check to `supabase/tests/log_service_positions_checks.sql`, inside its `BEGIN … ROLLBACK` part: a completed service with a found Oxygen-sensor-style line (`before_after_catalyst` job) holding `{before_cat}` → `fleet_open_found_work` returns it with `positions = ["before_cat"]` and `positionScheme = "before_after_catalyst"`. Mark the work order completed the same way `inspection_findings_db_test.sql` does.

### 6. Find parts request takes a position (LS-08)
`POST /fleet/find-parts/request` (`fleet_find_parts_routes.ts:445`) and `buildPartsSourcingInsert` (`parts_sourcing_request_build.ts`), which stays the only request builder.

- The route reads `body.positionCodes`: an array of strings, or missing. Anything else → 400 `{ code: "position_invalid", error: "That position doesn't fit this part." }`.
- When codes are sent and a job id is given (`maintenanceComponentId` / `componentId`): load that job's `code, position_aware, position_scheme` from `maintenance_service_categories`. The server uses **the job's own** `position_scheme`. A `positionScheme` in the body is ignored. If `positionCodesProblem(job, codes)` from `partPositions.ts` is not null → the same 400 `position_invalid`.
- When codes are sent but there is no job id, the codes are ignored (stored NULL).
- `buildPartsSourcingInsert` gets two optional inputs, `positionScheme` and `positionCodes`, and writes them to the new `position_scheme` / `position_codes` columns. Empty codes → both NULL. A job with scheme `none` and no codes → both NULL.
- **Fit descriptor (LS-02):** if the body sends no `fit` / `fitDescriptor` / `position` / `side`, and the codes contain wheel codes, fill `fit_descriptor`, `install_position` and `install_side` from `formatPartsFitParam(wheelCodesToFitPairs(codes))` (first pair = install position/side). Non-wheel codes never fill the fit. When the body does send `fit` / `position` / `side`, today's behaviour stays exactly as it is.
- The research group key (v1) and dedupe stay exactly as today. Key v2 is Slice B.
- In Fleet, `buildAddPartInfoRequestBody` (`apps/fleet/src/components/vehicles/find-parts/findPartsRoute.ts:110`) gets an optional `positionCodes?: string[]` on `AddPartInfoRequestInput` and sets `body.positionCodes` only when it is a non-empty array. Nothing calls it with codes yet. Add a vitest case next to that file's existing tests (or a new `findPartsRoute.test.ts`): no codes → no `positionCodes` key; `["before_cat"]` → passed through.

### 7. The switch is visible to Fleet (LS-18)
- Add `LOG_SERVICE_PARTS_GAPS: "log_service_parts_gaps"` to `FEATURE_FLAGS` in `feature_flags.ts`, with the comment "Log service: non-wheel position chips, Other item part number, unknown parts to Dominion. Default off." It defaults off like the others.
- Wherever the jobs payload returns `inspectionFindingsEnabled` (`maintenance_routes.ts:1802-1818`), also return `logServicePartsGapsEnabled` from `isFeatureEnabled(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, orgId)` (false without an org). Add it to the same `Promise.all`.
- In Fleet, add the optional field to the type that holds `inspectionFindingsEnabled` (see `useJobItems.ts:32`). Type only; no screen changes.
- The switch changes **nothing** on the server in Slice A. The database position check runs whether it is on or off. It refuses only wrong codes and never requires a position, so with the switch off the screen still saves (done-test 7).

### 8. Rebuild the bundles
Both are kept in git:
- `node scripts/build-edge-bundle.mjs fleet-ops` (work orders);
- `node scripts/build-edge-bundle.mjs fleet-core` (Find parts).

## Tests (update and run them in this round)
Use **real** shapes: the real `mapApiLineToDb`, `mapDbLineToApi`, `buildPartsSourcingInsert` and `mapSaveWorkOrderError`. No hand-written short JSON. Add a new file `supabase/functions/_fleet-server/log_service_positions.test.ts` and extend `parts_sourcing_request_build.test.ts`. Prove:

1. **Absent vs empty (golden rule 10):** `mapApiLineToDb` with no `positions` → the row has **no** `positions` key; `positions: null` → no key; `positions: []` → `[]`; `positions: ["LF"]` → `["LF"]`. Then `JSON.stringify` the RPC lines and check the same (absent stays absent).
2. **Refusing a wrong code:** `mapSaveWorkOrderError('position_invalid …')` → status 400, code `position_invalid`. Every save route uses it (test the route the same way `service_items_save.test.ts` tests `line_items_on_found_job`).
3. **Unchanged line passes:** an old line loaded by `loadWorkOrderLinesForRpc` with `{LF}` on a `none` job goes out with `positions: ["LF"]` unchanged (the DB then doesn't re-check it; that part is proven by the SQL checks file).
4. **Line position type:** `GET /maintenance-work-orders/:id` with a fake client returns `positionScheme` / `positionAware` per line from the job, and `null` for a line with no job. One categories query for all lines.
5. **Wheel translation in the request:** `buildPartsSourcingInsert` with codes `["LF","RF"]` and no body fit → `fit_descriptor` `front:both`, `install_position` `front`, `install_side` `both`, `position_codes` `["LF","RF"]`. With `["before_cat"]` → fit fields NULL, `position_scheme` = the job's scheme, `position_codes` `["before_cat"]`. With a body `fit` sent → today's fit, unchanged. With no codes → `position_scheme` and `position_codes` NULL, and everything else equal to today's output.
6. **Request refuses a wrong code:** `["LF"]` on a `before_after_catalyst` job → 400 `position_invalid`; `["unknown","before_cat"]` → 400; `positionCodes: "LF"` (not an array) → 400.
7. **Switch:** the jobs payload has `logServicePartsGapsEnabled: false` when the flag is off and `true` when on; nothing else in the payload changes.

Add `log_service_positions.test.ts` to the "Deno test maintenance jobs + service items" step in `.github/workflows/ci.yml`. Add `parts_sourcing_request_build.test.ts` to the "Deno test find parts" step if it isn't in any CI step yet.

Fleet vitest: if any existing Fleet unit test checks the two dialog lines from step 2 (`positions: undefined` when empty), update it to expect `[]`. Say in your report which ones you found, or that there were none.

## How to check your work (local only)
1. Server tests:
   ```
   deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/log_service_positions.test.ts supabase/functions/_fleet-server/parts_sourcing_request_build.test.ts supabase/functions/_fleet-server/fleet_find_parts_routes.test.ts supabase/functions/_fleet-server/inspection_findings.test.ts supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts packages/types/src/partPositions.test.ts
   ```
   Everything must pass. Heavy Deno use can break the local Fleet dev app; if it does, the owner stops the app and runs `pnpm install`. Never delete `node_modules/.deno`.
2. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only (run it once more if it fails with `DbSetupError`). Then run `log_service_positions_checks`, `inspection_findings_checks`, `inspection_findings_db_test`, `service_items_save_db_test` and `service_items_completion_db_test` the way CI does:
   ```
   export MSYS_NO_PATHCONV=1
   docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/<f>.sql
   docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<f>.sql
   ```
   All must pass.
3. Fleet vitest for `logServiceJobCost.test.ts` and any test you changed, run from `C:\Roam\Goride` in PowerShell (not a `/c/...` bash path).
4. `pnpm --filter @roam/fleet typecheck`: it already fails in files this round doesn't touch. Report only whether any error is in a file you changed; there must be none. `pnpm --filter @roam/admin typecheck` must pass.
5. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit, stash or push.
- Shipped migration files are never edited, including `20261118181439_log_service_positions.sql`.
- Change only: `partPositions.ts` (step 1), `service_items_save.ts`, `maintenance_routes.ts`, `fleet_find_parts_routes.ts`, `parts_sourcing_request_build.ts`, `feature_flags.ts`, the new migration, `log_service_positions_checks.sql`, the two lines in `LogMaintenanceServiceDialog.tsx`, the types in `apps/fleet/src/types/maintenance.ts`, `findPartsRoute.ts` (step 6) and its test, the test files named above, `ci.yml`, and the two rebuilt bundles.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183). If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL; I'll read the files.
