# Give Cursor this — Inspection findings, Round S1 (Server)

You are building **Round S1 only** of `docs/inspection-findings-audit.md`. Read these parts first:
- section 2: IF-2, IF-3 and IF-11
- section 3: Data, already built in D1, so you can see what the database gives you
- section 4: Server, which is the spec
- section 6: Gates

The database is done (`supabase/migrations/20261118004433_inspection_findings.sql`). Do **not** change it, and do not build any screens.

## What to build

### 1. Feature switch
In `supabase/functions/_fleet-server/feature_flags.ts`, add `INSPECTION_FINDINGS: "inspection_findings"` next to `SERVICE_ITEMS`, with the comment "Log service: what an inspection found + Found by inspection list. Default off." It must be off by default, the same way `SERVICE_ITEMS` is.

### 2. Finishing a service skips found jobs (IF-2)
A found job is a line with `recommended = true`. It must be treated exactly like a declined line in every finish step.

- In `supabase/functions/_fleet-server/maintenance_completion.ts`:
  - `lineNeedsPartsUsage` returns false when `row.recommended === true`.
  - `dbLinesToLedgerInputs` passes `recommended: r.recommended === true`.
  - `mapDbLineToApi` (in this file) also returns `recommended`, `fromFoundLineId`, `closedAt` and `closedReason`.
- In `supabase/functions/_fleet-server/maintenance_service_ledger_core.ts`:
  - add `recommended?: boolean` to `LedgerLineInput`;
  - in the loop where `if (line.declined) continue;` sits (around line 226), skip `line.recommended` too. A found job then never writes a ledger row and never moves the schedule.
  - Check every other place in this file that reads `declined`, and apply the same rule.

### 3. Saving
In `supabase/functions/_fleet-server/service_items_save.ts`:

- **`mapApiLineToDb`:**
  - Map `recommended` (boolean, default false).
  - Map `fromFoundLineId` (uuid or null; reject a non-uuid with 400 `invalid_found_line_id`).
  - When `recommended` is true, send `part_number`, `part_id`, `brand`, `supplier_part_offer_id`, `unit_price`, `material`, `labor_amount`, `labor_rate` and `line_total` as null or 0, and send **no** items.

    The database already forces the money to 0. The part fields are stripped here so a found job can never reach parts usage or repeat alerts (IF-11).
  - Every key stays present, as today.
- **Error map** (next to `line_items_on_declined`, around line 214):
  - `line_items_on_found_job` → 400, "Jobs not done yet cannot include items."
  - `found_line_not_open` → 409, "This found job is already closed. The list has been refreshed."
  - `found_line_wrong_car` → 400, "That found job belongs to a different car."
- **Switch off:** if the company's switch is off, refuse with 400 `inspection_findings_off` any save that has a line with `recommended: true` or a `fromFoundLineId`. Do this in the save route, before the database is called. With the switch off, every other save behaves exactly as today.

### 4. Reading lines
In `supabase/functions/_fleet-server/maintenance_routes.ts`, `mapDbLineToApi` (around line 400) adds:
- `fromFoundLineId`
- `closedAt`
- `closedReason`
- `closedBy`

`recommended` and `declined` are already there.

### 5. Found-job status on a single service (for the history screen)
When `GET /maintenance-work-orders/:id` returns a work order, add `found` to each line that has `recommended = true`:

```
found: {
  status: "waiting" | "done" | "not_needed" | "service_deleted",
  doneWorkOrderId: string | null,   // the live service whose live line has from_found_line_id = this line
  doneDate: string | null,          // that service's performed_at_date
  doneSameDay: boolean,             // true when that service is this same service
  closedAt: string | null,
  closedByName: string | null       // the person's name for closed_by
}
```

- `status` is worked out in this order:
  1. a live line on a live service points at it → `done`;
  2. `closed_reason = 'not_needed'` → `not_needed`;
  3. `closed_reason = 'service_deleted'` → `service_deleted`;
  4. otherwise `waiting`.
- **Done today jobs:** a job marked "Done today" on the inspection itself is a normal line on the same service, not a found line. The screen sends it **without** `recommended`, so it never gets `found`. `doneSameDay` exists for the history row "Done the same day"; the screen round decides how to show it.
- **One query, not one per line:** get every line where `from_found_line_id IN (<this service's found line ids>) AND voided_at IS NULL`, joined to live work orders.
- **`closedByName`:** look for an existing way the Fleet server turns a user id into a display name (team members, profiles or similar) and reuse it. If none exists, use `supabase.auth.admin.getUserById` → `user_metadata.full_name` or `user_metadata.name`, else the email. Never fail the request because a name couldn't be found; send null.

