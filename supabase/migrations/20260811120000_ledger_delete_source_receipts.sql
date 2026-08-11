-- Twin-store cleanup: delete dual-write receipts when island rows are removed.
CREATE OR REPLACE FUNCTION public.ledger_delete_source_receipts(
  p_source_system text,
  p_source_ids text[] DEFAULT NULL,
  p_source_idempotency_keys text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  v_deleted int := 0;
  v_n int := 0;
BEGIN
  IF p_source_system IS NULL OR length(trim(p_source_system)) = 0 THEN
    RETURN jsonb_build_object('deleted', 0, 'error', 'source_system_required');
  END IF;

  IF p_source_ids IS NOT NULL AND array_length(p_source_ids, 1) IS NOT NULL THEN
    DELETE FROM ledger.source_receipts sr
    WHERE sr.source_system = p_source_system
      AND sr.source_id = ANY (p_source_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted + v_n;
  END IF;

  IF p_source_idempotency_keys IS NOT NULL AND array_length(p_source_idempotency_keys, 1) IS NOT NULL THEN
    DELETE FROM ledger.source_receipts sr
    WHERE sr.source_system = p_source_system
      AND sr.source_idempotency_key = ANY (p_source_idempotency_keys);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted + v_n;
  END IF;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.ledger_delete_source_receipts(text, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_delete_source_receipts(text, text[], text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
