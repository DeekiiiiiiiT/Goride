# Give Cursor this — Service items, Round S6 (`part_source`)

You are building **Round S6 only**. Read `docs/service-items-architecture-audit.md` section 1 first, then the Open-list entry **"NEXT BUILD: `part_source` round"**. That entry is the spec. Build exactly it and nothing else.

**Goal in one sentence:** when a May-need **part item** is saved, store *how the part was chosen* (`'car'` = picked from this car's own list, `'size'` = picked from "fits by size", `'typed'` = typed in), so it can be read back later. Today only `part_id` is stored, so "fits by size" and "typed in" can't be told apart.

**Scope:** part items only (`maintenance_work_order_line_item`, `item_kind = 'part_type'`). **Not** the job's own part on the line (`maintenance_work_order_lines.part_id`): that picker has no "fits by size" option, so `part_id` already says everything. No screen redesign. Live has **0 part-item rows** today, so there is nothing to backfill.

## Files

- New migration: create it with `npx supabase migration new service_items_part_source` (real current UTC time; never pick the date yourself).
- `supabase/migrations/20261113171047_service_items_logging_core.sql`: **read only**. It has the current definitions of `fleet._mwoli_items_multiset_equal` (~393) and `public.fleet_save_work_order` (~454; item insert ~839). Re-create both in the new migration with `CREATE OR REPLACE`, copied from the newest definition **in any later migration if one exists** (search first), changed only as below.
- `packages/types/src/serviceItems.ts`: `LineItemInput`, `LineItem`, `ParsedLineItem`, `parseLineItems`.
- `supabase/functions/_fleet-server/service_items_save.ts`: `prepareWorkOrderLines` (the `dbItems.push` ~620), the item read in the line loader (~725), `mapDbLineItemToApi`.
- `apps/fleet/src/types/maintenance.ts`: `LineItemDraft`, `lineItemForWire`.
- `apps/fleet/src/components/vehicles/maintenance-logging/log-service/itemsUsed.ts` (+ its test), and where `LogMaintenanceServiceDialog.tsx` turns saved items back into screen items (~line 885, `existing.items.map(...)`).

## D — Database (new migration)

1. `ALTER TABLE public.maintenance_work_order_line_item ADD COLUMN part_source text;` Nullable. NULL = saved before this column, or a part item with no part named.
2. Constraints:
   - `part_source IS NULL OR part_source IN ('car','size','typed')`
   - `part_source IS NULL OR item_kind = 'part_type'`
   - `part_source <> 'car' OR part_id IS NOT NULL` (car always has a catalogue part)
   - `part_source NOT IN ('size','typed') OR part_id IS NULL`
   - Check the 1 existing live row satisfies all of them (it's a supply with NULL: yes). Add them as normal (validated) constraints.
3. `fleet._mwoli_items_multiset_equal`: add `part_source` to both the `wanted` (`nullif(btrim(elem ->> 'part_source'), '')`) and the `have` column lists, so a change in `part_source` alone counts as a change.
4. `fleet_save_work_order`: the item `INSERT` (~839) also writes `part_source` from the item JSON (`nullif(btrim(elem ->> 'part_source'), '')`). Nothing else in the function changes. Grants stay as they are (re-apply the same `REVOKE`/`GRANT` lines the original has, including the anon revoke).
5. Comments:
   - `COMMENT ON COLUMN public.maintenance_work_order_line_item.part_source IS 'How a part item''s part was chosen: car = from this car''s own parts list (part_id set, server-checked); size = from "fits by size"; typed = typed in. NULL = saved before 16 Nov 2026 or no part named.';`
   - `COMMENT ON COLUMN public.maintenance_service_categories.is_part IS 'True if the job line asks which product went in (part picker, brand, part number) and the job shows in Find parts. Does not mean the job is a part. For fluid jobs it records the product spec (oil grade, DOT, coolant type).';`

## S — Shared types + server

1. `LineItemInput.partSource?: "car" | "size" | "typed" | null`; `LineItem.partSource: … | null`; `ParsedLineItem.part_source: … | null`.
2. `parseLineItems` (reads `partSource ?? part_source`):
   - Not a part item (`supply` / `other`) with a non-null source → `{ ok: false, code: "part_source_not_allowed" }`.
   - Any value other than the three, or `""` → `part_source_invalid`.
   - `'car'` without `partId` → `part_source_part_mismatch`; `'size'` / `'typed'` **with** `partId` → `part_source_part_mismatch`.
   - `'typed'` / `'size'` with no brand **and** no part number → `part_source_needs_part` (nothing was named).
   - **Missing** (an older Fleet tab still open): if `partId` is set, use `'car'` (certain); otherwise leave it **NULL**. Never guess `'typed'` or `'size'`.
   - Add the new codes wherever `parseLineItems` codes are mapped to messages / HTTP 400 (search the existing codes such as `part_number_not_allowed`).
3. `prepareWorkOrderLines`: put `part_source` on each `dbItems` row. Keep the existing "part not for this car" check: a `'car'` item still has to be in this car's catalogue.
4. Reads: the line loader's item list (~725) and `mapDbLineItemToApi` return `part_source` / `partSource`.

## F — Fleet (no visual change)

1. `LineItemDraft`: add `partSource?: "car" | "size" | "typed" | null` (keep `partFit` / `partLabel` screen-only as today).
2. `lineItemForWire`: send `partSource` for part items only: `partId` → `'car'`; else `partFit === 'size'` → `'size'`; else brand or part number present → `'typed'`; else `null`. Supplies / other → `null`.
3. Reading a saved service back into the screen (the `existing.items.map(...)` in `LogMaintenanceServiceDialog.tsx`): add a pure helper in `itemsUsed.ts`, e.g. `draftFromSavedItem(item)`, that sets `partFit` from `partSource` (`'car'` → `'car'`, `'size'` → `'size'`, else none) and `partLabel` from brand (+ " · " + part number when both) for part items with a brand or part number. Then `pickedPartBadge()` shows the right badge after reopening: car → "Fits this car" (only if `partId`), size → "Check before buying", typed **or NULL** → "Typed in". It must never show "verified" without a `partId`.

## Tests (write them in this round)

- **SQL** (`supabase/tests/`, same style as the other service-items SQL tests): each constraint rejects its bad case; a good row for each of the three values saves; `_mwoli_items_multiset_equal` returns false when only `part_source` differs.
- **Save function, real payload:** call `fleet_save_work_order` on the local copy with the **exact JSON `prepareWorkOrderLines` builds** for a line with three part items (car / size / typed), every key present and JSON `null`s where empty (lesson from S2: hand-written test JSON hid a real failure). Assert the three rows have `part_source` car / size / typed.
- **Completed log:** saving changes to a completed service still fails as before (`immutable`); `part_source` doesn't open a way around it.
- **Deno** (`service_items_save.test.ts` / `service_items_line_items.test.ts`): `parseLineItems` for every new code and the "missing → car only with partId, else NULL" rule; `prepareWorkOrderLines` passes `part_source` through; `mapDbLineItemToApi` returns `partSource`.
- **Round trip (the reviewer's test):** save a service with a `'typed'` part item, read it back through the real read path, and assert `partSource === 'typed'` (not NULL, not `'car'`). The same for `'car'` and `'size'`. Don't stub the read: the S3 / UI2 lessons were that stubbed reads hid real bugs.
- **Fleet unit** (`itemsUsed.test.ts`): `lineItemForWire` for car / size / typed / nothing named / supply; `draftFromSavedItem` + `pickedPartBadge` for saved car (with `partId`) → car, size → size, typed → typed, **NULL with a brand → typed**, NULL with nothing → no label; never car without `partId`.
- **Click-through** (`e2e/fleet-service-items.spec.ts`): in the existing "Type it in instead" test, also assert the saved row's `part_source = 'typed'` in the database, and that reopening the service shows "Typed in" on that item. Write it; don't run the click-throughs (Claude runs them).
- Keep every existing test passing.

## Run before you report

Git Bash, Docker Desktop open, local copy only:
```
export MSYS_NO_PATHCONV=1
pnpm test:service-items --no-e2e
pnpm check
```
Stop anything you started in the background before you report.

## Report back

Only file links and results, no pasted code:
- a link to every file you changed or added (with the new migration's file name);
- the `pnpm test:service-items --no-e2e` summary (each PASS / FAIL line) and `pnpm check` result;
- anything this prompt got wrong, or any later definition of the two functions you found and copied from.