### 6. Job list
The jobs payload built around line 1697 (the one that already sends `serviceItemsEnabled`) also sends:
- `inspectionFindingsEnabled`: the switch;
- on every job, `recordsFindings`: the category's `records_findings`, but **false for every job when the switch is off**.

Add `records_findings` to the category select it uses. Keep everything else in that payload the same.

### 7. New routes
Follow the existing tenant routes, for example `/maintenance-work-orders/:id/complete` around line 4115: `requireAuth()`, `requirePermission(...)`, `getOrgId(c)`, `rbacUserId(c)`, and the same error JSON shape. When the switch is off, all three return 404 `{ code: "inspection_findings_off" }`.

- **`GET /maintenance-found-work?vehicleId=<id>`:** `vehicles.view`; calls `fleet_open_found_work(org, vehicleId or null)`; returns `{ items: [...] }` with the database's keys.
- **`GET /maintenance-found-work/counts`:** `vehicles.view`; calls `fleet_found_work_counts(org)`; returns that object.
- **`POST /maintenance-found-work/:lineId/not-needed`:** `vehicles.edit`.
  - A non-uuid `lineId` → 400.
  - Calls `fleet_close_found_work(org, actor, lineId)`.
  - `found_line_not_open` → 409 `{ code: "found_line_not_open", error: "This found job is already closed. The list has been refreshed." }`
  - `found_line_not_found` → 404.
  - `actor_required` → 401.
  - On success, returns the database's object.

Register them wherever the other maintenance tenant routes are registered, so they work under the same base paths.

### 8. Fleet app: API and types only, no screens
- **`apps/fleet/src/types/maintenance.ts`:**
  - `MaintenanceLogLine` gets optional `fromFoundLineId`, `closedAt`, `closedReason`, `closedBy` and `found` (the shape above).
  - Add a `FoundWorkItem` type matching `fleet_open_found_work`'s keys.
  - Add a `FoundWorkCounts` type.
  - The category type gets optional `recordsFindings`.
- **`apps/fleet/src/services/api.ts`:** add `listFoundWork(vehicleId?: string)`, `foundWorkCounts()` and `markFoundWorkNotNeeded(lineId: string)`. Follow the style of `listMaintenanceWorkOrders` / `completeWorkOrder`, with the same base path and the same error handling. A 409 reaches the caller with `code: "found_line_not_open"` so a screen can show "Someone else already closed this job".
- Anything that reads the jobs payload's `serviceItemsEnabled` should also make `inspectionFindingsEnabled` available. Change the type only; no screen changes.

### 9. Server tests
Add `supabase/functions/_fleet-server/inspection_findings.test.ts`. Follow the existing `maintenance_completion.test.ts` and `service_items_*.test.ts` style, and use **real** shapes:
- `mapApiLineToDb` output for every line;
- the real `mapDbLineToApi`;
- the real ledger-input conversion.

No hand-written short JSON. Prove:
1. **Gate 2:** a finished service with one done job and one found job sends parts usage and the ledger only for the done job. The found job never reaches `recordCompletedServiceLines` targets.
2. `mapApiLineToDb` on a found line with a part number, prices and items gives no part fields, no amounts and no items. On a normal line nothing changes compared with today; compare against the current output.
3. **Gate 9:** with the switch off, the save route refuses `recommended: true` and `fromFoundLineId` with `inspection_findings_off`, and the three new routes return 404. With it on, they call the right database functions with the right arguments.
4. Not-needed maps `found_line_not_open` to 409 with that code, and a bad id to 400.
5. The `found` status works out `done`, `not_needed`, `service_deleted` and `waiting` correctly, and `doneSameDay` is right.
6. The jobs payload sends `recordsFindings: false` for every job when the switch is off, and the real value when it's on.

Then rebuild the bundle: `node scripts/build-edge-bundle.mjs fleet-ops`. That file is kept in git.

## How to check your work (local only)
1. Run the server tests:
   ```
   deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/inspection_findings.test.ts supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/parts_finder.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts
   ```
   Everything must pass. The last full run before this round was 122 passed, plus your new tests. Heavy Deno use can break the local Fleet dev app; if it does, stop the app and run `pnpm install`.
2. Run `pnpm --filter fleet exec tsc --noEmit` (or the repo's Fleet type check). It must pass.
3. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`. Both must pass.
4. Docker Desktop must be open. Make sure the local database has the D1 migration (`npx supabase db reset --no-seed` if not), then run `supabase/tests/inspection_findings_db_test.sql` once to confirm the database side still passes. Another tool sometimes resets the local database; if a test fails with "relation does not exist", wait a minute and run it again.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change the migration or any screen component. Change only the files named above, the new test file and the rebuilt bundle.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183).
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents; I'll read the files.
