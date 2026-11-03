# Dominion · Parts auto-matching — audit (Rev 10, 3 Nov 2026)

**Status: IN PROGRESS — Rev 10 implementation pushed.** Baseline committed; `20261103210000_parts_auto_match_rev10.sql` adds DB/API fixes; production `admin_platform` hotfixed via SQL (A3). Remaining: full prod migration replay, SQL proof green in CI, Stitch PNGs committed, flag on after real run.

| Area | Done |
|---|---|
| Database | about 40% |
| Server | about 65% |
| Screens | about 40% |
| Screen gate | about 30% |

**Where things stand:** the work is uncommitted on `parts-auto-match`, so no CI has run. The doc header said M, T and A were applied to production, from those uncommitted files. Production has a bug (A3 below), and the SQL tests stop before the first proof.

Files: **M** = `supabase/migrations/20261102210000_parts_auto_match.sql`, **T** = `…20261102220000_parts_import_auto_match_templates.sql`, **A** = `…20261103180000_parts_auto_match_admin_rpcs.sql`, **S** = `supabase/tests/parts_auto_match_checks.sql`, **R** = `supabase/functions/_fleet-server/parts_auto_match_routes.ts`.

**Fixed since Rev 9 (no action):**
- **Database:** C1–C3; the norm-version trigger; the part_master statement trigger; T undo, batch tagging and templates; the 4 admin functions exist.
- **Server:** errors; batch writes; position writes; PATCH; flag gating.
- **Client and screens:** client functions; Data quality interval and remap picker; conflicts counts, names, batch selection, inline Keep/Remove and ENGINE PULSE placement; part-drawer car picker and schema chip; vehicle add panel, delete confirm and grouping; Fleet copy chip and "Your car / This part" box.

---

## 1. Do first

