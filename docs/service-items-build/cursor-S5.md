# Give Cursor this — Service items, Round S5 (code-review fixes)

You are building **Round S5 only** of `docs/service-items-architecture-audit.md`. Read **section 1** and **section 8 "UI2 result"** first. Everything is built; this round fixes what the 14 Nov code review found. Claude checked each finding against the code; the verdict and the one fix for each is below. No screen code in this round.

Files: `supabase/functions/_fleet-server/maintenance_routes.ts` (routes), `service_items_save.ts` (`prepareWorkOrderLines`), `maintenance_completion.ts` (`runCompletion`), `apps/fleet|admin|driver/src/services/api.ts` (clients).

## Fixes

### F1 — replayed legacy save wipes its lines (real)
`POST /maintenance-logs`, idempotent replay of a completed work order (~line 1925): `lines: enriched.map(mapDbLineToApi)` maps lines that `enrichLinesWithItems` already mapped, so every line comes back with no name, amounts or items. Return `enriched` as is. Search the file for any other `enrichLinesWithItems(...)` result that is mapped again and fix it the same way.

### F2 — 428 that can never be satisfied (real)
`PATCH /maintenance-logs/:vehicleId/:id` (~line 2288) answers `version_required` whenever the record has lines, even when it has **no** work order. Such a log has no version to send (history only returns `version` when there's a work order), so every edit fails forever. Require `expectedVersion` only when `isUuid(editWorkOrderId)`. When there's no work order, the save creates one (as today) with no version check.

### F3 — saved drafts lose their job ids (real)
`prepareWorkOrderLines` (`service_items_save.ts` ~589) deletes `row.id` on new lines, and the routes build `savedLines` from `prepared.lines[i].id` (~2093 POST, ~2362 PATCH). New lines are stored in `payload_json.lines` with no id, so history can't attach items / `itemsAmount` to them, and the response's `lines` have no ids. Build `savedLines` from the lines the save function returns (`saveRes.data.lines`, which carry the real ids), matched to the client lines by `sort_order`.

### F4 — an edit turns "package complete" off (real)
`PATCH /maintenance-logs` (~2342) always sends `package_complete: body.packageComplete === true || …`, i.e. an explicit `false` when the body leaves it out, and the save function's `coalesce` keeps that `false`. Send `package_complete` only when the body has `packageComplete` / `package_complete`; otherwise leave the key out so the stored value stays.

### F5 — finishing should skip deleted jobs (can't happen today; add the guard)
`runCompletion` (~505) reads every line, including voided ones. Today a job can only be voided after the service is completed (`fleet_void_work_order_line` refuses otherwise), so this isn't reachable. Still filter `voided_at IS NULL` in that read, so totals, parts usage, service history and the books can never include a deleted job.

### F6 — a retried legacy save makes a second service (real for Fleet Admin, Driver, Fleet CSV import)
`saveMaintenanceLog` in all three `api.ts` files makes a **new random** `idempotencyKey` on every call, so a retry after a failed finish creates a second in-progress service. Use the log's own `id` as the key when it's a uuid; only generate a random key when there's no id. (`data-import-executor.ts` calls the Fleet one.)

### F7 — dead warning code (finishing steps are safe to repeat by design)
A books failure now stops completion (S4), so in `runCompletion` `ledgerFailed` can never be true when the response is built (~678) and the `ledgerWarning` text is unreachable. Remove `ledgerFailed` and that branch; keep `ledgerPosted`. Then add a Deno test proving the S3 design: run the **real** default steps for parts usage, service history and the package advance twice for the same work order (stubbing only the database calls) and assert the second run writes nothing new (parts usage `ON CONFLICT (line_id)`, history dedupe index, package advance sets fixed values).

### F8 — saved lines paired by the wrong position (real for malformed bodies)
`prepareWorkOrderLines` skips non-object entries (`if (!raw || typeof raw !== "object") continue;` ~296 / ~322), so `prepared.lines[i]` no longer lines up with `rawLines[i]`. With F3 the pairing is by `sort_order`; also return a 400 `{ code: "line_invalid" }` for a non-object line instead of skipping it silently.

### F9 — slow save with many jobs (real, minor)
In `prepareWorkOrderLines`, `getCatalogParts` runs once per part type, one after another (~445), even for part types with no picked part. Look up only part types that have a `part_id`, and run those lookups with `Promise.all`. `resolveClientLineId` (~251, called per line ~327) runs one query per line; check all client line ids with one `.in("id", ids)` query.

### F10 — version lookup loads the whole history (real, no live caller yet)
Fleet `api.getMaintenanceLogVersion` downloads every log for the car just to read one version, and `updateMaintenanceLog` does it when the caller sent none. Its only callers are the driver-request complete / dismiss handlers in `FleetMaintenanceHub.tsx`, which no button uses today. Fix: `GET /maintenance-requests` returns `version` on each row (from its draft work order; one `.in("id", woIds)` query). Remove `getMaintenanceLogVersion` and the fallback lookup in `updateMaintenanceLog`; `LogMaintenanceServiceDialog.tsx` already takes `initialLog.version` when it's there — remove its `getMaintenanceLogVersion` call too (that one line in the open effect is the only screen change in this round).

## Tests
- Deno: one test per fix F1–F4, F6 (key = log id), F8 and F10 (requests carry `version`), plus F7's repeat test. Where a test touches a route, drive the real route with the database stubbed at the client, not whole steps (lesson from S3 and UI2).
- Keep every existing test passing.

## Run before you report
Git Bash, Docker Desktop open, local copy only:
```
export MSYS_NO_PATHCONV=1
pnpm test:service-items --no-e2e
```
That rebuilds the server bundles and runs the 7 SQL tests, the server tests and the Fleet + Dominion unit tests. Don't run the click-throughs — Claude runs the full `pnpm test:service-items` after your round. Stop anything you started in the background before you report.

## Report back
Only file links and results, no pasted code:
- a link to every file you changed or added;
- the `pnpm test:service-items --no-e2e` summary (each PASS / FAIL line);
- anything you found that this prompt got wrong.
