# Give Cursor this — Service items, Round S3 fix 2

The S3 fixes are in and the first five are correct. Fix 3 (re-read after the claim) added one Critical problem. Fix only this.

## The problem
In `runCompletion` (`supabase/functions/_fleet-server/maintenance_completion.ts`), the re-read lines go through `enrichLines` first:
`const freshLines = await enrichLines(workOrderId, freshLinesRaw)`.

`enrichLines` is `enrichLinesWithItems`, which returns lines in the **API shape** (`mapDbLineToApi`: `componentId`, `partId`, `partNumber`, `lineTotal`). Those lines are then passed to every step as `lineRows`, but the steps read **database** columns:
- `lineNeedsPartsUsage` reads `part_id` / `part_number`, so it is always false, **parts usage never runs and stock is never deducted**;
- `dbLinesToLedgerInputs` reads `component_id`, so `categoryId` is always null, **no service history rows are written and schedules never advance**;
- `serviceNetTotal` / `lineSubtotal` / `discountTooLarge` read `line_total`, so they recompute from the camelCase fields instead of the stored total;
- `apiLines = freshLines.map(mapDbLineToApi)` maps the lines a second time, so the record's `payload_json.lines` is mostly empty;
- the response runs `enrichLines(workOrderId, freshLines)`, which maps them a second time.

The Deno tests stub the steps, so none of this shows.

## Fix
- Use the raw database rows (`freshLinesRaw`) for everything except the response: `lineRows` passed to the steps, the discount check, `serviceNetTotal`, `lineSubtotal`, and `apiLines = freshLinesRaw.map(mapDbLineToApi)`.
- Call `enrichLines(workOrderId, freshLinesRaw)` once, only for the response `item`.
- Check the replay path (`reason === "completed"`) the same way: it must pass raw rows to `enrichLines`.

## Test that would have caught it
In `maintenance_completion.test.ts`, add a test that uses the **default** steps (`buildDefaultCompletionSteps`, not stubs) with a fake Supabase client. The client returns a database-shaped line (`component_id`, `part_id`, `line_total`, snake_case), records the RPC and table calls, and answers claim / finish. Assert:
- `apply_parts_usage_for_work_order` is called (the line has a `part_id`);
- the `maintenance_service_ledger` insert receives that line's `component_id` as `category_id` and its `id` as `work_order_line_id`;
- the record's `cost` equals `line_total` minus the discount;
- `payload_json.lines[0].componentId` is that `component_id`.

## Then (local only)
1. `deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/parts_finder.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts`. All must pass.
2. `pnpm check`. Rebuild `fleet-ops/index.ts` with `node scripts/build-edge-bundle.mjs fleet-ops`.

## Rules
- Never touch the live database, `.env.local` or any login / permission code. **Don't stop or start anything on ports 3000, 3001 or 5173.** No git branch, commit or push.
- Change only `maintenance_completion.ts`, `maintenance_completion.test.ts` and the rebuilt `fleet-ops/index.ts`.
- Report: clickable links to changed files + pass / fail of each check. Don't paste file contents.
