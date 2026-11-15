# Give Cursor this — Service items, Round S1 (Server: Dominion May need + Supplies, old supply link removed)

**Hold until Round D2 has been checked.** Then give this to Cursor.

You are building **Round S1 only** of `docs/service-items-architecture-audit.md`. Read **sections 1, 3f and 4.1** first; they are the spec. The tables you use already exist (Round D1: `supabase/migrations/20261113154942_service_items_catalogue.sql` — `maintenance_unit`, `maintenance_supply`, `maintenance_job_item`, the clash triggers and their named error codes). No Fleet logging code and no screen code in this round.

## What to build

### 1. Migration (audit 3f)
Create with `npx supabase migration new service_items_drop_old_supply_link`. It must:
1. `CREATE OR REPLACE FUNCTION public.variant_parts_checklist(p_catalog_id uuid)` — copy the **latest** definition (find it with a search of `supabase/migrations/`; today it is in `20261030193000_part_listings.sql`, around line 1076) and remove only the `component_related_supply` query and the `'supplies'` key. Keep the same return type, security settings and grants.
2. `DROP FUNCTION IF EXISTS public.save_related_supply(jsonb);`
3. `DROP TABLE IF EXISTS public.component_related_supply;`

### 2. Remove the old supply link everywhere (audit 4.1, last row; section 1 lists the places)
- `POST /admin/catalog/related-supplies` in `supabase/functions/_fleet-server/catalog_routes.ts`.
- `saveRelatedSupply` in `apps/admin/src/services/partSourcingService.ts`.
- `loadRelatedSupplies` and `relatedSupplies` in `supabase/functions/_fleet-server/catalog_api.ts` and `supabase/functions/_fleet-server/part_sourcing_routes.ts`.
- `RelatedSupply` and the `relatedSupplies` field in `packages/types/src/partSourcing.ts`.
- The `component_related_supply` stub in `supabase/functions/_fleet-server/parts_finder.test.ts`.
- Afterwards a repo search (excluding `supabase/migrations/`, `docs/` and built bundles) for `relatedSupplies`, `RelatedSupply`, `component_related_supply`, `save_related_supply`, `saveRelatedSupply`, `related-supplies` must find nothing.

### 3. Dominion routes (audit 4.1), in `supabase/functions/_fleet-server/maintenance_jobs_admin_routes.ts` with pure helpers in `maintenance_jobs_admin_helpers.ts`
Follow the existing patterns in that file: `requireAuth()`, `assertPlatformStaffResponse` for reads, `assertCatalogWriteResponse` for writes, add every new route to `MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS`, `pgErrorMessage` for unknown errors. The signed-in user's id (`c.get("rbacUser")` → `userId ?? id`, as in `catalog_access.ts`) goes into `created_by` / `updated_by` / `removed_by`. Map every named database error to a plain message and status:

| Database code | Status | Message |
|---|---|---|
| `supply_name_taken` | 409 | "Another active supply uses this name. Rename one of them first." |
| `job_item_also_do_clash` (from job-items routes) | 409 | "This part is already in Also do for this job." |
| `job_item_also_do_clash` (from the job-relations route) | 409 | "This part is already in May need for this job." |
| `job_item_job_invalid` | 400 | "May-need items can only be added to a job." |
| `job_item_part_type_invalid` | 400 | "Only part types can be added as parts." |
| `job_item_identity_locked` | 409 | "To change the item, remove it and add the new one." |
| unique violation on an active link | 409 | "This item is already listed for this job." |

**a. `GET /admin/maintenance/jobs` (existing)** — keep everything it returns today and add:
- on each job: `items: [{ linkId, kind: 'part_type' | 'supply', itemId, name, need, qtyHint, note, sortOrder, itemRetired, unitLabelOne, unitLabelMany }]` — links with `removed_at IS NULL`, ordered by `sort_order` then `created_at`; `itemRetired` is true when the part type or supply isn't active; unit labels only for supplies;
- top level: `supplies: [{ id, code, name, description, iconKey, unitId, unitCode, status, usedOnJobs }]` (all supplies, sorted by name; `usedOnJobs` = count of active links) and `units: [{ id, code, labelOne, labelMany }]` (active only, by `sort_order`).

