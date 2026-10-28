# Migration archive (R11b)

Older incremental migrations lived here until 2026-10-28. Prod schema was captured as a single baseline:

`supabase/migrations/20260320000000_baseline_prod_schema.sql`

Prod `supabase_migrations.schema_migrations` was repaired to list only that baseline. Do not re-apply these archived files to prod.
