# Dominion · Parts auto-matching — audit (Rev 8, 2 Nov 2026)

**Status: IN PROGRESS on branch `parts-auto-match` (Rev 8 closure).** Blockers B1–B8 addressed in repo; fleet-core redeployed with full auto-match route surface; SQL proofs expanded in **S**; AM-27 CI gate added. **Production `schema_migrations` does not yet include M/T** — `supabase db push` blocked by remote-only migration versions (repair or apply M/T via dashboard). Flag remains off until owner smoke (Roomy + D0051M-01-J).

Files below: **M** = `supabase/migrations/20261102210000_parts_auto_match.sql`, **T** = `supabase/migrations/20261102220000_parts_import_auto_match_templates.sql`, **S** = `supabase/tests/parts_auto_match_checks.sql`, **R** = `supabase/functions/_fleet-server/parts_auto_match_routes.ts`.

---

## Verified done (no action)
- **Tables and security:** all new tables have a PK, provenance, RLS deny-all, REVOKE from anon / authenticated and service-role grants. Key and check rules on `vehicle_oe_number`, `oe_number_supersession`, `platform_component_link`, `part_approval`. Conflict `code` sequence, open-conflict partial unique index, `part_listing.origin` (backfilled) and `derived_fit_id ON DELETE SET NULL`. All "Backend for the screens" columns and its 4 tables exist.
- **AM-14 partly:** the report table, the row-count guard, the new `part_listing` key, listing checks `NOT VALID` → `VALIDATE`, `part_side_covers` (including data `left` not covering query `both`), and promote and guided save storing normalized values with `origin='import'`.
- **Engine pieces:** the supersession chain has a visited set, a 5-step cap and the direction rule; years are clipped to production years; scoped locks are taken in sorted order; the checkpoint resumes.
- **`parts_for_vehicle`:** old columns kept with new ones at the end; derived rows hidden when the flag is off; no tier chaining.
- **Server:** 9 routes, correctly guarded: health, schedule, conflicts list and resolve, keep-batch, rematch, run-audit, vehicle OE numbers (GET only), and the flag PATCH. `catalog_api.ts` passes the new columns through.
- **Import:** the 3 templates and all 5 check codes, recompute on promote, and the PI4 "N matches created" line.
- **Screens (partial; gaps listed below):** the tab structures, the Platforms page route and module row, the Find parts filter / rematch / engine banner, the conflicts tab with type chips and the resolve drawer, the Data quality header and tiles, and the Fleet rows with why line, status chip and all-checking section. The old sections were removed as asked.
- The Stitch copies are in the repo, the README rows exist, and the flag is seeded off.

---

## Rules that still apply
- **Data rules:** use the existing tables; never copy sister fits; engine matches are stored apart from hand-entered fits; a person's decision always wins; capture, never gate; information only.
- **Every new function:** `SECURITY DEFINER` with `SET search_path = ''`, closed to anon and authenticated.
- **Screens:** port Stitch exactly; sample values become real data; no disabled "coming soon" buttons, no placeholder text, no hard-coded numbers.
- **Builder prompt:** "Read docs/parts-auto-matching-audit.md. Fix the blockers (B1–B9) first, then the items in order. Commit only this work. Write the proof for each item in this file. Don't mark anything done without its done-gate line."

---

## Blockers (fix first)