**b. Supplies**
- `GET /admin/maintenance/supplies?status=active|retired` → `{ items: [...same shape as above] }`.
- `POST /admin/maintenance/supplies` body `{ name, description, unitId, iconKey }` → `{ item }`.
- `PATCH /admin/maintenance/supplies/:id` (any of the same fields) → `{ item }`.
- `POST /admin/maintenance/supplies/:id/retire` → `{ item, hiddenFromJobs }` (active links on active jobs at the time of retiring). Only `status` changes; links stay.
- `POST /admin/maintenance/supplies/:id/restore` → `{ item }`; name clash → 409 as above.
- Validation (pure helpers with unit tests): `tidySupplyName` = trim + collapse whitespace, 1–120 characters ("Name is required." / "Name must be 120 characters or fewer."); description required after trim ("Description is required." — the column defaults to `''`, so the server must refuse blank); `unitId` must be an **active** unit ("Choose a unit."); `iconKey` must be in a server copy of `JOB_ICON_KEYS` from `apps/admin/src/components/admin/maintenance-master/jobs/jobsApi.ts` (add the copy to the helpers with a `// Keep in sync with apps/admin/.../jobsApi.ts JOB_ICON_KEYS` comment).

**c. May-need links**
- `POST /admin/maintenance/job-items` body `{ jobId, kind: 'part_type' | 'supply', itemId, need, qtyHint?, note? }` → `{ item }` (same shape as a job's `items[]` entry). Refuse when the job, part type or supply is retired ("Retired items can't be added." / "Retired jobs can't be changed."); `need` must be `usually` / `sometimes`; `qtyHint` > 0 with at most 3 decimals; `note` trimmed, at most 300 characters. New links go to the end (`sort_order` = current max + 10).
- `PATCH /admin/maintenance/job-items/:id` — only `need`, `qtyHint`, `note`; any other field → 400 "To change the item, remove it and add the new one."; a removed link → 404.
- `POST /admin/maintenance/job-items/:id/remove` — sets `removed_at = now()`, `removed_by`; already removed → 200 (safe to call twice).
- `PUT /admin/maintenance/jobs/:id/items/order` body `{ orderedIds }` — must be exactly the job's active link ids; saves `sort_order` 10, 20, 30 … ; otherwise 400 "The list changed. Reload and try again."

**d. Existing routes**
- `POST /admin/maintenance/job-relations`: map `job_item_also_do_clash` as in the table.
- `POST /admin/maintenance/jobs/:id/retire`: add `hiddenFromMayNeed` to the response = active May-need links where this job is the job or the part type. Do not change the existing cascade.

### 4. Tests
- **Deno unit tests** (new `supabase/functions/_fleet-server/maintenance_supplies_admin_helpers.test.ts`, or extend `maintenance_jobs_admin_helpers.test.ts`): `tidySupplyName` cases (`"  Brake   cleaner "` → `"Brake cleaner"`, blank, 121 characters); description required; icon key check; qty-hint check (0, 1.2345, 1.5); the error-code → status / message mapping for every row of the table above; the order-validation helper.
- **Extend `maintenance_jobs_admin_routes.test.ts`** so every new route is in the guards map with the right guard (reads `staff_read`, writes `catalog.write`).
- **SQL:** add to `supabase/tests/service_items_db_test.sql` (inside its transaction) that `public.component_related_supply` and `public.save_related_supply(jsonb)` no longer exist, and that `variant_parts_checklist(<any uuid>)` returns jsonb without a `supplies` key.
- **CI:** in `.github/workflows/ci.yml` add a step "Deno test maintenance jobs admin" running `deno test --no-check` on `maintenance_jobs_admin_helpers.test.ts`, `maintenance_jobs_admin_routes.test.ts` and the new test file; add the new migration to the `paths` lists in `.github/workflows/parts-sql-checks.yml`.
- `parts_finder.test.ts` and every other existing test must still pass.

### 5. Built bundle
`supabase/functions/fleet-ops/index.ts` is a built bundle kept in git and serves these routes. After the code changes, rebuild it with `node scripts/build-edge-bundle.mjs fleet-ops`. Do not commit or hand-edit any other bundle (`fleet-core` is built at deploy).

## How to check your work (local only)
1. `npx supabase db reset` on the **local** database — no errors.
2. `service_items_checks.sql`, `service_items_db_test.sql` and (if Round D2 is in) `service_items_save_db_test.sql` on the local database the way CI runs them — all pass.
3. `deno test --no-check` on the maintenance-jobs test files and `parts_finder.test.ts` — all pass.
4. `pnpm --filter admin exec tsc --noEmit` (or the repo's admin typecheck) shows no new errors in the files you changed.
5. `node scripts/validate-migration-sql.mjs` and `pnpm check` — both pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code (use the existing guards; don't change them).
- No git branch, commit or push.
- Change only the files named in this prompt.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). Leave the local Supabase database as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL — I'll read the files.
