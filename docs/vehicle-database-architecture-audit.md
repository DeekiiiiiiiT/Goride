# Vehicle Database — Architecture Audit (open items only)

**Rev 2 · 2026-10-14** · Done items are removed; this lists only what's left.

**The rule:** Roam Dominion is the master reference database and never shows customer records. The Vehicle Database section (Catalog → Platforms & Engines → Maintenance templates → Parts) is one system built around `vehicle_catalog`. Every Roam app reads from it through the catalog API. Customer parts work lives in the RoamFleet app and RoamFleet `/admin` (Parts desk).

**Built and verified in code:**
- **Catalog API:** `/catalog/v1/*` (variant, parts, schedule, service-kit, resolve); fleet `compatible-parts` now goes through it.
- **Dominion UI:** per-fleet coverage, switch and compare removed; Data quality (matrix + verification), Platforms & Engines (blast radius, families) and the Variant hub (6 tabs) added.
- **Maintenance:** templates scope ladder + `component_id`, and `schedule_for_variant` used by the fleet bootstrap.
- **Signal layer:** demand counts, signal views, `catalog_task`, anonymised Pending catalog.
- **RoamFleet `/admin`:** Parts desk (requests, quotes, cores, claims, alerts, stock, broken links) behind `requireProductAdmin("fleet")`; the stale RoamFleet nav has been emptied.
- **Tests and CI:** Deno 15/15 (privacy + parts), CSV vitest 1/1, SQL checks in `parts-sql-checks.yml`, fleet `tsc` 501 (baseline).

---

## What's left — in order

| # | Task | Item |
|---|---|---|
| 1 | Commit; record the migration | A-1 |
| 2 | `deploy:fleet-core` + `deploy:fleet-ops` | A-2 |
| 3 | Fix "Seed in-use" (rule source CHECK) | A-3 |
| 4 | Schedule the demand refresh | A-4 |
| 5 | Delete the org-scoped `/admin/*` routes; give rule reviews / proposals / link reviews a proper home | A-5 |
| 6 | Vehicle-class filter in `schedule_for_variant` | A-6 |
| 7 | Pickers in the scoped-schedule form | A-7 |
| 8 | Remove dead code (fixes 2 admin type errors) | A-8 |
| 9 | Tighten the signal views; materialise readiness | A-9 |
| 10 | Data: templates, parts, families | A-10 |

---

## Open items

### A-1 — High — Nothing is committed; the migration isn't recorded

- **Uncommitted:** every rebuild file is uncommitted, including `20261015030000_vehicle_database_rebuild.sql`, `catalog_api.ts`, `catalog_routes.ts`, `fleet_admin_parts_routes.ts`, `VariantHub.tsx`, `CatalogQualityPage.tsx`, `PlatformsEnginesPage.tsx`, `FleetAdminPartsDesk.tsx` and the tests.
- **Applied out of band:** prod already has the migration's objects (`catalog_task`, `catalog_variant_demand`, `variant_parts_readiness`, `schedule_for_variant`), but `20261015030000` isn't in `schema_migrations`.

**Fix:**
- Commit.
- Run `npx supabase migration repair --status applied 20261015030000`.

### A-2 — High — The rebuild isn't deployed

| Function | Live | Local bundle built | Has the rebuild? |
|---|---|---|---|
| fleet-core | v50, 14:25 UTC | 09:25 CDT | ✗ (no `catalog/v1`) |
| fleet-ops | v251, 11:35 UTC | 06:28 CDT | ✗ (no `schedule_for_variant`) |

Thirteen `_fleet-server` / `packages/types` files changed after those builds. Until both are redeployed:
- the Data quality, Platforms & Engines, Variant hub and Parts desk pages call routes production doesn't have
- fleet `compatible-parts` still runs the old path
- fleet schedules don't use the scope ladder

**Fix:** `npm run deploy:fleet-core` and `npm run deploy:fleet-ops` after A-1. Then confirm both deploy times are later than the commit.

### A-3 — Medium — "Seed in-use" fails

`seed_in_use_engine_parts()` (migration L459–490) inserts rules with `source = 'seed_in_use'`. The live CHECK only allows `manual | oem_catalog | supplier | install_confirmed | import`, so the button errors whenever there's a row to insert. It also:
- matches groups to engines by **group-code suffix** (`'%-' || e.code`), which is fragile;
- doesn't use demand, despite its name.

**Fix:** add `'seed'` to `interchange_fitment_rule_source_check` (or use `'import'`), and derive the engine from the part's existing rules or target, not its group name.

### A-4 — Medium — Demand never refreshes on its own

`catalog_variant_demand` is filled only by the "Refresh demand" button. The matrix's "in-use" numbers go stale as fleets add vehicles.

**Fix:** pg_cron nightly `SELECT public.refresh_catalog_variant_demand();`. Refresh `variant_parts_readiness` in the same job once it's materialised (A-9).

### A-5 — Medium — Org-scoped routes still live in Dominion; three queues have no home

