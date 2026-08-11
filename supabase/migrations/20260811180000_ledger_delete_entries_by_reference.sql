-- Hard-delete unified ledger.entries (and their source_receipts) by reference/batch.
-- Used by fleet-server when trips/batches/expenses are deleted (old ledger_event KV path retired).

CREATE OR REPLACE FUNCTION public.ledger_delete_entries(
  p_reference_type text DEFAULT NULL,
  p_reference_ids text[] DEFAULT NULL,
  p_batch_id text DEFAULT NULL,
  p_from_ymd date DEFAULT NULL,
  p_source_system text DEFAULT 'kv_ledger_event'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
DECLARE
  v_entry_ids uuid[];
  v_deleted int := 0;
  v_receipts int := 0;
BEGIN
  IF p_batch_id IS NOT NULL AND length(trim(p_batch_id)) > 0 THEN
    SELECT coalesce(array_agg(e.id), ARRAY[]::uuid[])
    INTO v_entry_ids
    FROM ledger.entries e
    WHERE e.metadata->>'batchId' = p_batch_id
      AND (p_from_ymd IS NULL OR (e.effective_at AT TIME ZONE 'UTC')::date >= p_from_ymd);
  ELSIF p_reference_type IS NOT NULL AND p_reference_ids IS NOT NULL AND cardinality(p_reference_ids) > 0 THEN
    SELECT coalesce(array_agg(e.id), ARRAY[]::uuid[])
    INTO v_entry_ids
    FROM ledger.entries e
    WHERE e.reference_type = p_reference_type
      AND e.reference_id = ANY (p_reference_ids)
      AND (p_from_ymd IS NULL OR (e.effective_at AT TIME ZONE 'UTC')::date >= p_from_ymd);
  ELSE
    RETURN jsonb_build_object('deleted', 0, 'receipts_deleted', 0);
  END IF;

  IF v_entry_ids IS NULL OR cardinality(v_entry_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', 0, 'receipts_deleted', 0);
  END IF;

  DELETE FROM ledger.source_receipts sr
  WHERE sr.ledger_entry_id = ANY (v_entry_ids)
     OR (
       p_source_system IS NOT NULL
       AND sr.source_system = p_source_system
       AND sr.source_id IN (
         SELECT e.id::text FROM ledger.entries e WHERE e.id = ANY (v_entry_ids)
       )
     );
  GET DIAGNOSTICS v_receipts = ROW_COUNT;

  DELETE FROM ledger.entries e WHERE e.id = ANY (v_entry_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'receipts_deleted', v_receipts);
END;
$$;

REVOKE ALL ON FUNCTION public.ledger_delete_entries(text, text[], text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_delete_entries(text, text[], text, date, text) TO service_role;

-- Count entries for batch delete-preview
CREATE OR REPLACE FUNCTION public.ledger_count_entries_by_batch(p_batch_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  SELECT count(*)::integer
  FROM ledger.entries e
  WHERE e.metadata->>'batchId' = p_batch_id;
$$;

REVOKE ALL ON FUNCTION public.ledger_count_entries_by_batch(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_count_entries_by_batch(text) TO service_role;
