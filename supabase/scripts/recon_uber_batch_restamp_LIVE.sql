-- WRA-09 (Week Reconciliation go-live Step 4.5): re-stamp completed Uber uploads to Monday–Sunday of their week.
-- Run in the Supabase SQL Editor (live). One block: it saves a backup, changes the dates, then checks itself.
-- If the check fails, EVERYTHING is cancelled and nothing changes (the block raises an error).
-- Undo: recon_uber_batch_restamp_LIVE_undo.sql (puts the saved dates back).
--
-- Why this version (14 Nov 2026): the original recon_uber_batch_restamp.sql added two columns by hand
-- (schema drift vs the migration files) and used psql-only \echo lines. The backup now goes into ONE row of the
-- app's key-value table (kv_store_37f42386, key 'recon_uber_restamp_backup:wra-09'), so the tables are unchanged.

DO $$
DECLARE
  v_before  integer;
  v_after   integer;
  v_backup  jsonb;
  v_changed integer;
BEGIN
  -- Already done once? Refuse, so the backup of the ORIGINAL dates is never overwritten.
  IF EXISTS (SELECT 1 FROM public.kv_store_37f42386 WHERE key = 'recon_uber_restamp_backup:wra-09') THEN
    RAISE EXCEPTION 'Already run: a backup exists (recon_uber_restamp_backup:wra-09). Nothing changed.';
  END IF;

  SELECT count(*) INTO v_before
  FROM fleet.import_batches b
  WHERE b.source_id = 'uber_bundle' AND b.type = 'merged_import'
    AND b.status IN ('completed', 'committed') AND cardinality(b.week_keys) >= 1
    AND (b.coverage_start IS DISTINCT FROM b.week_keys[1] OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6));

  -- 1. Backup: every row this changes, with its current dates.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'coverage_start', b.coverage_start, 'coverage_end', b.coverage_end)), '[]'::jsonb)
  INTO v_backup
  FROM fleet.import_batches b
  WHERE b.source_id = 'uber_bundle' AND b.type = 'merged_import'
    AND b.status IN ('completed', 'committed') AND cardinality(b.week_keys) >= 1
    AND (b.coverage_start IS DISTINCT FROM b.week_keys[1] OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6));

  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES ('recon_uber_restamp_backup:wra-09',
          jsonb_build_object('savedAt', now(), 'rows', v_backup, 'countBefore', v_before));

  -- 2a. One-week uploads: Monday–Sunday of their week.
  UPDATE fleet.import_batches b
  SET coverage_start = b.week_keys[1], coverage_end = b.week_keys[1] + 6
  WHERE b.source_id = 'uber_bundle' AND b.type = 'merged_import'
    AND b.status IN ('completed', 'committed') AND cardinality(b.week_keys) = 1
    AND (b.coverage_start IS DISTINCT FROM b.week_keys[1] OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6));

  -- 2b. The one upload that spans 16–23 Feb 2026 → the week of 16 Feb 2026.
  UPDATE fleet.import_batches b
  SET coverage_start = date '2026-02-16', coverage_end = date '2026-02-22'
  WHERE b.source_id = 'uber_bundle' AND b.type = 'merged_import'
    AND b.status IN ('completed', 'committed') AND cardinality(b.week_keys) > 1
    AND b.week_keys @> ARRAY[date '2026-02-16']::date[];

  -- 3. Check: none left off-week, and every changed row is in the backup.
  SELECT count(*) INTO v_after
  FROM fleet.import_batches b
  WHERE b.source_id = 'uber_bundle' AND b.type = 'merged_import'
    AND b.status IN ('completed', 'committed') AND cardinality(b.week_keys) >= 1
    AND (b.coverage_start IS DISTINCT FROM b.week_keys[1] OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6));
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'Check failed: % uploads still not Monday–Sunday (was %). Everything cancelled, nothing changed.', v_after, v_before;
  END IF;

  v_changed := jsonb_array_length(v_backup);
  IF v_changed <> v_before THEN
    RAISE EXCEPTION 'Check failed: backup has % rows, expected %. Everything cancelled, nothing changed.', v_changed, v_before;
  END IF;

  RAISE NOTICE 'Done: % uploads re-stamped to Monday–Sunday; backup saved.', v_before;
END;
$$;

-- Result to send back: should read before = 37 (or the number you saw), after = 0.
SELECT (value ->> 'countBefore')::int AS before,
       (SELECT count(*) FROM fleet.import_batches b
        WHERE b.source_id = 'uber_bundle' AND b.type = 'merged_import'
          AND b.status IN ('completed', 'committed') AND cardinality(b.week_keys) >= 1
          AND (b.coverage_start IS DISTINCT FROM b.week_keys[1] OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6))) AS after
FROM public.kv_store_37f42386
WHERE key = 'recon_uber_restamp_backup:wra-09';
