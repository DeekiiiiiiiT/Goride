# Vehicle Database — Architecture Audit (open items only)

**Rev 3 · 2026-10-14** · Done items are removed; this lists only what's left.

**The rule:** Roam Dominion is the master reference database and never shows customer records. The Vehicle Database section (Catalog → Platforms & Engines → Maintenance templates → Parts) is one system built around `vehicle_catalog`. Every Roam app reads from it through the catalog API. Customer parts work lives in the RoamFleet app and RoamFleet `/admin` (Parts desk).

**Closed since Rev 2:**
- All rebuild work committed (`332e854e`); the working tree is clean.
- **Deployed:** fleet-core **v51** and fleet-ops **v252** (22:36 UTC, a minute after the commit). I downloaded the live bundles and confirmed they contain `catalog/v1`, `fleet-admin/parts` and `schedule_for_variant`.

**Prod state:** 0 confirmed parts → 0 ready variants. 5 global templates, none scoped. Demand counts last refreshed by hand (2 rows).

---

## What's left — in order

| # | Task | Item |
|---|---|---|
| 1 | Fix migration history for the rebuild | A-1 |
| 2 | Fix "Seed in-use" (rule source CHECK) | A-3 |
| 3 | Schedule the demand refresh | A-4 |
| 4 | Delete the org-scoped `/admin/*` routes; give rule reviews / proposals / link reviews a home; strengthen the privacy test | A-5 |
| 5 | Vehicle-class filter in `schedule_for_variant` | A-6 |
| 6 | Pickers in the scoped-schedule form | A-7 |
| 7 | Remove dead code (fixes 2 admin type errors) | A-8 |
| 8 | Tighten signal views; materialise readiness | A-9 |
| 9 | Data: templates, parts, families, offers | A-10 |

---

## Open items

### A-1 — Medium — Rebuild migration recorded under the wrong version

Prod applied the rebuild as **`20261014221100 vehicle_database_rebuild`**, but the repo file is **`20261015030000_vehicle_database_rebuild.sql`**. `migration list` shows `20261015030000` as local-only and `20261014221100` as remote-only. The next `db push` would try to run the rebuild again.

**Fix:**
```
npx supabase migration repair --status reverted 20261014221100
npx supabase migration repair --status applied  20261015030000
```

### A-3 — Medium — "Seed in-use" fails

`seed_in_use_engine_parts()` (rebuild migration L459–490) inserts `source = 'seed_in_use'`. The live `interchange_fitment_rule_source_check` allows only `manual | oem_catalog | supplier | install_confirmed | import`, so the button errors whenever there's a row to insert. It also matches groups to engines by **group-code suffix** (`'%-' || e.code`) and doesn't use demand.

**Fix:** in a new migration, add `'seed'` to the CHECK (or insert `'import'`). Derive the engine from the part's existing rules, not its group name.

### A-4 — Medium — Demand never refreshes on its own

`catalog_variant_demand` changes only when someone presses "Refresh demand", and there's no cron job.

**Fix:** pg_cron nightly `SELECT public.refresh_catalog_variant_demand();`. Add the readiness refresh to the same job once A-9 materialises it.

### A-5 — Medium — Org-scoped routes still in Dominion; three queues have no home

These are still registered on Dominion's `/admin/*` (fleet-core `routes.generated.json`, and present in the live bundle), duplicating the Parts desk:
- `GET /admin/org-part-stock`
- `GET`/`PATCH /admin/parts-sourcing-requests`
- `PATCH /admin/part-cores/:id`, `/admin/part-repeat-alerts/:id`, `/admin/part-warranty-claims/:id`
- `POST /admin/part-repeat-alerts/refresh`, `/admin/part-quotes/:id/reply`

These also return customer columns through `select("*")`:
- `GET /admin/part-link-reviews` returns `organization_id` and `work_order_line_id`.
- `listTable` `part-rule-reviews` / `part-rule-proposals` return `organization_id` on reviews.

With the Review tab gone, **"didn't fit" reviews, 3-fit rule proposals and part-number link reviews have no UI anywhere.**