The Parts desk duplicates these, but they're still registered on Dominion's `/admin/*` (fleet-core `routes.generated.json`):
- `GET /admin/org-part-stock`
- `GET`/`PATCH /admin/parts-sourcing-requests`
- `PATCH /admin/part-cores/:id`, `/admin/part-repeat-alerts/:id`, `/admin/part-warranty-claims/:id`
- `POST /admin/part-repeat-alerts/refresh`, `/admin/part-quotes/:id/reply`

These also return customer columns through `select("*")`:
- `GET /admin/part-link-reviews` returns `organization_id` and `work_order_line_id`.
- `listTable` `part-rule-reviews` / `part-rule-proposals` return `organization_id` on reviews.

Since the Review tab was unmounted, **"didn't fit" reviews, 3-fit rule proposals and part-number link reviews have no UI anywhere.**

**Fix:**
- **Delete the duplicate routes** from `parts_enterprise_routes.ts` / `part_sourcing_routes.ts`, plus their `partsEnterpriseApi` methods.
- **Rule proposals and "didn't fit" reviews are catalog work.** Show them on Data quality as *part × variant × count* (from `catalog_signal_fit` + proposals), with Approve / Reject.
- **Link reviews are customer work.** Resolving a job line belongs in the Parts desk. Dominion keeps only `catalog_signal_unmatched_numbers`.
- **Strengthen `catalog_privacy.test.ts`:** today it unit-tests the helper and string-checks two files. Make it run every Dominion vehicle-database route against fixtures that contain customer rows, and pass each response through `findCustomerIdentityLeak`.

### A-6 — Low-Medium — Scoped schedules ignore vehicle class

The old fallback in `maintenance_bootstrap_core.ts` filtered global templates by `applicable_vehicle_classes`. `schedule_for_variant` doesn't, so a motorcycle variant would get car tasks. `p_vehicle_year` is also unused, and the bootstrap's `catalogApplied` still counts `'catalog'`, which is now always 0.

**Fix:** join `vehicle_catalog.vehicle_class` and filter `applicable_vehicle_classes`. Use `p_vehicle_year` or drop it. Count `'variant'`.

### A-7 — Low — Scoped-schedule form takes raw IDs

`FamilyScheduleForm.tsx` asks for "Platform, engine, or variant id" and "Service component id" as text.

**Fix:** use pickers (`/admin/vehicle-platforms`, `/admin/engine-families`, `/admin/catalog-variants`, `/admin/service-components`), show the blast radius (`/admin/catalog/blast`) before saving, and pre-fill it from the Variant hub.

### A-8 — Low — Dead code

Delete these:
- **`PartsEnterprisePanels.tsx`:** `PartsVehiclesPanel` and `PartsQueuePanel` aren't mounted, and they cause the two admin type errors at L105 / L112.
- **`parts_fleet_coverage.ts`:** nothing calls it.
- **`parts_catalog_review.ts`:**
  - `loadPartsCompare` and its per-org `loadFleetChassis` are unused.
  - `loadCatalogReview` still reads fleet vehicles and `organizations` names, then returns `gaps: []`. Drop that query.
- **`AdminLayout.tsx` (RoamFleet):** `PLATFORM_ROLE_PAGES` still lists `motor-vehicles`, `pending-motor-vehicles`, `maintenance-templates` and `parts-sourcing`.

### A-9 — Low — Signals and readiness polish

- **`catalog_signal_part_demand`:** returns `max(need_text)`, raw customer free text that can include plates or names. Return the component + count only, or scrub the text.
- **`catalog_signal_fit`:** has no fleet threshold; `catalog_signal_unmatched_numbers` uses ≥ 2 fleets. Pick one threshold for all signal views.
- **`variant_parts_readiness`:** a plain view calling `parts_for_vehicle` 3,560 times (356 × 10). `catalog_coverage_matrix()` reads it three times. Fine today; make it a materialised view refreshed with A-4 before the catalog grows.

### A-10 — Data (needs a person, tools are ready)

- **Maintenance templates:** prod still has **5 global, 0 platform/engine/variant, 0 with a component**. Build platform / engine schedules with the scoped form (after A-7).
- **Parts:** seed and verify against the in-use matrix: pads, rotors, cabin filter, wipers, shocks; platform rules for air filter / belt.
- **Families:** decide `platform_family_review` rows (0 parents set).
- **Reference offers:** 0.

---

## Checks to re-run next review

- `git status` clean for the rebuild files.
- `npx supabase migration list --linked`: `20261015030000` recorded.
- `npx supabase functions list`: fleet-core / fleet-ops deployed after the commit; their bundles contain `catalog/v1` and `schedule_for_variant`.
- `routes.generated.json` (fleet-core): no `/admin/org-part-stock`, `/admin/parts-sourcing-requests`, `/admin/part-cores|repeat-alerts|warranty-claims|quotes`.
- Prod:
  - `interchange_fitment_rule_source_check` allows the seed source
  - a cron job for `refresh_catalog_variant_demand`
  - templates by scope
- Deno 15/15 · CSV vitest · fleet `tsc` 501 · admin `tsc` has no errors in `parts-sourcing/`.
