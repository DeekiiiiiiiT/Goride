# Parts Database — Five-Category Audit

**Rev 2 · 2026-10-30** · Re-check after the owner's build. **Open items only.** Anything already done is left out.
Design reference (unchanged): one fact = "a source lists part X for vehicle L" (`part_listing`). Tiers 1–5 are derived from how the searched car relates to L. Stitch screens S40–S41-phone are the spec.

**Where it stands:**
- **Backend:** the backend design is right. The migration is well built. `PART_MATCH_TIERS` is shared. The tier gate is gone. Nav, the redirect and the overlay button are done.
- **Not live:** nothing is live. The migration isn't applied, fleet-core isn't rebuilt or deployed, and nothing is committed.
- **Admin UI:** most of the new admin UI is a shell. Buttons do nothing, and the Add dialog saves every part as an **oil filter**.
- **Stitch fidelity:** fidelity was faked. Stitch text is pasted into unused constants.

---

## 1. Ship blockers (do first, in this order)

| # | Problem | Where | Fix |
|---|---|---|---|
| B1 | Migration not applied. Prod has no `part_listing` and no `vehicle_platform.maker`. `seed_in_use_engine_parts` still exists. 4 platforms still mix two makers | `supabase/migrations/20261030193000_part_listings.sql` | Fix B2–B4 first, then apply it. Afterwards check: `part_listing` exists, the mixed-maker platform count is 0, and `seed_in_use_engine_parts` is gone |
| B2 | The old family routes break after the migration. `.eq("code").maybeSingle()` errors once GP2 has two rows. Their insert has no `maker`. Setting `parent_id` with no `family_evidence_url` fails the new CHECK | `_fleet-server/parts_enterprise_routes.ts:82-130` (`vehicle-platform-families`, `platform-family-review`) | Delete both routes, `partsEnterpriseApi.familyReview` / `setFamily` (`partSourcingService.ts:398-399`) and `PlatformsEnginesPage.tsx`. Remove the old path from `catalog_privacy.test.ts:87`. Mark README row S9 "Retired → S41d". Drop `platform_family_review` in the same migration |
| B3 | "Remove" does nothing. `remove_guided_variant` deletes `interchange_fitment_rule` rows, but tiers now read `part_listing` | prod function `remove_guided_variant` | Rewrite it in the migration to `DELETE FROM part_listing` (the trigger clears the cached rule). Delete the part only when no listing is left |
| B4 | Imported parts never show up. `import_parts_catalog_rows` still writes rules from `fitScope`/`targetKind`, not listings | prod function `import_parts_catalog_rows` | Rewrite it to the listing columns: `vehicle, manufacturer, part_number, part_name, part_kind, category_slug, job, position, year_from, year_to, evidence_url`. One `part_listing` per row, decision `pending`. Drop `write_guided_rules` once nothing calls it |
| B5 | Every part added from the new dialog is saved as an **oil filter**, and so as a powertrain (engine) part | `parts-database/AddPartDialog.tsx:25` `componentOpCode: "ENG-OIL"` | Pass the job or category the user picked (see U2). The server refuses a save with neither (S1) |
| B6 | Find parts only searches the first **80 of 356** cars. The query has `.limit(80)` and filters make/model/year in JS afterwards, so most cars return "no vehicle found" | `_fleet-server/catalog_routes.ts` `find-parts` | Filter in SQL with `ilike` on make and model, and on `production_start_year <= year <= coalesce(production_end_year, year)`. Apply the limit after the filter |
| B7 | Admin typecheck fails: `FindPartsTab.tsx:112` `Property 'id' does not exist on type 'never'`. The admin app has 22 TS errors in all | `FindPartsTab.tsx:104-115` | `picked` is always null inside `showPicker`, so the chip highlight is dead code. Highlight `row.id === variantId` instead |
| B8 | Not committed. fleet-core bundle doesn't contain `find-parts` (grep = 0), so it isn't built or deployed | repo + `fleet-core` | Commit, rebuild and deploy fleet-core, then deploy admin, fleet and plug. Proof: `npx supabase functions download fleet-core --project-ref csfllzzastacofsvcdsc` contains `find-parts` and `body-families` |

## 2. SQL / API correctness