**Fix:**
- **Delete the duplicate routes** and their `partsEnterpriseApi` methods.
- **Rule proposals and "didn't fit" reviews are catalog work.** Show them on Data quality as *part × variant × count* with Approve / Reject.
- **Link reviews are customer work.** They go in the Parts desk; Dominion keeps only `catalog_signal_unmatched_numbers`.
- **Strengthen `catalog_privacy.test.ts`:** today it unit-tests the helper and string-checks two files. Make it call every Dominion vehicle-database route against fixtures with customer rows, and run each response through `findCustomerIdentityLeak`.

### A-6 — Low-Medium — Scoped schedules ignore vehicle class

`schedule_for_variant` returns every global template regardless of `applicable_vehicle_classes` (the old bootstrap path filtered it), so motorcycle variants would get car tasks. `p_vehicle_year` is unused, and `catalogApplied` in `maintenance_bootstrap_core.ts` still counts `'catalog'`, which is now always 0.

**Fix:** filter by `vehicle_catalog.vehicle_class`. Use or drop the year parameter. Count `'variant'`.

### A-7 — Low — Scoped-schedule form takes raw IDs

`FamilyScheduleForm.tsx` asks for "Platform, engine, or variant id" and "Service component id" as text.

**Fix:** use pickers (`/admin/vehicle-platforms`, `/admin/engine-families`, `/admin/catalog-variants`, `/admin/service-components`), show the blast radius before saving, and pre-fill it from the Variant hub.

### A-8 — Low — Dead code

Delete these:
- **`PartsEnterprisePanels.tsx`:** `PartsVehiclesPanel` and `PartsQueuePanel` aren't mounted, and they cause the admin type errors at L105 / L112.
- **`parts_fleet_coverage.ts`:** unused.
- **`parts_catalog_review.ts`:**
  - `loadPartsCompare` and its per-org `loadFleetChassis` are unused.
  - `loadCatalogReview` still reads fleet vehicles and `organizations` names, then returns `gaps: []`.
- **`AdminLayout.tsx` (RoamFleet):** `PLATFORM_ROLE_PAGES` still lists `motor-vehicles`, `pending-motor-vehicles`, `maintenance-templates` and `parts-sourcing`.

### A-9 — Low — Signals and readiness polish

- **`catalog_signal_part_demand`:** returns `max(need_text)`, raw customer free text. Return the component + count only, or scrub it.
- **Thresholds:** `catalog_signal_fit` has no fleet threshold, while `catalog_signal_unmatched_numbers` uses ≥ 2. Use one threshold everywhere.
- **`variant_parts_readiness`:** a plain view calling `parts_for_vehicle` 3,560 times, and the matrix reads it three times. Materialise it and refresh it with A-4.

### A-10 — Data (tools ready, needs a person)

- **Templates:** 5 global, **0 platform/engine/variant, 0 with a component**. Build platform / engine schedules (after A-7).
- **Parts:** 0 confirmed. Verify the seeded numbers on Data quality, then add pads, rotors, cabin filter, wipers and shocks, plus platform rules for air filter / belt, starting with in-use variants.
- **Families:** decide the `platform_family_review` rows (0 parents set).
- **Reference offers:** 0.

---

## Checks to re-run next review

- `npx supabase migration list --linked`: `20261015030000` on both sides; no remote-only `20261014221100`.
- `routes.generated.json` (fleet-core): no `/admin/org-part-stock`, `/admin/parts-sourcing-requests`, `/admin/part-cores|repeat-alerts|warranty-claims|quotes`.
- **Prod:**
  - the rule source CHECK allows the seed source
  - a `refresh_catalog_variant_demand` cron job
  - templates by scope
  - confirmed parts / ready variants
- **Deploy:** `npx supabase functions download fleet-core --project-ref csfllzzastacofsvcdsc` into a scratch dir and grep for the changed routes. Local bundles aren't rebuilt by your deploys, so mtimes can't be trusted.
- Deno 15/15 · CSV vitest · fleet `tsc` 501 · admin `tsc` has no errors in `parts-sourcing/`.
