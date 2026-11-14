-- Undo for recon_uber_batch_restamp_LIVE.sql: puts every saved upload date back, then removes the backup.
-- Run in the Supabase SQL Editor (live). If anything does not match, everything is cancelled.

DO $$
DECLARE
  v_rows     jsonb;
  v_expected integer;
  v_restored integer;
BEGIN
  SELECT value -> 'rows' INTO v_rows
  FROM public.kv_store_37f42386 WHERE key = 'recon_uber_restamp_backup:wra-09';
  IF v_rows IS NULL THEN
    RAISE EXCEPTION 'No backup found (recon_uber_restamp_backup:wra-09). Nothing changed.';
  END IF;
  v_expected := jsonb_array_length(v_rows);

  UPDATE fleet.import_batches b
  SET coverage_start = (r ->> 'coverage_start')::date,
      coverage_end   = (r ->> 'coverage_end')::date
  FROM jsonb_array_elements(v_rows) r
  WHERE b.id::text = r ->> 'id';
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  IF v_restored <> v_expected THEN
    RAISE EXCEPTION 'Restored % rows, expected %. Everything cancelled, nothing changed.', v_restored, v_expected;
  END IF;

  DELETE FROM public.kv_store_37f42386 WHERE key = 'recon_uber_restamp_backup:wra-09';
  RAISE NOTICE 'Undone: % uploads have their original dates back.', v_restored;
END;
$$;
