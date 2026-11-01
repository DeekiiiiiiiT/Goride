# GitHub Actions red: what's left

Rev 13. Fix landed 2026-11-01 — bulk-synced **86** migration bodies from production `schema_migrations.statements` (see tooling below). **Awaiting GitHub:** CI + Parts SQL checks green on the merge commit (local `supabase db start` failed on this machine — Docker init error).

Rev 12 baseline: `main` @ `e1246409`. Root cause unchanged: repo files were rewrites, not prod copies (example: `20261101165443` used `value_delta`; prod creates `fleet.r5_fix_phone_holder_opening`).

## Status

| Check | State |
|-------|--------|
| Repo MD5 vs prod (126 versions, 5 skipped) | **Done** — `node scripts/compare-migration-md5-to-prod.mjs` |
| CI — Start Supabase + inventory tests | Pending GitHub |
| Parts SQL — db reset + 5 test files | Pending GitHub |
| Vercel | Was green on Rev 12 |

**Skip list (placeholder prod rows — repo file unchanged):** `20261030022441`, `20261031000834`, `20261101032731`, `20261101172128`, `20261101174625`.

## Tooling (Rev 13)

1. Export prod bodies (read-only): SQL in §1 below, or MCP → `node scripts/merge-mcp-prod-export.mjs …`
2. Write repo files: `node scripts/sync-migration-bodies-from-prod-export.mjs scripts/tmp-migrations/prod-export.json`
3. Verify: `node scripts/compare-migration-md5-to-prod.mjs` (uses [scripts/prod-migration-md5-fingerprints.json](../scripts/prod-migration-md5-fingerprints.json))
4. Also: `node scripts/assert-migrations-utf8.mjs`, `node scripts/validate-migration-sql.mjs`

Legacy path still works: [scripts/decode-prod-b64-export.mjs](../scripts/decode-prod-b64-export.mjs) → [scripts/apply-tmp-migration-bodies.mjs](../scripts/apply-tmp-migration-bodies.mjs) (now maps all `tmp-migrations/<version>.sql` files).

## 1. Repo migrations are rewrites, not copies of what production ran

```
Applying migration 20261101165443_fleet_inventory_r5_fix_phone_holder_v3.sql...
ERROR: column "value_delta" of relation "inv_ledger" does not exist (SQLSTATE 42703)
```

In production, `20261101165443` creates the function `fleet.r5_fix_phone_holder_opening`. The repo file held a hand-written `UPDATE … SET value_delta = …`.

**Fix (applied):** overwrite every drifted repo migration with production's `array_to_string(statements, E'\n')` for that version. UTF-8 without BOM. Production unchanged.

Production MD5 check:

```sql
select version, md5(regexp_replace(regexp_replace(array_to_string(statements, E'\n'), '--[^\n]*', '', 'g'), '\s+', '', 'g'))
from supabase_migrations.schema_migrations where version >= '20261029140000';
```

Compare with `node scripts/compare-migration-md5-to-prod.mjs` (same normalisation in [scripts/migration-md5-normalize.mjs](../scripts/migration-md5-normalize.mjs)).

## Verify

Parts SQL must pass all five files under `supabase/tests/` after replay. **Close this doc** only when GitHub shows **CI** and **Parts SQL checks** green on the same `main` commit.

## Rule for next time

- A migration that already ran on production is copied from `schema_migrations.statements`, never rewritten from memory or summarised as "prod sync".
- Apply new migrations with `supabase db push` from the repo file, so the repo and production can't drift.
- Run `node scripts/compare-migration-md5-to-prod.mjs` before merge when touching applied migration bodies.