| ID | Problem | Fix |
|---|---|---|
| B1 | **M:1779** `AFTER INSERT OR UPDATE OR DELETE OF …` is a syntax error, and Postgres refuses transition tables on triggers with a column list. | Split it into an `AFTER INSERT OR DELETE` statement trigger with transition tables and an `AFTER UPDATE OF oem_part_number_norm, interchange_group_id` trigger that takes no transition tables and reads `NEW` / `OLD` row-level. |
| B2 | **M:1106** `CREATE TEMP TABLE _pm_scope / _pm_desired … ON COMMIT DROP` fails on the second call in one transaction (the triggers, the nightly loop, S:50 and S:88). | Use `CREATE TEMP TABLE IF NOT EXISTS`, then `TRUNCATE` at the start of each call. |
| B3 | **M:1120** `_pm_desired` PRIMARY KEY (… position, side) forces NOT NULL and raises on duplicate paths. | Drop the PK; dedupe with `DISTINCT ON (group, car, position, side, rule)` before writing. |
| B4 | **M:1741–1747** `trg_platform_revision` reads `NEW.created_by`; `vehicle_platform` has no such column, so every platform insert fails. | Take the actor from `auth.uid()` / the request setting and drop the column reference. |
| B5 | **M:586** the DROP of `part_listing_exclusion_interchange_group_id_vehicle_catalog_id_key` (66 chars) matches nothing because Postgres shortens names to 63, so the old `UNIQUE (group, car)` stays. | Look the constraint up by its columns in `pg_constraint` and drop it by its real name. |
| B6 | **M:2056** `DROP FUNCTION parts_for_vehicle` without first dropping its dependents. The materialized view `variant_parts_readiness` calls it (the rev3 migration dropped it first). | Drop `variant_parts_readiness` before the function and recreate it, with its grants and indexes, after. |
| B7 | **Admin build breaks.** `vehicle-catalog/VehicleAutoMatchTabs.tsx:57` uses `formatCatalogProductionWindow` without importing it. `vehicle-catalog/pending-parts/AutoMatchConflictsTab.tsx:5-6` imports `../../auth` and `../../../services`, which don't exist from that folder (it should be `../../../auth`, `../../../../services`). There are 11 `tsc` errors in the changed files (also `FindPartsFlow.tsx:485`, `FullDatabaseDrawer.tsx:45,154`, `VehicleAutoMatchTabs.tsx:96,100`, and implicit `any` at `AutoMatchConflictsTab.tsx:61,139`). | Fix each one. Admin `tsc` must show 0 errors in these files. |
| B8 | **The deployed fleet-core (v232, 22:31) has none of the new routes.** `fleet-core/index.ts` and `routes.generated.json` were not regenerated. | Regenerate the bundle and manifest, then deploy from the committed code. |
| B9 | **Nothing is committed.** The import work is mixed with other uncommitted inventory and car-kit work. | Commit only the auto-match files on branch `parts-auto-match`. Then check production `schema_migrations`: neither M nor T should be there until B1–B6 are fixed. If either is, write a fix-forward migration. |

---

## Open — database (M, T)

### AM-14 — positions
- `part_norm_position`:
  - map side `L` / `R`;
  - return (null, null) when position is blank (no side without a position);
  - map a bare `BOTH` only with a front position;
  - take one text argument, as specified.
- Oldest-wins: `part_listing` has no `created_at`, so add one (backfill from `verified_at`) and order by it, then `id`. Exclusions use `created_at`, then `id`.
- Rewrite and dedupe `part_import_row` values too; today they are only reported.
- `part_listing_exclusion`: add the value-list checks and the side-needs-position check (`NOT VALID` → `VALIDATE`). Replace the placeholder URLs at M:1570 / M:1606 with the rule "evidence_url required unless source = `auto_match_removed`, which needs `reason`".
- Keep `oem_part_number_norm_version` current on UPDATE of `oem_part_number_norm` (trigger).

### AM-10 — conflicts, Keep / Remove
- `oe_ambiguous` conflicts are written with `interchange_group_id = NULL` (M:987). Write one row per group (A and B), each with its own group id and `detail.group_ids`.
- Keep(A), per M:1524:
  - write the `auto_match_kept` listing for A;
  - exclude B only if B has no hand-entered listing;
  - set B's conflict to `removed` with "Resolved by keeping {A code}";
  - if B has a hand-entered listing, set B's conflict to `superseded` with "Manual fit exists on {B}; both kept".
- Enforce required notes on `oe_ambiguous`, `index_merge_proposed` and `system_link`.
- Remove (M:1599): `ON CONFLICT DO NOTHING` on the exclusion insert.
- Conflict inserts (M:1239, M:1272) must skip any conflict with the same identity in **any** status (kept, removed or superseded). Today only `open` is checked, so removed conflicts come back.
- **Reopen rule:** a superseded conflict reopens only when its key, source ids, position or side change. Otherwise it stays closed.
- **`system_link` conflicts:** create one per `scope = 'system'` link (never per car).

