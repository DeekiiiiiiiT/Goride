-- AM-25: confirm merge removes duplicate listing; remap "Any" persists null position/side.

CREATE OR REPLACE FUNCTION public.part_norm_position_report_remap(
  p_report_id uuid,
  p_position text,
  p_side text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.part_norm_position_backfill_report%ROWTYPE;
  v_norm record;
BEGIN
  SELECT * INTO v_row FROM public.part_norm_position_backfill_report WHERE id = p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report row not found'; END IF;

  IF p_position IS NULL AND p_side IS NULL THEN
    IF v_row.table_name = 'part_listing' THEN
      UPDATE public.part_listing pl SET position = NULL, side = NULL WHERE pl.id = v_row.row_id;
    ELSIF v_row.table_name = 'part_listing_exclusion' THEN
      UPDATE public.part_listing_exclusion ex SET position = NULL, side = NULL WHERE ex.id = v_row.row_id;
    ELSE
      RAISE EXCEPTION 'Remap not supported for %', v_row.table_name;
    END IF;
  ELSE
    SELECT * INTO v_norm FROM public.part_norm_position(p_position, p_side);
    IF v_row.table_name = 'part_listing' THEN
      UPDATE public.part_listing pl
      SET position = v_norm.norm_position, side = v_norm.norm_side
      WHERE pl.id = v_row.row_id;
    ELSIF v_row.table_name = 'part_listing_exclusion' THEN
      UPDATE public.part_listing_exclusion ex
      SET position = v_norm.norm_position, side = v_norm.norm_side
      WHERE ex.id = v_row.row_id;
    ELSE
      RAISE EXCEPTION 'Remap not supported for %', v_row.table_name;
    END IF;
  END IF;

  UPDATE public.part_norm_position_backfill_report r
  SET resolved_at = now(),
      resolved_by = p_actor,
      resolution_source = 'manual'
  WHERE r.id = p_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_norm_position_report_confirm_merge(
  p_report_id uuid,
  p_survivor_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.part_norm_position_backfill_report%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.part_norm_position_backfill_report WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report row not found'; END IF;
  IF v_row.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Report already resolved'; END IF;
  IF v_row.reason <> 'duplicate_after_normalization' THEN
    RAISE EXCEPTION 'Confirm merge applies to duplicate normalization reports only';
  END IF;
  IF v_row.survivor_id IS DISTINCT FROM p_survivor_id THEN
    RAISE EXCEPTION 'survivor_id does not match this report';
  END IF;
  IF v_row.table_name = 'part_listing' THEN
    IF NOT EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.id = p_survivor_id) THEN
      RAISE EXCEPTION 'Survivor listing not found';
    END IF;
    DELETE FROM public.part_listing pl WHERE pl.id = v_row.row_id;
  ELSE
    RAISE EXCEPTION 'Confirm merge not supported for %', v_row.table_name;
  END IF;

  UPDATE public.part_norm_position_backfill_report r
  SET resolved_at = now(),
      resolved_by = p_actor,
      resolution_source = 'manual'
  WHERE r.id = p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.part_norm_position_report_confirm_merge(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_norm_position_report_confirm_merge(uuid, uuid, uuid) TO service_role;