| ID | Problem | Fix |
|---|---|---|
| A1 | Nothing is committed. Production was changed from local files. | Commit M, T, A, S, the routes, the screens and the 3 workflows on `parts-auto-match`, and push. Every later database change is a **new** migration file; M, T and A are now in production and must not be edited again. |
| A2 | Five stray leftovers in the repo root: `rev8_*.sql` ×4 and `.cursor-rev8-migration-payload.json`. | Delete them (don't commit). |
| A3 | **Production bug:** `admin_platform` reads `l.status` (A:71), and `platform_component_link` has no such column, so it fails on every call. | New migration: read status from the link's open `system_link` conflict. |
| A4 | S stops at line 84 (part 1 set to Toyota `04465-B1191` clashes with part 8, unique `part_master_mfr_number_unique`). | Give part 8 a different number. |
| A5 | `supabase/config.toml` also changed (local email block commented out). It belongs to the CI-red work. | Revert it here, or move it to that audit. |

---

## 2. Database (new migration)

**Positions:**
- `part_norm_position`:
  - accept side `L` / `R`;
  - make `R` mean rear as a position, the same as `partPositionNorm.ts:19`.
- **Unmapped values:** don't dedupe them against whole-car rows (M:287, M:354).
- **Import dedupe (M:424):** key on batch + part + car + position + side. Today every "Front" line after the first is deleted.
- **Exclusions:** make `evidence_url` nullable for `auto_match_removed` (today it inserts `''` at M:1960, M:2015). Remove the placeholder URL (M:3754).

**Conflicts:**
- **Keep (M:1923, M:3759):** don't turn a manual listing into `auto_match_kept` (`ON CONFLICT DO NOTHING` for manual rows).
- **`index_wear_sensor` (M:1016):** skip when the same identity exists in any status.
- **Reopen (M:1167):** only when the key, source ids, position or side changed. Respect exclusions.

**Engine:**
- **Write path:**
  - one `MERGE` per call (M:1563);
  - set-based nightly batches, not FOREACH (M:1693);
  - clear `_pm_batch_scope` per call (M:1382);
  - `recompute(NULL, NULL)` runs every batch.
- **Columns:**
  - a CHECK of `matched_keys` length ≤ 6;
  - `reason_params` with `from` / `to`.
- **Status:**
  - set `needs_checking` from the conflict rules (not always `live`, M:1453);
  - update when years, status or source ids change (M:1586);
  - un-suppress instead of deleting (M:1597).
- **Nightly:**
  - the same lock keys as scoped runs (M:1694 vs M:1735);
  - log the counters;
  - 90-day cleanup.
- **Archive:** call it from recompute, and write `removed` rows with a cause (M:1838).
- **`parts_for_vehicle` (M:2868):**
  - universal rows;
  - sister and engine rows from derived and kept fits (`via_sister` / `via_engine`);
  - the tier-3 year overlap;
  - dedupe, lowest tier wins, `ORDER BY`;
  - year and applicability checks on derived rows;
  - badge params without multiplying rows;
  - return `derived_id`, `side`, `wva`, `checking_note`;
  - make it `SECURITY DEFINER`.
- **Helpers:** make them `SECURITY DEFINER` (M:158, 186, 1277, 1330), and stop joining `part_match_group_numbers(NULL)` per row.
- **Supersession trigger:** recompute along the whole chain (M:2073).
- **Index merge (M:976):**
  - make it set-based;
  - read `sensor_b` from the second part;
  - `from_group` nullable;
  - when the target is its own group, move the other part;
  - check both groups.
- **Health:**
  - tier breakdown when no car is given (M:2813);
  - make `part_match_schedule` handle non-daily cron (A:142);
  - auto-resolve a report row when its listing's position is edited.

**Admin functions (A):**
- `admin_platforms` returns `{ items: [...] }` with camelCase `carCount` / `linkCount` (the screen's shape);
- body class from the sister cars;
- market from `vehicle_catalog.market`.
- **`admin_platform`:** return `vehicles` with `platform_role` and verified-fit counts.
- **`part_match_catalog_completeness`:** return `vehicleCount`, `vehiclesWithOeNumbers` and `platformLinkCount`.
- **`admin_catalog_master_part`:** add `brand`, `partType`, `wva`, `position`, `side`, `fitCount`, `groupRevision`, `groupCode`, group members and `hash`.

---

## 3. Server (R)
- **Find parts response:** `parts_finder.ts:163` (`toFound`) drops `via`, `fitSource`, `matchReasonCode`, `matchStatus`, `groupId`, `wva` and the derived id. Pass them through; this blocks most of AM-23.
- **Vehicle OE numbers:** fill `supersession_note` from `oe_number_supersession` (`vehicle_oe_number` has no `reason_params`).
- **Derived fits:** remove the `part_listing → part_master` embed (there is no FK; it fails whenever rows exist), and get the part name through the group.
- **Revisions:** list only the changed fields as plain text (no whole objects, no `updated_at` noise).
- **Find-parts CSV:** fill `side` once the function returns it.
- **Keep-batch:** recompute once after all ids, not once per id. Today a later id can vanish and roll back the batch.
- **Search:** don't strip `.` from search text (`1.5` → `15`).
- **Tests:**
  - mount every route and test staff 403, owner 403 and bad input 400 (today only one route is mounted, testing 401);
  - add `--no-check` or fix types for the new `ci.yml` Deno step.
- **Position labels:** use the shared helper in `findPartsBuildFp4.ts`, Fleet `FindPartsTab.tsx:375` (keep `both`), and Admin `FindPartsFlow.tsx:460`.

---

## 4. Screens

**AM-20 Vehicle record** (`VehicleAutoMatchTabs.tsx`)
- **Status chip (:54):** use a real field. The car is "Pending" if it's in the pending tables, otherwise "Active catalog".
- **Area chips (:25):** from the server's area list, not a regex.
- **Add panel:** the "Any" option for position and side; the duplicate check includes position and side.
- **Remove on derived matches:** always available (via the derived-keep / remove routes), not disabled.

**AM-21 Part drawer** (`FullDatabaseDrawer.tsx`, `FullDatabaseTab.tsx`) — once section 2 returns the fields:
- **Left pane:** WVA, N FITMENTS, RECORDS LOADED.
- **Header:** brand, part type, WVA, axle, index badge.
- **Indexes:** INDEX REVISION; the group card with member chips and code (no `Group <uuid>`).
- **Reference tables:** Brand / Type / Wear sensor / Source columns; a ⋯ menu; "+ Add" sends `evidence_url`, the real brand and `index_type`.
- **Provenance:** HASH.

**AM-22 Platforms** (`platforms/PlatformsPage.tsx`) — after A3 and the admin-function shapes:
- **Header:**
  - PRIMARY KEY shows the code (not the UUID);
  - Diff Log = `platform_revision` rows (not the conflicts tab);
  - Matrix Graph = a node / edge view (not a JSON download).
- **Sister cards:** role, specs, INHERITANCE %, and "Inspect car" without the UUID.
- **Shared components table:** platform names; the Years here / Years there / Source columns; status from the server; a full ⋮ menu.
- **Add-link modal:** Component / Whole-system scope, both year ranges, an "Any" option, and the "Matches will apply to cars built …" overlap check.

**AM-23 Find parts** (`find-parts/ResultsView.tsx`) — after the `toFound` fix:
- **Rows:** `via` badges and icons.
- **Tier-2 criteria:** real sister names.
- **Query bar:** the chosen part plus position chips.
- **Footer:** TOLERANCE from `universal_part.tolerance_mm`; DATABASE NODES = groups.
- **Batch Commit:** uses `derived_id`, with your note.
- **Pending Inspect:** `AutoMatchConflictsTab` reads the `vehicle` filter.
- **Clean-up:** remove `_onAdd` / `_onBack`.

**AM-24 Conflicts** (`AutoMatchConflictsTab.tsx`)
- **DETAIL:** plain sentences per type, not JSON.
- **Audit link:** goes to the Activity log for the conflict.
- **Cards:** the heatmap and geometry cards as drawn.
- **Drawer:** copy per type and the manual-wins state.
- **Batch Resolve:** offers Remove too.

**AM-25 Data quality** (`CatalogQualityPage.tsx`)
- **Tier hint (:64):** show nothing when the breakdown is empty (not "T3–T4").
- **Copy:** remove the fixed "PARSER FALLBACK ACTIVE" (:181).
- **Remap:** the "Any" option; Confirm Merge; the `reason` column.
- **Completeness:** the card reads the keys from section 2.
- **Fixed history:** use the real report columns (:317).
- **Validation Exceptions:** read `catalog_validation_exception`.

**AM-26 Fleet Find parts** (`Fp5Screen.tsx`)
- **Car card:** plate chip, service-line chips, brake-type spec line, and a trail with the system step.
- **Requests:** "Your requests" = the real request count (no server returns `requestCount`).
- **Subsystem card:** Stitch body text and the part-name line.
- **Sections:** Stitch subtitles; the boxed count for all-checking sections.
- **Data:** dimensions.
- **Clean-up:** the unused `Fp5Actions` fields.

---

## 5. Gates

**SQL proofs (S), after A4:**
- **Failing today:** 4, 6, 38, 12a, 12c, 15b, 23, 25, 42.
- **Make real** (they pass without testing the rule): 5, 5b, 6b, 7, 9, 10, 11, 13, 14, 16, 17, 18, 20, 22, 24, 26, 27, 28, 29 (add a universal part), 35 and 44 (real concurrency), 37, 39, 43.
- **Add:**
  - the screen-backend proofs: revision rows, group revision bump, remap, schedule from cron, per-car health;
  - proofs for `admin_platforms`, `admin_platform` and completeness.

**Screen gate (AM-27):**
- **Mocks:** shape them from the real responses. Today they hide the platforms array, the completeness keys and the empty tier breakdown.
- **Coverage:**
  - every state (empty, error, flag-off, all-checking) on every screen;
  - dark mode with screenshots;
  - the Fleet test on the auto-match mocks.
- **Text both ways:** fail on any visible text that is neither Stitch nor fixture data.
- **Clicks:** every control, no swallowed clicks (spec:228).
- **S6 assertion:** fix it to match the real interval label (spec:155).
- **CI start-up:** `parts-auto-match-e2e.yml` sets the base URLs, which turns off the preview servers, and starts none. Start `vite preview` in the job.
- **CI trigger:** add `parts_auto_match_routes.ts`, `partsAutoMatchApi.ts` and the migrations to the path filter, and make the check required.
- **Screenshots and README:** save `AM-Sn-app.png`; the README says "Ported" only when it passes.

---

## Order and done gate

**Order:**
1. A1–A5.
2. Database (new migration) with the S fixes, until Parts SQL checks is green.
3. Server.
4. Screens: AM-22 → AM-21 → AM-23 → AM-20 → AM-24 → AM-25 → AM-26.
5. The gate.
6. A real run (Roomy OE numbers + `D0051M-01-J`).
7. Turn the flag on.

**Done gate:**
- [x] Committed and pushed baseline + Rev 10 follow-up on `parts-auto-match`
- [ ] Parts SQL checks, Test Supabase Functions, Parts auto-match e2e green in CI (await PR checks)
- [ ] Production `schema_migrations` includes `20261103210000` and md5 parity after deploy
- [ ] Every screen value from server; `AM-Sn-app.png` beside Stitch; README **Ported**
- [ ] Real run (Roomy OE + `D0051M-01-J`); health 0 errors; `parts_auto_match_enabled` ON

**Builder prompt:** "Read docs/parts-auto-matching-audit.md (Rev 10). Do A1–A5 first. M, T and A are in production, so every further database change goes in a new migration. Return the fields each screen shows from the server, and build the e2e mocks from real responses. Push so CI runs. Write the proof for each done-gate line here."
