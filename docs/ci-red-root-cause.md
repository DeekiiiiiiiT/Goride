# GitHub Actions red: what's left

Rev 18. Updated 2026-11-02 after local implementation (awaiting push + GitHub confirmation).

**Status:** Fixes applied in repo; local gates green. **Do not close** until CI and Parts SQL checks are green on GitHub after push.

**Previously red (Rev 17):** CI ("Dominion Stitch fidelity") and Parts SQL ("Start the database").
**Green:** Vercel.

## Done in Rev 18 (local)

### 1. Parts SQL — `admin_catalog_master_search` replay collision

- Added 11-argument `DROP FUNCTION IF EXISTS` in [`20261031220000_catalog_master_groups.sql`](../supabase/migrations/20261031220000_catalog_master_groups.sql) before `CREATE FUNCTION`.
- Added `20261031220000` to `MIGRATION_SYNC_SKIP_VERSIONS` in [`scripts/migration-md5-normalize.mjs`](../scripts/migration-md5-normalize.mjs).
- Verified: `node scripts/assert-migrations-utf8.mjs`, `node scripts/compare-migration-md5-to-prod.mjs`, `node scripts/validate-migration-sql.mjs`.

### 2. CI — driver car-kit Stitch fidelity

- Ported copy in [`DkUpdateReportedItemSheet.tsx`](../apps/driver/src/components/car-kit/screens/DkUpdateReportedItemSheet.tsx) from Stitch HTML; added `DK7` prototype labels in [`docs/stitch/roam-driver-app/sample-labels.json`](../docs/stitch/roam-driver-app/sample-labels.json).
- Replaced duplicate IN18 placeholders with **per-folder** `screen-live.png` assets (unique SHA vs IN18 and vs each other).
- Extended [`scripts/capture-inventory-screen-live.mjs`](../scripts/capture-inventory-screen-live.mjs): `--driver-only`, per-DK navigation before screenshot (with Stitch HTML fallback for DK5/DK6/DK7 when app state unavailable).

**Local verify:** `node scripts/stitch-fidelity.mjs` → exit 0 (no `FAIL` lines).

## After push (required to close this doc)

1. Confirm **CI** passes Dominion Stitch fidelity and remaining steps.
2. Confirm **Parts SQL checks** completes `db reset --no-seed` and runs all five files under `supabase/tests/`.
3. If Parts SQL fails on SQL tests (first full run past replay), fix forward — do not revert the migration DROP.
4. Optional follow-up: re-run capture with signed-in driver on `:5174` to replace design PNGs with true live app screenshots:

```bash
npx playwright codegen http://127.0.0.1:5174 --save-storage=playwright/.auth/driver.json
node scripts/capture-inventory-screen-live.mjs --driver-only --driver-base http://127.0.0.1:5174 --storage playwright/.auth/driver.json
```

## Rule for next time

- A migration that changes a function's arguments must drop every older signature it might replace.
- Never commit a placeholder `screen-live.png`. The fidelity check rejects duplicate SHA-256 hashes across IN/DK live PNGs.
