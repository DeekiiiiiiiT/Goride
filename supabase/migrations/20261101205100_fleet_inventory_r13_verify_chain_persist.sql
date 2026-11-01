-- R13-03: Production inv_verify_chain lost INSERT (returns JSON only). Restore chain_check rows for KPI + nightly job.

CREATE OR REPLACE FUNCTION fleet.inv_verify_chain(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_row fleet.inv_ledger%ROWTYPE;
  v_prev_hash text := repeat('0', 64);
  v_expected text;
  v_canonical text;
  v_count bigint := 0;
  v_ok boolean := true;
  v_broken bigint;
  v_head_block bigint;
  v_head_hash text;
BEGIN
  IF p_org_id IS NULL OR btrim(p_org_id) = '' THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  FOR v_row IN
    SELECT * FROM fleet.inv_ledger WHERE organization_id = p_org_id ORDER BY block_no ASC
  LOOP
    v_count := v_count + 1;
    IF v_row.prev_hash IS DISTINCT FROM v_prev_hash THEN
      v_ok := false;
      v_broken := COALESCE(v_broken, v_row.block_no);
    END IF;
    v_canonical := fleet.inv_ledger_canonical(v_row);
    v_expected := encode(digest(v_row.prev_hash || '|' || v_canonical, 'sha256'), 'hex');
    IF v_row.row_hash IS DISTINCT FROM v_expected THEN
      v_ok := false;
      v_broken := COALESCE(v_broken, v_row.block_no);
    END IF;
    v_prev_hash := v_row.row_hash;
    v_head_block := v_row.block_no;
    v_head_hash := v_row.row_hash;
  END LOOP;

  INSERT INTO fleet.inv_chain_check (
    organization_id, entries, head_block, head_hash, ok, broken_at_block, checked_by
  )
  VALUES (
    p_org_id, v_count, v_head_block, v_head_hash, v_ok, v_broken, 'system'
  );

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'ok', v_ok,
    'entries', v_count,
    'head_block', v_head_block,
    'head_hash', v_head_hash,
    'broken_at_block', v_broken
  );
END;
$$;

DO $$
BEGIN
  PERFORM fleet.inv_verify_chain('8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823');
END $$;