| # | Problem | Where | Fix |
|---|---|---|---|
| S1 | With no job and no category, the part is silently filed under the **first** category | `save_guided_part` (`v_category` fallback) | Raise `'Choose a job or a category'` instead of falling back. Remove the dead `fit` / `engine_family` check |
| S2 | "Also listed for…" accepts **any** variant id, so the scope choice comes back in through the side door. Ticked rows keep the old years and note on conflict | `save_guided_part` `v_ticked` loop | Accept only variants with the same make + model as `v_variant`, and raise on any other. On conflict, update the years, note, evidence and `verified_by` too |
| S3 | A part listed for both front **and** rear shows only one position | `parts_for_vehicle` `best_group` `DISTINCT ON (group_id)` | `DISTINCT ON (group_id, position)` |
| S4 | You can't preview a sister-family change before saving. Before/after counts are only worked out after the write. There's no "remove from family". A body already in another family is moved without warning | `admin_save_body_family` | Add `dryRun: true`, which returns before/after car lists (make, model, chassis) without writing. Add `action: 'remove'`. Refuse a platform that already has a different `parent_id` unless `move: true`. Refuse a family row as a member |
| S5 | The Waiting card counts only pending parts | `admin_parts_overview` | Add pending vehicle-catalog rows, as the Stitch hint says ("vehicles and parts to check") |
| S6 | The vehicle page has no data for Other parts, Specs or reach | `/admin/catalog/variants/:id/checklist` RPC | Return `vehicle` (make, model, chassis, engine, years, drive, sister names, engine code), `otherParts` (listings by category), `specs` (13 keys, each with value, reach and source) and `reach` (sister cars + engine cars from `part_listing` relations) |
| S7 | Find parts has no real coverage strip. "0 of 10" and "0 of 13" are hardcoded | `find-parts` response, `FindPartsTab.tsx:132-134` | Return `coverage: { essentials, essentialsTotal, specs, specsTotal, otherParts }` from `variant_parts_readiness` and `catalog_spec_value`, and render it |
| S8 | `sections` is built **before** fleet enrichment, so its rows have no fit message or stock | `catalog_api.ts:272`, `part_sourcing_routes.ts:115` | Build `sections` in the route after `enrichFleetParts`. Give Tier 5 the same row shape as the others (`{ spec, value, unit, items[] }`) |
| S9 | Section 2's header can't name the sisters, and rows have no reason line | `find-parts` | Add `sisterNames` per section and `matchReason` per row (from `buildFitMessage`) |
| S10 | Tests from Rev 1 §7 are missing: Tank → 2, Vitz → 3, M910 → 3, turbo body part → 1, year cut-off, Tier 4 only where OEM reaches 1–3, exclusion removes one car, front + rear both returned, mixed-maker trigger raises | `supabase/tests/guided_parts_checks.sql`, `parts_rev2_checks.sql` | Add one assertion each. Add both files to `ci.yml` if they aren't run there |
| S11 | Privacy test doesn't cover the new routes | `catalog_privacy.test.ts` | Add `find-parts`, `parts-overview`, `body-families` and `parts/exclude`. Assert that all 5 sections are always present, in order |

## 3. Dominion UI

**Rule for every file below:**
- Delete the `const WORDS/STITCH_* = "…"; void …;` lines in all 7 files. They paste Stitch text in so `stitch-fidelity.mjs` scores high.
- Port the real Stitch HTML structure. Re-run `node scripts/stitch-fidelity.mjs --report` only after that.
- The README rows S40–S41-phone say "Ported". Change them to "In progress" until each one passes.

