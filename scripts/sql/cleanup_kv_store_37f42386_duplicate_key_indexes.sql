-- -----------------------------------------------------------------------------
-- One-time cleanup: duplicate btree indexes on public.kv_store_37f42386 (key col)
-- Supabase advisor: "Duplicate Index" — e.g. kv_store_37f42386_key_idx, _idx1 … _idxN
--
-- Run in Supabase SQL Editor (review output first). Keeps the base name
-- `kv_store_37f42386_key_idx` (no numeric suffix). Drops only names matching
-- `kv_store_37f42386_key_idx` + one or more digits (idx1, idx10, …).
--
-- If your sole surviving index should be a different name, edit the regex below.
-- Do NOT drop indexes backing PRIMARY KEY / UNIQUE constraints without adjusting.
--
-- 1) Inspect duplicates (read-only):
--    Run only the SELECT block in "Step A" below.
-- 2) Apply cleanup:
--    Run "Step B" in a maintenance window; DROP INDEX takes ACCESS EXCLUSIVE briefly.
-- -----------------------------------------------------------------------------

-- Step A — list candidate indexes (no changes)
SELECT
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_definition
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = 'kv_store_37f42386'
  AND n.nspname = 'public'
  AND i.relname ~ '^kv_store_37f42386_key_idx[0-9]+$'
ORDER BY i.relname;

-- Step B — drop numbered duplicates (keeps kv_store_37f42386_key_idx exactly)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS idx_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND c.relname ~ '^kv_store_37f42386_key_idx[0-9]+$'
    ORDER BY c.relname
  LOOP
    RAISE NOTICE 'Dropping duplicate index: %', r.idx_name;
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', 'public', r.idx_name);
  END LOOP;
END $$;
