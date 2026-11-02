-- Parts import by area — Rev 6 API (areas summary, ledger columns, batch changes helper)

CREATE OR REPLACE VIEW public.part_import_areas_summary AS
SELECT
  sys.id,
  coalesce(sys.plain_name, sys.name) AS name,
  sys.op_code,
  sys.icon_key,
  sys.sort_order,
  coalesce((
    SELECT count(*)::int
    FROM public.part_master pm
    JOIN public.maintenance_service_categories comp ON comp.id = pm.maintenance_component_id
    WHERE comp.parent_id = sys.id OR comp.id = ANY (
      SELECT c2.id FROM public.maintenance_service_categories c2 WHERE c2.parent_id = sys.id
    )
  ), 0) AS parts_on_file,
  coalesce((
    SELECT count(*)::int
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    JOIN public.maintenance_service_categories comp ON comp.id = pm.maintenance_component_id
    WHERE comp.parent_id = sys.id
  ), 0) AS fits_on_file,
  coalesce((
    SELECT jsonb_agg(coalesce(c.plain_name, c.name) ORDER BY c.sort_order, c.name)
    FROM public.maintenance_service_categories c
    WHERE c.parent_id = sys.id AND c.is_part IS TRUE
  ), '[]'::jsonb) AS part_types,
  coalesce((
    SELECT count(*)::int
    FROM public.part_master pm
    JOIN public.maintenance_service_categories comp ON comp.id = pm.maintenance_component_id
    WHERE comp.parent_id = sys.id AND pm.catalog_decision = 'pending'
  ), 0) AS needs_checking,
  (
    SELECT b.promoted_at
    FROM public.part_import_batch b
    WHERE b.area_id = sys.id AND b.status = 'imported'
    ORDER BY b.promoted_at DESC NULLS LAST
    LIMIT 1
  ) AS last_import_at,
  coalesce((
    SELECT t.version
    FROM public.part_import_template t
    WHERE t.area_id = sys.id AND t.active IS TRUE
    ORDER BY t.version DESC
    LIMIT 1
  ), 1) AS template_version
FROM public.maintenance_service_categories sys
WHERE sys.kind = 'system';

REVOKE ALL ON public.part_import_areas_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.part_import_areas_summary TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_batch_changes(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts jsonb;
  v_fits jsonb;
  v_left_out jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'line_no', r.line_no,
    'brand', r.raw->>'brand',
    'part_number', r.raw->>'part_number',
    'part_type', r.raw->>'part_type',
    'vehicle', coalesce(vc.make || ' ' || vc.model, r.raw->>'vehicle'),
    'position', coalesce(r.raw->>'position', r.normalized->>'position')
  ) ORDER BY r.line_no), '[]'::jsonb)
  INTO v_parts
  FROM public.part_import_change ch
  JOIN public.part_import_row r ON r.batch_id = ch.batch_id AND r.line_no = ch.line_no
  LEFT JOIN public.vehicle_catalog vc ON vc.id = r.vehicle_catalog_id
  WHERE ch.batch_id = p_batch_id AND ch.table_name = 'part_master' AND ch.op = 'insert';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'vehicle', coalesce(vc.make || ' ' || vc.model || coalesce(' · ' || vc.version_name, ''), r.raw->>'vehicle'),
    'positions', coalesce(r.raw->>'position', r.normalized->>'position', '—'),
    'count', 1
  ) ORDER BY r.line_no), '[]'::jsonb)
  INTO v_fits
  FROM public.part_import_change ch
  JOIN public.part_import_row r ON r.batch_id = ch.batch_id AND r.line_no = ch.line_no
  LEFT JOIN public.vehicle_catalog vc ON vc.id = r.vehicle_catalog_id
  WHERE ch.batch_id = p_batch_id AND ch.table_name = 'part_listing' AND ch.op = 'insert';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'line_no', r.line_no,
    'part_number', r.raw->>'part_number',
    'code', (r.issues->0->>'code'),
    'message', coalesce(r.issues->0->>'message', 'Excluded')
  ) ORDER BY r.line_no), '[]'::jsonb)
  INTO v_left_out
  FROM public.part_import_row r
  WHERE r.batch_id = p_batch_id AND r.status IN ('error', 'duplicate');

  RETURN jsonb_build_object('parts', v_parts, 'fits', v_fits, 'leftOut', v_left_out);
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_batch_changes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_batch_changes(uuid) TO service_role;

DROP VIEW IF EXISTS public.part_import_ledger_by_area;

CREATE VIEW public.part_import_ledger_by_area AS
SELECT
  b.id,
  b.code,
  b.area_id,
  coalesce(sys.plain_name, sys.name) AS area_name,
  b.file_name,
  b.file_sha256,
  b.status,
  b.rows_total,
  b.rows_valid,
  b.rows_labelled,
  b.rows_error,
  b.rows_duplicate,
  b.rows_unchanged,
  b.parts_created,
  b.parts_updated,
  b.fits_created,
  b.fits_updated,
  b.uploaded_by,
  b.promoted_by,
  b.undone_by,
  b.created_at,
  b.checked_at,
  b.promoted_at,
  b.undone_at,
  b.refresh_warning,
  b.source_batch_id,
  coalesce(
    nullif(trim(coalesce(pu.raw_user_meta_data->>'name', pu.raw_user_meta_data->>'full_name', '')), ''),
    split_part(pu.email, '@', 1),
    'Staff'
  ) AS promoted_by_name,
  (
    SELECT prev.code
    FROM public.part_import_batch prev
    WHERE prev.area_id = b.area_id
      AND prev.status = 'imported'
      AND prev.promoted_at IS NOT NULL
      AND prev.promoted_at < coalesce(b.promoted_at, now())
    ORDER BY prev.promoted_at DESC
    LIMIT 1
  ) AS previous_batch_code,
  (
    b.status = 'imported'
    AND b.promoted_at IS NOT NULL
    AND b.promoted_at > now() - interval '72 hours'
    AND coalesce((pf.pf->>'ok')::boolean, false)
  ) AS undo_open,
  (
    b.status = 'imported'
    AND b.promoted_at IS NOT NULL
    AND b.promoted_at > now() - interval '72 hours'
    AND coalesce((pf.pf->>'ok')::boolean, false)
  ) AS can_undo,
  CASE
    WHEN b.status = 'imported'
      AND b.promoted_at IS NOT NULL
      AND b.promoted_at > now() - interval '72 hours'
      AND NOT coalesce((pf.pf->>'ok')::boolean, false)
    THEN coalesce(pf.pf->'reasons', '[]'::jsonb)
    ELSE '[]'::jsonb
  END AS undo_blocked_reasons
FROM public.part_import_batch b
JOIN public.maintenance_service_categories sys ON sys.id = b.area_id
LEFT JOIN auth.users pu ON pu.id = b.promoted_by
LEFT JOIN LATERAL (
  SELECT public.part_import_undo_preflight(b.id) AS pf
) pf ON b.status = 'imported';

REVOKE ALL ON public.part_import_ledger_by_area FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.part_import_ledger_by_area TO service_role;
