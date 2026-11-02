# Parts import by area — closing plan (Rev 8, 2 Nov 2026)

Plan for every open item in [parts-import-by-area-audit.md](parts-import-by-area-audit.md) (Rev 8, OPEN). The audit holds the item list and the done gate. This file covers who does what, and in what order.

## Roles
- **Architect:** owns the server and SQL contract (Phases 1–2). The database decides; the screen only shows. No fallbacks that invent values.
- **UI/UX lead:** owns the PI1–PI6 port (Phase 3). Each `PIn-stitch.png` stays open beside the app. Nothing is added or dropped beyond the 3 porting-rule exclusions.
- **Senior devs:** one screen each, in pairs. **QA:** owns the gate (Phase 4).

## Phase 0 — Safe ground (PI-28)
1. **Branch:** create `parts-import-rev8`.
2. **Commit only the import work:**
   - `apps/admin/src/components/admin/parts-database/import/**`
   - `supabase/functions/_fleet-server/parts_import_*.ts`
   - `supabase/functions/fleet-core/routes.generated.json`
   - `supabase/migrations/20261102150000_parts_import_audit_rev6_api.sql`
   - `supabase/tests/parts_import_checks.sql`
   - `e2e/parts-import-stitch.spec.ts`
   - `.github/workflows/parts-import-e2e.yml`
   - the dominion-admin project in `playwright.config.ts`
   - `docs/parts-import-*`
   - `docs/stitch/dominion-redesign/README.md`

   Leave the driver car-kit, fleet inventory and `ci.yml` changes for their own audits.
3. **Prove production matches:** `schema_migrations` has `…054057`, `…054132`, `…062607` and `…150000` with matching file names, and fleet-core v230 = this branch.

## Phase 1 — Timeout and data bugs (PI-29, PI-30, PI-31, PI-32)
1. **Timeout:** read the fleet-core logs for the 504 and confirm the route. Move filtering and paging into SQL, and add `/progress` for polling.
2. **Data fixes:**
   - purge after 72h;
   - the changes function stops reading staging rows;
   - count distinct fits;
   - fix the 3 `tsc` errors.
3. **One migration**, named with the version production records. Every new function gets `REVOKE … FROM PUBLIC, anon, authenticated` and a case in `parts_import_checks.sql`.

## Phase 2 — Server pieces the screens need
- **New routes:** `/summary`, `/rows/:line/inspect`, bulk `PATCH /rows`, `/progress`.
- **Ledger route:** `total`, `per_area` and paging.
- **New values:** `part_import_engine_version()`, `ledger_hash`, `rowsImported`, `check_stage`/`check_started_at`, `normalized.vehicle_label`.
- **Changes function:** fits grouped by vehicle; brand on left-out rows.
- **Uploads and templates:** magic-byte detail on rejected uploads; `required_for` in the template columns.
- **Tests:** Deno tests for each route's input checks; SQL checks for each function.

## Phase 3 — Screens (PI-21 to PI-27)
1. **Order:** stepper and icons, then PI2 → PI3 → PI4 → PI5 → PI6. After each screen, run its part of the Phase 4 spec until it passes.
2. **UX pass on every screen:**
   - keyboard focus order;
   - Esc closes the drawer and dialog;
   - buttons disabled while their request runs;
   - plain-word errors that say what to fix;
   - no layout break at 900–1456px.

## Phase 4 — Real gate (PI-20)
1. **Sign-in:** rewrite `e2e/parts-import-stitch.spec.ts` using the fake-session sign-in from `e2e/dominion-find-parts-visual.spec.ts`.
2. **Fixtures:** shaped like real API responses (taken from a real staging batch), one per state:
   - PI1;
   - PI2: empty / OK / header-wrong / paste;
   - PI3: every row status, both expanded panels, the inspector;
   - PI4: normal / refresh-warning;
   - PI5: list / drawer / dialog;
   - PI6: empty / checking / file-failed / undo-blocked / no-access.
3. **Checks:**
   - text both ways against Stitch (`<main>`, drawer, dialog, minus `sample-labels.json` and the exclusions);
   - click every control and expect a request, a navigation or a visible change;
   - save `PIn-app.png`.
4. **Workflow:** build admin, run `vite preview`, wait on the port, run the spec. Make it a required check for `import/**`.
5. **README:** set PI1–PI6 to "Ported" only when the spec passes.

## Phase 5 — Ship and prove (PI-01)
1. **Ship:** merge, deploy fleet-core and the admin site, and confirm all three workflows are green.
2. **First real import:** on roamdominion.co:
   1. Brakes → `brakes-errors.csv`: errors are shown and nothing is imported.
   2. `brakes-ok.csv` → Import.
   3. Ledger → drawer → Undo.
3. **Record** the batch code, counts and screenshots in the audit, and tick the done gate.
