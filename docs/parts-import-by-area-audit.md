# Dominion · Parts import by area — audit (Rev 5, 2 Nov 2026)

**Open items only.** Audit only: the auditor changed no code. Each item has one fix.

**Verified this round:**
- Commit `32087b7c` is pushed.
- Live roamdominion.co serves the new import (`PartsDatabasePage` chunk calls `parts-import`).
- fleet-core v221 was deployed at 02:41 UTC.
- Migration `20261102024003` is live with a matching file name.
- 0 `part_import_*` functions are open to anon or authenticated users.
- The Honda and unknown-brand number rules are correct.
- Admin `tsc` shows 0 errors under `import/`.
- The Dominion Stitch fidelity check is OK.

---

## Open

### PI-18 (High) — A side written as "Left" or "Right" crashes the whole import
- **Problem:**
  - `part_listing.side` only accepts `left`, `right` or `both` (lowercase).
  - Validation never checks `side`, so "Left" passes the Check step.
  - Then `part_import_promote` fails on `part_listing_side_check`, and the whole batch fails.
  - The shipped fixture `brakes-ok.csv` uses `Left`, so it hits this too.
  - Proven by a rolled-back production test.
- **Fix:**
  - in `part_import_validate_rows`, lowercase `side` into `normalized->>'side'`;
  - add the error `SIDE_INVALID` (column `side`) when the value is not empty and not `left`, `right` or `both`;
  - `part_import_promote` reads `normalized->>'side'` instead of `raw->>'side'`.

### PI-19 (High) — A catalog editor can see every fleet's data, and the Deno tests are red
- **Problem:**
  - `platform_catalog_editor` was added to `PLATFORM_RESOLVED_ROLES` in `rbac_middleware.ts`.
  - That set is the list of roles that skip org filtering (`org_scope.ts`), so a catalog-only user sees every fleet organisation's data.
  - It also fails `rbac_platform_staff.test.ts:23`, so "Test Supabase Functions" is red (1285 passed, 1 failed).
- **Fix:** remove `platform_catalog_editor` from `PLATFORM_RESOLVED_ROLES`. Keep it in `VALID_ROLES` and keep its `catalog.import` permission.
- **Confirm:** the Deno test passes, and a catalog editor gets 403 on a fleet route.

### PI-16 (Medium) — The new SQL checks fail when run, and CI never reaches them
- **Problem:**
  - `parts_import_checks.sql` stages rows without `vehicle_catalog_id`. The edge resolver normally sets it, so every row gets `VEHICLE_NOT_FOUND` or `duplicate`.
  - The first check (1 part, 3 fits) fails.
  - The re-import check only validates and never promotes.
  - The Undo check never calls Undo.
  - Parts SQL CI stops earlier, at migration `20261029213000` (places quality assert, CI-red audit), so this file has never run in CI.
- **Fix:**
  - after each `part_import_insert_staged_rows`, set `vehicle_catalog_id = (raw->>'vehicle')::uuid`;
  - use `side 'left'`;
  - promote the re-import batch before checking `catalog_decision`;
  - call Undo after the failed preflight, then count 3 fits.
- **Confirm:** with these changes, a rolled-back production run gave:
  - 1 part / 3 fits;
  - 3 unchanged;
  - preflight `ok=false`;
  - confirmed name kept.

  The file must pass locally with `psql`.

### PI-01 — No real import through the screen yet
- **Problem:** the only batch in production is from 30 Oct, and no signed-in `parts-import` request has reached fleet-core.
- **Fix:** after PI-18, sign in on roamdominion.co and import `supabase/tests/fixtures/parts-import/brakes-ok.csv` (Brakes) through Check → Import. Then undo it from the ledger.

---

**Outside this audit:** the "CI" job fails because `scripts/assert-migration-versions-parity.mjs:41` passes `--project-ref` to `supabase migration list`, and that flag doesn't exist. This belongs to the CI-red audit.

**Builder prompt:** "Read docs/parts-import-by-area-audit.md. Fix PI-18, PI-19 and PI-16 (apply the new migration and name the file with the version from schema_migrations), commit only this work and push, then do PI-01 on roamdominion.co. Don't mark anything done."
