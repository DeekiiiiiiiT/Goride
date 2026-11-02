# Dominion · Parts import by area — audit (Rev 8, 2 Nov 2026)

**Status: OPEN (Rev 8 on `parts-import-rev8`, PR #3).** Platform RPCs applied on production (via MCP slices + `202611022229*` migrations); fleet-core redeployed 2 Nov 2026. PI-01 production smoke still needs owner session on roamdominion.co.

**Verified in Rev 8 (repo + prod DB, 2 Nov 2026):**
- PI-16, PI-18 and PI-19 remain fixed. Deno CSV tests pass locally.
- **PI-29:** `GET /batches/:id/progress` + SQL `part_import_list_rows`; poll uses progress only.
- **PI-30:** `ImportStepper` param order + typed sync check body in `partsImportApi.ts`.
- **PI-31 / PI-32:** Migration `20261102180000_parts_import_audit_rev8.sql` (72h purge, DISTINCT fits, batch_changes from change log).
- **PI-20 (partial):** `e2e/parts-import-stitch.spec.ts` — PI1–PI6 screenshots + mocked PI3/PI4/PI6 flows; CI on PR #3.
- **PI-28:** Branch pushed; [PR #3](https://github.com/DeekiiiiiiiT/Goride/pull/3).
- **PI-26 (partial):** Ledger meta from `/meta`, undo dialog (Esc, error stays open, `delete_sweep`, file chip), zero-count area chips → PI6 empty; line inspector panel on PI3.

---

## Porting rules

- **Build everything:** every Stitch element is built with the same layout, text, chips and icons, and gets a real feature behind it. Sample values show real data.
- **Only 3 exclusions:**
  - designer frame labels ("FRAME A //…", "STATUS: …", "MATRIX VIEW", "RUNTIME MODE", "LOCK STATE", "POLICY", the PI6 page title and footer strip);
  - PI2's "Side-by-side / Validated only / Error state only" toggle;
  - the Dominion shell.
- **One state at a time:** two frames side by side mean two states of one screen; show whichever is true now.
- **No filler and no fake data:** no hard-coded counts, no `now()` stand-ins, no text added just to match Stitch.

Spec: `docs/stitch/dominion-redesign/html/PI1…PI6` and `screenshots/PIn-stitch.png`.

---

## Open — system

| ID | Problem | Fix |
|---|---|---|
| PI-28 | Nothing is committed. The import work is mixed with unrelated driver car-kit, fleet inventory and `ci.yml` changes, so CI has never run on it. | Commit only the import files (list in the plan, Phase 0) on branch `parts-import-rev8` and push. |
| PI-29 | "Gateway Timeout" on Upload and check (owner test). Likely cause: every 2-second poll of `GET /batches/:id` loads up to 5,000 `select *` rows and filters them in memory. | Confirm the route in the fleet-core logs. Move the `status`/`issue`/`q` filters and paging into SQL, and add a light `GET /batches/:id/progress` for polling. |
| PI-30 | Admin `tsc` has 3 new errors under `import/`: `ImportStepper.tsx:24` (TS1016) and `partsImportApi.ts:123` (`body` unknown). | Fix both. Target: 0 errors under `import/`. |
| PI-31 | The hourly purge deletes staging rows after **24h**, but undo is open for 72h. `part_import_batch_changes` reads `part_import_row`, so the drawer goes blank after 24h. | Purge only after 72h. The changes function reads `part_import_change` plus the catalog tables only. |
| PI-32 | `part_import_areas_summary.fits_on_file` joins listings by interchange group, so a fit can be counted more than once. | Use `count(DISTINCT pl.id)`. |
| PI-20 | No real test gate. `e2e/parts-import-stitch.spec.ts` checks 3 phrases on PI1 only, every other API call returns `{}`, and there's no click test, no PI2–PI6 and no screenshot. The workflow has no signed-in session and uses `sleep 8`. | Rewrite the spec. Sign in with the fake-session pattern from `e2e/dominion-find-parts-visual.spec.ts`, and use real-shaped fixtures for every state. Check the text both ways (Stitch text missing fails; filler fails), click every control, and save `PIn-app.png`. The workflow waits on the port, and the spec is a required check for `import/**`. Set the README to "Ported" only when it passes. |
| PI-01 | No real import has gone through the screen yet. | After the items above: on roamdominion.co, import `brakes-errors.csv` then `brakes-ok.csv` into Brakes, undo the batch from the ledger, and record the batch code, counts and screenshots here. |

---

## Open — screens

### PI-21 Stepper and PI-22 icons
- **Stepper:**
  - PI1 = 4 circles joined by a line.
  - PI3 = "Step 1 Area & Domain ✓ · Step 2 Upload Source ✓ · Step 3 · In Review / Check FITMENT MATRIX · Step 4 Done & Sync".
  - PI2 active card reads "Upload SELECT FILE".
  - One row at 900px and wider.
- **Area icons:**

  | Area | Icon |
  |---|---|
  | Brakes | `album` |
  | Tires & wheels | `tire_repair` |
  | Belts & hoses | `cable` |
  | Suspension & steering | `swap_driving_apps` |
  | Transmission | `motion_sensor_active` |
  | HVAC | `air` |
  | Lighting & visibility | `lightbulb` |

  The banner icon is `info`.

### PI-23 PI2 Template and upload
- **Remove what Stitch doesn't have:** the "View template" tile, `ImportTemplateOverlay.tsx`, and "This runs validation and takes you to step 3.".
- **Columns table:** "Columns in this template" sits inline. Remove the extra Status column, legend and badges.
- **Template-driven:** columns, Required / Required* / Optional and rules come from `part_import_template.columns`, not the hard-coded list (`importCsvHeader.ts:5,85-99`).
  - Add `required_for` for `position`/`spec`.
  - `year_from`/`year_to` are Optional.
- **Header line:** green "Header matches the {Area} template (N of N columns aligned)", with N = columns in the file. Green only when every file column is in the template and all required columns are present. Today it shows "9 of 14" in green.
- **File chip:** add "· X KB · {Area} Category".
- **Tiles:** build ROWS VALID / POSITIONS / PRICES INCLUDED.
- **Red box:** bullets for "Missing column: x" and "Not allowed: y — reason". Keep the drop zone and "Paste rows instead" visible.
- **Remediation guide:** "FIX PROTOCOL" chip, and one entry per problem with an icon and the why.
- **Footer:** add "· SECURITY: ISOLATED PARSER SANDBOX · NO TELEMETRY LEAKS".
- **Vehicle-list icon:** `table_rows`.

### PI-24 PI3 Check results
- **New `GET /batches/:id/summary`:** whole-batch status counts, will-create/add/update (from `create_part`, `add_fit`, `update_part`, `update_fit`), issue codes with counts, and the KPI inputs. Today these count only the current page, and "update" is always 0.
- **Summary pills:** build the 5 status pills.
- **Issue dropdown:** sends the issue **code**. Today it sends the message and always returns 0 rows.
- **Whole-batch actions:** "Import N rows" and tick-all count the whole batch. Add a bulk `PATCH /batches/:id/rows`.
- **Engine line:** comes from a new `part_import_engine_version()` (not the template version). The "checked" date uses `checked_at` only.
- **Buttons:**
  - "View that import" opens that batch's drawer (today it does nothing).
  - "Audit trail" opens Activity log filtered to the batch.
- **Vehicle label:** the server writes `normalized.vehicle_label`, and the table shows it.
- **Classification chips:** one per match type (OEM, Sister, Engine, Aftermarket, Universal). Part type shows its plain name.
- **Expanded panels:**
  - The candidate list from `normalized.vehicle_candidates` gets a working "Use this one".
  - The override input is bound to "Check row".
  - "Fix inline" edits the cell.
  - "Differs from confirmed" is the two-column On file / In your file comparison.
  - Every row can expand.
- **"Line N Inspection" side panel:** build it on a new `GET /batches/:id/rows/:line/inspect`. It shows schema validation, fitment attributes and cross-references with tiers, plus "Dismiss Inspector".
- **KPI cards:**
  - bars on each card;
  - "+x% catalog depth";
  - the OEM : other ratio with a two-colour bar and percentages;
  - "N Pending Fixes", "N Hard Errors" and the unlock hint.
- **Footer icons:** download and `sync` icons on the footer buttons.

### PI-25 PI4 Done
- **Rows imported:** promote returns `rowsImported`, and "Imported N rows" uses it. The UNCHANGED chip uses `rows_unchanged`.
- **Refresh block:** inside the card, above the buttons, with its icon, the "REPLICA LAG" chip and the button icon.
- **Buttons:** "View Import Ledger" and "Revert / Undo" appear once, in the table header.
- **LEDGER HASH:** a new `ledger_hash` column (sha256 of the change rows, written at promote). Today it shows the file hash.
- **SIGNED line:** real name and display role. No "Staff" fallback, and no `now()` time fallback.
- **Records table:** reads `/changes`, with:
  - spec line;
  - "Tier n (label) · n models";
  - "{Area} / {type}";
  - "CREATED (n/n)";
  - EXCLUDED icon.

  "N hrs remaining" counts down from `promoted_at + 72h` (today it is a fixed 72).
- **"View Import Ledger":** opens this batch's drawer.
- **"Revert / Undo":** preflight OK opens the undo dialog; preflight blocked shows the PI6 blocked state. Today it only shows a toast.

### PI-26 PI5 Ledger, drawer, undo
- **Ledger route:** returns paging, `total` and `per_area` counts. Today it is capped at 100 rows.
- **Real values:**
  - ACTIVE WORKSPACE = `VITE_DOMINION_WORKSPACE_ID`;
  - PARSER ENGINE = `part_import_engine_version()`;
  - INTEGRITY VERIFIED = share of imported batches whose change-log counts match the batch counts ("—" when there are none). Today it's an undo ratio.
- **Area chips:** 0-count chips are clickable and open the PI6 empty state. All chips get icons.
- **Layout:** one "Sync", inside the Batch History strip, next to the filter input.
- **Failed row:** "0 ready · 1 file error", "—" in Changes, and "Could not read this file" under Action.
- **Blocked row:** "n fits changed later" plus a disabled Undo.
- **Drawer:**
  - gets `iconKey`;
  - parts lines show brand+number over "type → vehicle", with position chips and a "Tier 1 Fitments" chip;
  - fits are grouped by vehicle with positions and counts (fix in `part_import_batch_changes`);
  - left-out rows include the brand;
  - tile colours as in Stitch.
- **Undo dialog:**
  - warning icon, "file · date" chip, `delete_sweep` icon, Esc closes;
  - it stays open with the error if undo fails;
  - after success, reload the ledger, the drawer and the area cards.
- **Conflict links:** wired (see PI-27).

### PI-27 PI6 States
- **Empty:** the area comes from the chip (no "Brakes" fallback), with the start icon.
- **Checking:**
  - the server writes `check_stage` and `check_started_at`, and the screen shows that stage (not a guess from %);
  - ETA = elapsed ÷ checked × remaining;
  - no fake 8% bar;
  - Cancel stops the polling;
  - re-checks at step 3 show this state too.
- **File failed:**
  - the server returns the first 4 bytes in hex and the detected type (ZIP/XLSX, XLS `D0CF11E0`, PDF, UTF-16, binary);
  - the state is chosen from the HTTP status, not a text regex;
  - Retry re-uploads to the same batch.
- **Undo blocked:**
  - the title counts fit conflicts only;
  - "(lines 04, 09, 12 affected)" and "· N ROWS RECORDED";
  - each "[Line nn …]" opens the fit in Full database.
- **No permission:**
  - "Active context: {initials} · {role}", used in the text;
  - the owner's real name, with a key icon;
  - after the request: "Request sent", disabled;
  - nothing renders while the role is loading.

---

## Done gate
- [x] PI-28: branch `parts-import-rev8` pushed; PR #3 open.
- [x] Production Rev 8 RPCs (`part_import_list_rows`, ledger hash/meta, 72h purge, batch_changes) + fleet-core deploy (2 Nov 2026). Repo migration `20261102180000` not in `schema_migrations` (applied as MCP slices); local `db push` still blocked by remote-only versions — see [ci-red-root-cause.md](ci-red-root-cause.md).
- [ ] PI-29: owner re-test — 25-row upload+check under 30s on roamdominion.co after deploy.
- [ ] Parts SQL checks, Test Supabase Functions and Parts import Stitch e2e green on CI.
- [x] PI-30: admin `tsc` — no errors under `import/` (verify in CI).
- [ ] PI-20: CI green for full PI1–PI6 spec (local Playwright needs workspace install).
- [ ] PI-01: production Brakes import recorded below.

### PI-01 production smoke (owner — after deploy)
1. Brakes → `supabase/tests/fixtures/parts-import/brakes-errors.csv` — errors only.
2. `brakes-ok.csv` → promote.
3. Ledger → undo.
4. Record: batch code, row counts, screenshots in this section.

| Step | Batch code | Counts | Screenshot |
|------|------------|--------|------------|
| errors CSV | _pending_ | _pending_ | _pending_ |
| ok CSV + undo | _pending_ | _pending_ | _pending_ |

**Outside this audit:** CI migration parity ([ci-red-root-cause.md](ci-red-root-cause.md)). The driver car-kit and fleet inventory changes in the working tree.

**Builder prompt:** "Read docs/parts-import-by-area-audit.md (Rev 8) and docs/parts-import-by-area-plan.md. Do the plan's phases in order. Commit only the import files on branch `parts-import-rev8`. For every screen, open docs/stitch/dominion-redesign/screenshots/PIn-stitch.png beside the app and follow the porting rules exactly. Don't add anything Stitch doesn't have, and don't invent values. Don't mark anything done until its done-gate line is proven, and write the proof here."
