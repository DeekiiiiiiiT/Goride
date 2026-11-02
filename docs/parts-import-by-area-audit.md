# Dominion · Parts import by area — audit (Rev 4, 1 Nov 2026)

**Open items only.** Audit only: the auditor changed no code. Each item has one fix. Porting rules for PI1–PI6 are unchanged from Rev 2/3; the only allowed differences are the annotations, the Stitch shell and the rule-excluded text.

**Verified this round:** all 6 migrations are live in production, and their versions match the files. A rolled-back test in production confirmed:
- one part on 3 cars → **1 part, 3 fits**;
- the same file again → **all Unchanged**;
- missing position → error;
- an Oil filter in a Brakes file → `DOMAIN_MISMATCH`, routed to the Engine bucket;
- editing a fit and then Undo → **refused** ("edited by manual catalog override");
- the 72 h window, every route behind `catalog.import`, the `platform_catalog_editor` role, the purge cron (hourly) and the legacy batch back-fill;
- 10/10 Deno tests pass.

---

## Open

### PI-17 (Critical) — Parts database doesn't load (local Dominion shows "Something went wrong")
- **Seen:** at `localhost:3001/?page=parts-catalog&tab=database`, Vite reports `Failed to resolve import "../../../services/apiConfig" from "src/components/admin/parts-database/import/partsImportApi.ts"`. The page error boundary then takes down every Parts database tab, not just Import.
- **Cause:** `partsImportApi.ts` copied its imports from `parts-database/partsDatabaseApi.ts`, which sits one folder higher. From `parts-database/import/`, `../../../` points at `src/components/`, so:
  - `services/apiConfig` doesn't resolve;
  - `utils/supabase/info` doesn't resolve;
  - `utils/supabase/client` doesn't resolve.
- **`tsc --noEmit -p apps/admin` also reports** in the same folder:
  - `ImportByAreaFlow.tsx:56` — `Role | null` is passed where `Role` is required;
  - `ImportStepper.tsx:28` — `detail` doesn't exist on the step union type.
- **Fix:**
  - change the 3 imports in `partsImportApi.ts` to `../../../../services/apiConfig`, `../../../../utils/supabase/info` and `../../../../utils/supabase/client`;
  - in `ImportByAreaFlow.tsx`, return the no-permission state (PI6) when `role` is null, before calling the permission check;
  - in `ImportStepper.tsx`, type the steps array as `Array<{ n: 1|2|3|4; title: string; sub: string; detail?: string }>`.
- **Confirm:**
  - `tsc --noEmit -p apps/admin` shows 0 errors under `parts-database/import/`;
  - Find parts, Full database and Import all load on localhost:3001.

### PI-01 — Not committed, and the screens aren't live
- **Problem:**
  - All of this work is still uncommitted.
  - roamdominion.co still serves the old import: no `parts-import` calls in any of its 117 chunks.
  - No `parts-import` request has reached fleet-core yet, so the live route set can't be confirmed.
- **Fix:** after PI-12 to PI-16, commit only this work, push, and deploy fleet-core and the admin site.
- **Confirm:** import `supabase/tests/fixtures/parts-import/brakes-ok.csv` through the UI on roamdominion.co.

### PI-12 (High) — 10 import functions can be run by anyone
- **Problem:**
  - These have default `PUBLIC` execute, so `anon` and `authenticated` can call them through `/rest/v1/rpc`: `part_import_validate_rows`, `part_import_validate_postprocess` and `part_import_refresh_batch_counts` (all **SECURITY DEFINER, and they write**), plus `area_spec_issues`, `raw_has_fleet_data`, `row_specs`, `snapshot_comparable`, `source_domain`, `strip_brand` and `undo_row_reason`.
  - With only the public anon key, someone can re-validate or rewrite any batch's staging rows and counts.
- **Fix:**
  - in a new migration, `REVOKE ALL … FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE … TO service_role` for all 10;
  - add a check to `parts_import_checks.sql` that no `part_import_%` function is executable by `anon` or `authenticated`.

### PI-13 (Medium) — Every aftermarket row is labelled "Unusual OEM number shape"
- **Problem:**
  - `part_import_number_shape_unusual` returns `true` for every brand that isn't Toyota, Daihatsu or Honda, so Masuma, Akebono, Bando and the rest all get the label.
  - The Honda rule `^\d{11}$` rejects real Honda numbers, which contain letters (45022-T5A-J01 → `45022T5AJ01`).
  - `catalog_research_number_shape.ts` has the same Honda rule (lines 17 and 55).
- **Fix:**
  - unknown brands return `false` (no label);
  - Honda becomes `^\d{5}[A-Z0-9]{6}$`, in both the SQL function and `catalog_research_number_shape.ts` (with its mirror and test).

### PI-14 (Low) — A missing position gives two errors
- **Problem:** a Brakes row with no position gets both `PARAM_MISSING` and `AREA_SPEC_MISSING` with the same meaning.
- **Fix:** remove the position check from `part_import_area_spec_issues`, because the `position_aware` rule already covers it.

### PI-15 — Screens are not yet at 100%
- **Scores:** PI1 100%, PI2 81%, PI3 96%, PI4 80%, PI5 94%, PI6 89%.
- **Still missing:**
  - **PI2:** "1. Get the template", "2. Upload your file", "Format & Rules";
  - **PI3:** "Brand & Number";
  - **PI4:** "Part Spec & Nomenclature", "Match Tier & Fitments".
- **Skip list:** PI5's "download failed rows (5)" is a sample count, and PI6's "import lifecycle & operational states" is an annotation. Add both to `sample-labels.json`.
- **Fix:** build the PI2–PI4 labels exactly as drawn, update the two skip lists, then run `scripts/stitch-fidelity.mjs` to 100% on all six and mark them Ported.

### PI-16 (Medium) — The SQL checks only test that functions exist, and they aren't in CI
- **Problem:** `supabase/tests/parts_import_checks.sql` has 8 "function/column exists" checks, and `ci.yml` doesn't run it.
- **Fix:** replace them with behaviour checks inside one transaction, and add the file to the CI SQL step. The rolled-back production test above can serve as the base. The checks:
  - 3 rows of one part on 3 cars → promote gives `partsCreated 1, fitsCreated 3`;
  - the same rows in a second batch → 3 `unchanged`;
  - a Brakes row with no position → `error`;
  - an `ENG-OIL` row in Brakes → `DOMAIN_MISMATCH`;
  - edit one fit → `part_import_undo_preflight` gives `ok=false` and Undo leaves 3 fits;
  - a confirmed part keeps `catalog_decision` after a re-import with a different name;
  - the PI-12 grant check.

---

**Builder prompt:** "Read docs/parts-import-by-area-audit.md. Fix PI-17 first, then PI-12 to PI-16 (apply the new migration and name the file with the version from schema_migrations), then do PI-01: commit only this work, push, deploy fleet-core and the admin site, and import brakes-ok.csv through roamdominion.co. Don't mark anything done."