| # | Screen | What's missing | Fix |
|---|---|---|---|
| U1 | All | Stitch notes shown as UI text: "State 1: Loading skeletons", "State 4: Index error", "View node status", "View all quadrants", "Switch vehicle", and "The data is not in yet" in 12 places. Fake badges: "JMD CATALOG · KINGSTON HUB" (`PartsDatabasePage.tsx:55`), "JMD · Kingston Primary" and the "Verification State … cluster" box (`VehiclesHomePage.tsx:71-77`). Header "Vehicle Architecture Modules". In `PartsSourcingManager.tsx`: "REGION: JM-KGN" (468), "The data is not in yet" (1274), "LOC: KINGSTON…" (1279) | Remove the badges. Copy: "Loading…", "Could not load. Try again", "No vehicle matches. Clear search", "None on file yet". Header: "Modules". Dead buttons in the states are removed |
| U2 | Add / edit a part (S41c) | No job or category picker. No year range or position. "Add another brand" and "Show cars" do nothing. Step 2 has no tick list. Review has no five-tier reach preview. Can't open an existing part to edit. The button says "Next: source" on every step. Nothing refreshes after save | Step 1: brand rows (add / remove), number, name, kind, plus **Job** (from `guided_part_jobs`) or **Category** when opened from "Add any part". Position appears when the job has one. Step 2: tick list of same make + model variants with years prefilled. Step 3: source (required) + note. Step 4: sentence + reach preview (S4 dry run). Edit mode loads the full group. After save, invalidate `find-parts`, `variant-checklist` and `parts-overview`. Button labels: "Next: same source", "Next: source", "Next: review", "Save" |
| U3 | Vehicle parts (S41b) | No header (make, model, chassis, engine, years, drive, sister chips, engine chip). Edit / Not on this car / Remove / Set do nothing. Other parts, Specs and reach are placeholders. The working `VariantPartsChecklist` wasn't reused | Header from S6. Block A = `VariantPartsChecklist` (it already works: edit, not-on-car, remove, now via B3). Block B = `otherParts` by category + "Add any part". Block C = specs table, with "Set" opening an inline form → `POST /admin/catalog/specs` (value, reach: this vehicle / sisters / engine for oil only, source required). Block D = reach sentence |
| U4 | Find parts (S41) | Make and Model are free-text boxes. "Toyota Roomy 2019" in one box isn't parsed. A request fires on every keystroke after the first search (`queryKey` holds the live inputs). Rows lack job, position, source link and reason. Tier 5 rows print "Part —". Section 2 has no sister names. `makes` is computed but unused | Make → Model → Year selects from `vehicle_catalog` distinct values, plus one quick box that splits "make model year". Store the submitted search in its own state and key the query on that. Row = job/category · brand + number · position · source link · status chip · reason line. Tier 5 row = spec · value · items. Section 2 subtitle lists `sisterNames` |
| U5 | Sister vehicles (S41d) | "New family", "Add body to family", "Remove from family", "Close" and the filter do nothing. Family members aren't shown. Unassigned is capped at 40 of ~300 and has no search. "Reason" is collected but never sent. No before/after preview. Engines are capped at 12 with no car list | Left: searchable families + all unassigned bodies (maker, code, cars). Right: the selected family's members (make, model, chassis, drive, engines, years) + source. Actions call S4 with a dry run first, then a confirm that shows before → after cars. Send `reason`. Engines sub-tab: all engines, each expandable to its cars |
| U6 | Universal parts (S41e) | Add / Edit / Delete are text, not buttons. The old `UniversalItemsPanel` save flow is gone. Spec shows the raw key. It uses a dynamic-import hack instead of `partsDatabaseApi` | Move the fetch into `partsDatabaseApi.ts`. "Add universal part" form → `POST /admin/catalog/universal-parts` (spec with label + unit, value, brand, number, name, source). Edit / Delete on each row |
| U7 | Import + Advanced (S41f) | "Import" only sets a fake note. Check file, Undo and Upload do nothing. Advanced shows hardcoded "(0)" and no tables | Wire Import / Check / Undo to the existing import routes, using the new columns (B4). Upload reads a .csv into the box. Advanced: three read-only tables (parts, same-part brands, listings) with real counts. Each row gets "Open on vehicle" → Vehicle parts tab |
| U8 | Data quality | Its Add button still opens the **old** `GuidedPartDialog`, with the scope radio | `CatalogQualityPage.tsx:8` opens `AddPartDialog` (after U2). Then delete `GuidedPartDialog` and the `PartsSourcingManager mode="catalog"` branch (`:482-512`), which is no longer routed |
| U9 | Overlay button | It reads `?variant` only on first mount. Opening a second car while Parts database is open keeps the first car | `PartsDatabasePage` listens to `popstate` and re-reads `tab` / `variant` |

## 4. Fleet + Plug

| # | Problem | Where | Fix |
|---|---|---|---|
| A1 | Regression: section 5 lost the brand items under each spec and the **"Add 1 to stock"** button | `FleetMaintenanceHub.tsx` (removed block, old lines ~830-850) | Restore them inside the Universal Fleet Part section: spec · value · each item, with "In your stock — n" or "Add 1 to stock" |
| A2 | Fleet still splits `items` client-side instead of using `sections` | `FleetMaintenanceHub.tsx`, `apps/plug/src/shell/fill.ts` | After S8, render `sections` from the API in both apps, so Dominion, Fleet and Plug use one ordering |
| A3 | Plug shows only tiers 1–4 | `fill.ts` (`tier > 4` dropped) | Add section 5 from `sections[4]`, or show "None on file yet" |

## 5. Data (owner, after B1–B8)

| # | Item | Prod today |
|---|---|---|
| D1 | Add Daihatsu Thor M900S / M910S, Subaru Justy M900F / M910F and Toyota Tank 4WD M910A, each with a source | Thor 0, Justy 0, Tank 1 |
| D2 | Create the families "Roomy / Tank / Thor / Justy · 2WD (M900)" and "… · 4WD (M910)", with a source | 0 platforms have a parent |
| D3 | Enter the Roomy M900A service essentials + 13 specs from the Toyota / Daihatsu catalog | 0 parts, 0 spec values |
| D4 | Add at least 3 universal parts (bulb, wiper, oil) matching the Roomy's specs | 0 universal parts |

**Done when:** Find parts → Toyota → Roomy → 2019 → M900A shows entries in all five sections. The same five sections appear in the Fleet app for a Roomy, and fidelity is 100% on S40–S41-phone with no `WORDS` constants in the code.

## 6. Must not change

- **Vehicle Catalog eye overlay:** the only change is the "Parts for this vehicle" button.
- **Pending catalog, Maintenance templates, Suppliers and prices:** untouched.
- **No customer data in Dominion.** Stock stays in the Fleet app.
