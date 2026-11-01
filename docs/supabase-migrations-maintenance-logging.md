# Supabase migrations — maintenance logging

**Policy (audit P-03):** Apply versioned SQL only with `npx supabase db push` from a linked CLI so `schema_migrations.version` matches the filename in [supabase/migrations](../supabase/migrations). Do **not** apply the same migration through the Dashboard SQL editor or MCP `apply_migration` unless you immediately rename/add a matching file in the repo — otherwise production and git drift (fourth occurrence: `20261105010000` vs `20261101043001/06/15`).

**Already on production:** `20261101043001_fleet_maintenance_no_record_r04.sql`, `20261101043006_fleet_maintenance_no_record_r04_recompute_view.sql`, `20261101043015_fleet_maintenance_no_record_r04_due_view.sql` — do not re-run on live; fresh environments apply the full chain in timestamp order.

**Filename order:** Always create migrations with `supabase migration new <name>` (UTC timestamp). Never hand-pick a future date — see [ci-red-root-cause.md](./ci-red-root-cause.md) and [ADR 0001](./adr/0001-migration-reorder-decision.md). Base maintenance logging on disk is `20261101030856_fleet_maintenance_logging.sql` (resequenced from `20261103120000`).

**Production history (2026-11-01):** After the resequence merge, run `supabase migration repair --status reverted 20261103120000` on the linked project so the orphan version row matches git (DDL unchanged).

**File encoding (Windows):** Save migration SQL as UTF-8 **without BOM**. Run `node scripts/assert-migrations-utf8.mjs` before push. Do not use PowerShell `Out-File` / `Set-Content -Encoding utf8` (adds BOM). If production and git drift on applied migrations, copy bodies from `supabase_migrations.schema_migrations.statements` — see [ci-red-root-cause.md](./ci-red-root-cause.md).
