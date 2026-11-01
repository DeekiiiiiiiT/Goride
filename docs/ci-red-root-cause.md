# GitHub Actions red: what's left

Rev 9. Implemented 2026-11-01 (local verify). **Do not mark Closed until GitHub shows all four workflows green on `main` after push.**

Production: `20261101190448_fn_revoke_anon_nov1` applied to `csfllzzastacofsvcdsc` (vehicle pending research trigger + 26 REVOKEs). Migration sorts after `20261101190300_*` so replay and `assert-public-fn-revoke-anon` stay valid.

## Done in repo

1. **UTF-8** — `20261101162715_catalog_research_fixes.sql` line 1 uses ASCII `R1-R12`.
2. **REVOKE + trigger** — `supabase/migrations/20261101190448_fn_revoke_anon_nov1.sql` (created via `supabase migration new`, renamed to sort after enterprise maintenance releases).
3. **Edge manifests** — `fleet-ops` (99) and `fleet-core` (796) via `edge-route-manifest.mjs --all`.
4. **Deno tests** — migration glob helper; inventory + find-parts route tests updated.
5. **Fleet/admin CI** — FP13 sample constants removed; unused `FP14_CATALOG_ADDED_LINE` removed; Stitch CSS rebuilt; `PendingResearchJobPanel` wired in drawer; Dominion `screens.json` S10e–S10j; DK4 README lists `Dk4ReportsList.tsx`; FP9 fidelity skips; driver DK4 uses live-data floor (35%) with both React files in README row.

## Verify locally (passed 2026-11-01)

- `node scripts/assert-migrations-utf8.mjs`
- `node scripts/assert-public-fn-revoke-anon.mjs`
- `node scripts/edge-route-manifest.mjs --all --check`
- `node scripts/stitch-contract.mjs`
- `node scripts/stitch-fidelity.mjs`
- `node scripts/admin-reachability.mjs`
- Deno: six `_fleet-server` test files (with `--allow-read` as in CI)
- Vitest: `findParts.noSample.test.ts`, `findPartsCssCoverage.test.ts`

## Still on you after push

- GitHub: **CI**, **Parts SQL**, **Deploy Supabase Edge Function**, **Test Supabase Functions** all green on `main`.
- Then set this doc to **Closed** with run URLs.

## Rule for next time

- Create migrations with `supabase migration new`, which sets the current UTC time. If the new file must sort **after** migrations already committed with later timestamps, rename the file prefix only (keep one migration body).
- Never delete or blank out a REVOKE migration.
- When you rename or split a migration, grep `*.test.ts` for the old filename.