### AM-05 / AM-11 / AM-16 — engine and output
- **Recompute is not set-based.** Replace the per-car LATERAL function and the FOREACH loop over groups (M:1392) with one set-based query and a single `MERGE` into `part_fit_derived` per call.
- **`matched_keys`:** include the car's number plus every chain number, and check that the array has at most 6 entries.
- **`reason_params`:** add `from`, `to` and `chain[]` for `oe_number_superseded`.
- **Upsert (M:1301):** also update when years, status, `checking_note` or the source ids change.
- **Status:** set `needs_checking` from the conflict rules, instead of always `live` (M:1175).
- **Un-suppression:** a derived row goes back to `live` / `needs_checking` when the covering listing is edited away or deleted (proofs 12a–12c).
- **`part_match_recompute(NULL, NULL)`:** run every batch to the end (looping with the checkpoint), not one 500-group batch.
- **Nightly run:**
  - use the same lock key namespace as scoped runs;
  - write `rows_added`, `rows_changed` and `rows_removed`;
  - delete checkpoints and log rows older than 90 days.
- **`parts_for_vehicle` (M:2058):**
  - add universal rows (`fit_source = 'universal'`, `reason_code = 'universal_spec'`, params as a list `[{spec_key, value, unit}]`);
  - emit sister and engine rows from derived and kept fits (`via_sister` / `via_engine`). Listed sister rows return `via_sister`, not `listed_direct`;
  - check the year-window overlap for tier 3;
  - drop exact duplicates, keep the lowest tier, `ORDER BY` tier, part type, position;
  - apply the year and applicability checks to derived rows;
  - badge params include `value`, `merged_part_id`, `matched_part_id` and `merge_log_id`.
  - Update the 3 SQL callers.

### AM-12 — triggers
- **One recompute per statement:** pass the whole set of affected groups and cars to one recompute call (M:1621–1708), so one statement writes exactly one log row (proof 36).
- **Missing triggers:** add the recompute trigger on `part_index_number`, and make the `vehicle_catalog` years trigger statement-level (M:1794).
- **Listing updates:** recompute both the old and the new (group, car, position, side).
- **OE supersession changes:** recompute only the affected groups, not everything.

### AM-13 — index merge (M:824)
- Make it set-based, not a plpgsql loop.
- Read `sensor_b` from the second part (M:878).
- Allow `from_group` to be null for parts with no group (M:940).
- If the older group is the part's own group, move the other part instead of skipping.
- Check that **both** groups have no listings and no derived fits before auto-applying.

### AM-18 — archive
- Call `part_match_archive_derived_changes` (M:1468) from recompute.
- Archive `removed` rows with `removal_cause` as well as `changed` rows.

### AM-17 — health and schedule
- **Health:** add a tier breakdown to `part_match_health()`, and filter open conflicts per car when a car is given.
- **Nightly job:** schedule it with `cron.schedule('part-match-nightly', '0 3 * * *', 'select public.part_match_recompute(NULL, NULL)')`. Make `part_match_schedule()` read the real job from `cron.job`.
- **Report rows:** auto-resolve a report row (`resolution_source = 'listing_edit'`) when its listing's position is edited.
- **Grants:** proof 21 says `authenticated` can call `parts_for_vehicle` and `part_match_health()`. Keep them service-role only and change proof 21 to "the edge route returns them to a signed-in catalog editor". The app reads them only through fleet-core.

### AM-07 — import (T)
- **Undo (T:1136):** recompute the affected groups and cars, and skip merge-log rows whose conflict was Kept.
- **Batch tagging:** recompute must write `part_fit_derived.import_batch_id` (M:1279); today "N matches created" is always 0.
- **Search path:** the 11 functions in T with `SET search_path = public` must use `''` with fully-qualified names.
- **Template table:** T changes the `part_import_template` PK and inserts a fake "hub" row into `maintenance_service_categories` (T:5). Keep the old PK, and add a real `import_kind` column instead of the fake category.
- **PI5 ledger:** show "N matches created · N need checking".

---

