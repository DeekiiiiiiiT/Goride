# GitHub Actions red: what's left

Rev 11. Remediation applied 2026-11-01 (local). Production repair done. **CI / Parts SQL still red on GitHub until this commit is pushed** (last remote run: [CI 41340793190](https://github.com/DeekiiiiiiiT/Goride/actions/runs/41340793190), [Parts SQL 41340793213](https://github.com/DeekiiiiiiiT/Goride/actions/runs/41340793213) @ `6e78b1de`).

## Done (Rev 11)

1. **Nine migration files** restored from production `supabase_migrations.schema_migrations` (UTF-8, no BOM). Sizes now follow statement boundaries (no equal 8,593-byte chunks). `20261101163616` contains pg_cron `fleet-inventory-nightly-integrity`, not `SELECT 1`.
2. **Production history:** `supabase migration repair --status reverted 20261101185632` — duplicate revoke row removed; `20261101190448` remains applied.
3. **CI bootstrap:** [`scripts/bootstrap-inventory-local-db.mjs`](../scripts/bootstrap-inventory-local-db.mjs) seeds test org only (no archive double-apply after full replay).
4. **Guards:** [`scripts/validate-migration-sql.mjs`](../scripts/validate-migration-sql.mjs) rejects truncated files and warns on equal-size `fleet_inventory_engine_schema_*` chunks. Encoding notes in [`docs/supabase-migrations-maintenance-logging.md`](./supabase-migrations-maintenance-logging.md).
5. **Repeat export:** `scripts/decode-prod-b64-export.mjs` + `scripts/apply-tmp-migration-bodies.mjs` (MCP/SQL base64 export path).

## Verify (still required)

After **push to `main`**:

- [ ] [CI](https://github.com/DeekiiiiiiiT/Goride/actions/workflows/ci.yml) green (inventory `supabase db reset` + Deno suite).
- [ ] [Parts SQL checks](https://github.com/DeekiiiiiiiT/Goride/actions/workflows/parts-sql-checks.yml) green (full replay + five `supabase/tests/*.sql` files).

Parts SQL may surface **new** failures after `20261101163408` (previously hidden). Triage per test file; prefer prod `schema_migrations` copy for already-applied versions.

**Local note:** This machine’s Supabase CLI (2.54.11) failed `supabase start` on storage init (`Migration fix-search-by-timestamp-sqli not found`). GitHub uses CLI 2.99.0 — use CI as source of truth after push.

## Historical root cause (Rev 10)

Rev 10. Checked 2026-11-01 19:30 UTC against `main` @ `6e78b1de`.

**Green:** Deploy Supabase Edge Function, Test Supabase Functions, Vercel, recon-worker.
**Red:** CI and Parts SQL — byte-split inventory migrations stopping at `20261101163300` (`syntax error at end of input`).

### 1. The inventory schema migration was cut into pieces mid-statement

Both CI ("Start Supabase and bootstrap inventory schema") and Parts SQL ("Start the database") stopped at:

```
Applying migration 20261101163300_fleet_inventory_engine_schema_1.sql...
ERROR: syntax error at end of input (SQLSTATE 42601)
```

Repo files were one script chopped into equal 8,593-byte pieces; production had eight clean pieces under the same version numbers.

**Fix (completed):** overwrite each of nine repo files from production `array_to_string(statements, E'\n')` for versions `20261101163300` … `20261101163408` and `20261101163616`.

### 2. Production history had the revoke migration twice

**Fix (completed):** `supabase migration repair --status reverted 20261101185632`.

## Rule for next time

- Never split a migration by size. Split only between complete statements, or keep it as one file.
- If production applied it in pieces, copy each piece from `schema_migrations.statements`.
- Create migrations with `supabase migration new`.
- Never write SQL files with PowerShell `Out-File` or `Set-Content`.