## Open — server (R)
- **Missing routes (with Deno input / access tests for each; today's test only checks the module loads):**
  - **vehicle OE numbers:** `vehicles/:id/oe-numbers` POST / PATCH / DELETE, `oe-numbers/normalize`, `vehicles/:id/derived-fits`, `vehicles/:id/revisions`;
  - **part references:** `parts/:id/oe-references`, `/index-numbers` and `/approvals` (GET / POST / PATCH / DELETE);
  - **platforms:** `admin_platforms` / `admin_platform` SQL plus routes, link CRUD, `platforms/:id/export`;
  - **exports and conflicts:** `find-parts/export`, `conflicts/resolve-batch`, `conflicts/heatmap`;
  - **health and quality:** `auto-match/runs`, `catalog/completeness`, the position report list, remap and mark-fixed routes, and the export issue report CSV.
- **Conflicts list:** also return counts by type and status (for the whole set, not the filtered page), and search by car, number, group and part (today only `matched_key`).
- **keep-batch (R:131):** check the RPC error, and return 400 on unknown ids instead of `ok`.
- **Flag:** add `parts_auto_match_enabled` to `_fleet-server/feature_flags.ts`.
- **Edge callers:** pass the new columns through in `parts_match.ts:71`, `catalog_routes.ts:170` and `platform-catalog/index.ts:322`.
- **Types:**
  - `packages/types/src/partsResolution.ts:7`: tier 3 label → "Fits your engine or shares parts";
  - `partPositionNorm.ts`: bare `BOTH` must not become front/both (same rule as AM-14).
- **Position readers** still building their own labels:
  - `findPartsBuildFp4.ts:31,63-65`;
  - Fleet `FindPartsTab.tsx`;
  - Admin `PositionStep.tsx`;
  - `FindPartsFlow.tsx:322`;
  - `findPartsViewModels.ts:220,321`.

  All of them should use the shared display helper and lowercase comparisons.

---

## Open — screens
Spec for every element: the Stitch HTML in `docs/stitch/dominion-redesign/html/AM-S*.html` and `docs/stitch/roam-fleet-app/html/find-parts-why-it-fits.html`. Each line below is a gap against it. Every disabled, "coming soon" or no-op control is a gap until it works.

### AM-20 Vehicle record (`VehicleSpecificationSheet.tsx`, `VehicleAutoMatchTabs.tsx`)
- **Platform chip:** show the code and open AM-22 with the id (the id is dropped at `VehicleSpecificationSheet.tsx:197-201`).
- **Status chip:** real "Active catalog" / "Pending" (today it's always active, :108).
- **Area chips:** real areas with counts, filtering every area (:64-67, :169).
- **Table:**
  - group by part type with "N number on file" and "CATEGORY: {op_code}";
  - separate Side column;
  - "↳ Changed to … · fully interchangeable" line;
  - Matches "N parts →" with the real count and link, plus the "Matching…" state (:230);
  - working edit and delete (:232).
- **Add / edit panel:** the whole thing, with the normalize preview and the duplicate warning; "+ Add number" enabled (:179).
- **Empty state:** "+ Add number" and "Open Import CSV".
- **Derived matches tab:** real rows with Keep / Remove, and the real count (:74, :245).
- **Revision audit tab:** real rows (:252).

### AM-21 Part drawer (`FullDatabaseDrawer.tsx`, `FullDatabaseTab.tsx`)
- **Page top:** INDEX: N FITMENTS, SCHEMA, REPO CACHE HOT.
- **Left pane:** WVA, N FITMENTS, N RECORDS LOADED. The `MasterPartRow` fields exist but aren't rendered.
- **Header:** brand chip and index badge. Confirm the API returns `partType` / `position` (they're read through casts today).
- **Cars it fits:** "N MATCHED" and "+ Add a car".
- **INDEX REVISION:** the real number (no `?? 1`).
- **Group card:** member chips, the `GRP-…` code, and View group.
- **The three reference tables:** rows, ⋯ menus and working "+ Add" buttons (:160-183); "N ENTRIES" from real data.
- **Provenance:** HASH.
- **Exclude from car:** for the picked car (still the first direct fit, :76).

### AM-22 Platforms (`platforms/PlatformsPage.tsx`)
- **Header:** INDEX chip, Diff Log drawer, Matrix Graph.
- **Tiles:** Shared component rules = the real link count (not `derived.live`, :43); Sync latency measured (:64).
- **Table:** the Sister models cluster and Shared platforms columns; a real → link; the selected platform in the URL.
- **The whole record view:**
  - PRIMARY KEY, body class, market, Export Matrix, Add shared component;
  - sister cards, with role, specs, verified fitments, Inspect car and INHERITANCE %;
  - the shared components table with status and ⋮ menu;
  - the add-link modal with the overlap check.
- **Remove:**
  - the non-Stitch helper section with the hard-coded hub id (:104-106);
  - the "parts-import" link to a page that doesn't exist (:112).

### AM-23 Find parts (`find-parts/ResultsView.tsx`, `FindPartsChrome.tsx`, `FindPartsFlow.tsx`, `ChoiceTrail.tsx`, `PartDetailDrawer.tsx`)
- **Filter Tiers:** add the status and source filters; remove the second read-only chip in Chrome (:91-95).
- **Export Matrix:** working (disabled today, :139).
- **Query bar:** car › part › position chips and the PLATFORM / AXLE line.
- **Pending Inspect:** include open conflicts.
- **Tier-2 criteria:** real sister names (not `plainReason`, :166).
- **Rows:**
  - Car / Part / Change box; index badge; an icon per `via`;
  - "Review in Pending catalog ↗" as a real link (:203);
  - "Inspect fit" only on derived rows, opening a new "Why it matches" drawer panel; "View drawer" on the rest (:208).
- **Footer:** real AUTOMATCH TOLERANCE and ENGINE AUDIT values (:218-219); DATABASE NODES = groups, not rows.
- **Batch Validation Mode** and **Commit Active Fitments**, wired to `keep-batch`.
- **Clean-up:** remove the unused `variantId` prop.

### AM-24 Conflicts (`PendingCatalogShell.tsx`, `pending-parts/AutoMatchConflictsTab.tsx`)
- **Shell:** move ENGINE PULSE into the shell header; Batch Resolve Rules working (:94).
- **Counts:** status counts; type counts from the server's totals (not the filtered rows, :52-59); the tab count from the server (not capped at 200).
- **Table:**
  - DETAIL and FOUND columns;
  - CAR and PART as names, not UUIDs (:144-145);
  - inline Keep / Remove on Open rows.
- **Resolved-by footer** with the audit-trail link.
- **Cards:** heatmap card; geometry verification card.
- **Drawer:**
  - CAR & PARTS INVOLVED, NUMBERS INVOLVED, What Keep / Remove does;
  - the manual-wins state.
- **Check:** whether "QUEUE ACTIVE" on the vehicles tab is in Stitch; if not, remove it.

### AM-25 Data quality (`parts-sourcing/CatalogQualityPage.tsx`)
- **Header:** the Interval from `part_match_schedule()` (not hard-coded "nightly", :90); Export issue report working (:93).
- **Remove:** the "Toggle" flag button (not in Stitch, :145).
- **Tiles:** the needs-checking tier range from health (not hard-coded "T3–T4", :111).
- **Error banner:** the real error text; "See run log" opens the runs drawer (:136); "Review queue ↓" scrolls (:160).
- **Position Clean-Up Queue:** pending and history tables, Remap / Confirm Merge / Mark fixed, parser confidence and the CSV. Remove the developer placeholder text (:169, :175).
- **Catalog Completeness:** the card and the drawer.
- **Recent Validation Exceptions:** the whole section.

### AM-26 Fleet Find parts (`Fp5Screen.tsx`, `findPartsViewModels.ts`, `FindPartsStickyHeader.tsx`, `FleetMaintenanceHub.tsx`)
- **Header:** "Parts Match Intelligence" breadcrumb, wrench tile, subtitle (keep the 7 tabs).
- **Car card:** plate chip, service-line chips, spec line with brake types, and the choice trail with the system step (:71-73).
- **Identified subsystem card:** "Your requests {n}"; the Stitch body text, not the generic sentence (:84).
- **Rows:** part-number copy chip; render the why-line tooltip (`whyTooltipCar` / `whyTooltipPart` are computed but unused).
- **Sections:**
  - all-checking: "Candidate interchange pool" subtitle and the boxed count;
  - the Stitch subtitles (not `section.description`);
  - section 3 label (see server).
- **Data:** dark-mode tokens, `checking_note`, part and car dimensions.
- **Remove:** the hard-coded `batchCount={… 3 …}` (:58), and the dead `Fp5Actions` handlers (:12-18, `ResultsView.tsx:191-207`).

### AM-27 Screen gate (`e2e/parts-auto-match-stitch.spec.ts`)
- **Coverage:** today it covers AM-S6 only, with two text checks and no clicks. Its fixtures don't match the real shapes (`derived.live`, `nextRunAt`), the screenshot assertion proves nothing (:84), no Playwright config matches the file, and no CI job runs it.
- **Fix:**
  - **Coverage:** all 7 screens and their states, with real-shaped fixtures;
  - **Text both ways:** Stitch text missing fails, and filler fails;
  - **Clicks:** click every control;
  - **Screenshots:** save `AM-Sn-app.png`;
  - **Config:** add it to a Playwright project's `testMatch`, and run it as a required CI job for these files;
  - **README:** set the rows to "Ported" only when their part passes.

---

## Proofs still missing in S
Only proofs 10 and 33 are complete. 1, 21, 24 and 29 are weak, and 28 is labelled but not tested. The placeholder at S:139 and the "core proofs executed" note at S:140 must go.

Add, each as a real assert:
- **Matching:**
  - (1) Roomy tier 1 via supersession, with both numbers in `matched_keys`;
  - (2) Thor tier 2 with no copied row;
  - (3) Fiesta tier 1;
  - (4) Mazda 2 tier 3 inside the year overlap only;
  - (5) no tier 3 from tier 2;
  - (5b) a needs_checking tier 1 gives a needs_checking tier 3.
- **Index merges:**
  - (6) the Brembo merge with a log row and the category-4 badge;
  - (6b) two empty groups merge into the older one;
  - (7) sensor mismatch → conflict.
- **Coverage and stability:**
  - (8) Thor 4WD exclusion;
  - (9) `both` covers `left`;
  - (10) recompute twice gives the same rows;
  - (11) a group move recomputes both groups.
- **Suppression:** (12, 12a–c) suppression and un-suppression.
- **Keep and Remove:**
  - (13) Keep survives undo;
  - (14) Remove never comes back;
  - (15) undo removes non-Kept rows;
  - (15b) undo keeps Kept merges;
  - (16) Keep(A) removes B;
  - (17) open → superseded → reopened;
  - (18) `fit_source = kept`, `via = sister`.
- **Integrity and access:**
  - (19) duplicate whole-car exclusion refused;
  - (20) an engine version bump archives changed rows;
  - (21) signed-in route access (see AM-17);
  - (22) the scale limits and the log-row counts.
- **Edge cases:**
  - (23) the manual-wins case;
  - (24) the backfill: FL, Front, unknown → report, readers still work;
  - (25) checkpoint resume;
  - (26) the year intersection;
  - (27) a removed proposal is never repeated;
  - (28) forward-only supersession;
  - (29) no null output columns, including a universal part.
- **Backfill and data shape:**
  - (30–31) "Front" / "FRONT" dedupe for listings and exclusions;
  - (32) "XYZ" → null + report;
  - (34) all 8 cells of the category table;
  - (35) concurrent recompute;
  - (36) one log row per statement or scoped call;
  - (37) archive cause and version;
  - (38) the index badge;
  - (39) the Keep origin;
  - (40) "XYZ" shows for front and rear;
  - (41) `left` doesn't cover `both`;
  - (42) a 6-step chain stops at 5;
  - (43) the Kept listing survives archive;
  - (44) no deadlock.
- **Screen backend:** revision rows written, group revision bumped, remap resolves, schedule reads the cron job, per-car health counts.

---

## Order and done gate

**Order:**
1. B1–B9.
2. Database: AM-14 → AM-10 → AM-05 / 11 / 16 → AM-12 → AM-13 → AM-18 → AM-17 → AM-07.
3. The proofs, until S is green in Parts SQL checks.
4. Server routes and tests.
5. AM-27 gate (written first; failing is expected).
6. Screens: AM-21 → AM-20 → AM-22 → AM-23 → AM-24 → AM-25 → AM-26.
7. A real run (Roomy OE numbers + `D0051M-01-J`), then turn the flag on.

**Done gate:**
- [ ] The migration applies on a fresh `supabase db reset`. S proves all 44 proofs plus the screen-backend proofs, green in CI.
- [ ] Admin and Fleet `tsc` show 0 errors in the touched files. Deno route tests cover input and access for every route.
- [ ] Code committed alone; fleet-core bundle regenerated and deployed; production `schema_migrations` shows M and T.
- [ ] AM-27 passes in CI for all 7 screens. `AM-Sn-app.png` sits beside `AM-Sn-stitch.png`. The README says "Ported".
- [ ] After the real run, Roomy, Thor, Fiesta and Mazda 2 show in the right categories with reasons, the health card shows 0 errors, and the flag is on.
