-- Parts import by area — Rev 8 (PI-29–PI-32, API for PI-23–PI-27)

ALTER TABLE public.part_import_batch
  ADD COLUMN IF NOT EXISTS check_stage text,
  ADD COLUMN IF NOT EXISTS check_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ledger_hash text;

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
    SELECT count(DISTINCT pl.id)::int
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

CREATE OR REPLACE FUNCTION public.part_import_engine_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT '2.4.0'::text;
$$;

REVOKE ALL ON FUNCTION public.part_import_engine_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_engine_version() TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_purge_staging()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  WITH doomed AS (
    SELECT r.batch_id, r.line_no
    FROM public.part_import_row r
    JOIN public.part_import_batch b ON b.id = r.batch_id
    WHERE b.promoted_at IS NOT NULL
      AND b.promoted_at < now() - interval '72 hours'
      AND b.status = 'imported'
      AND r.status IN ('valid', 'labelled', 'unchanged')
  )
  DELETE FROM public.part_import_row r
  USING doomed d
  WHERE r.batch_id = d.batch_id AND r.line_no = d.line_no;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deletedRows', v_deleted);
END;
$$;

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
    'line_no', ch.line_no,
    'brand', coalesce(ch.after->>'brand', ch.after->>'oem_brand'),
    'part_number', coalesce(ch.after->>'oem_part_number', ch.after->>'part_number'),
    'part_type', ch.after->>'part_type_label',
    'vehicle', coalesce(ch.after->>'vehicle_label', ch.after->>'vehicle'),
    'position', coalesce(ch.after->>'position', ch.after->>'side', '—')
  ) ORDER BY ch.line_no), '[]'::jsonb)
  INTO v_parts
  FROM public.part_import_change ch
  WHERE ch.batch_id = p_batch_id AND ch.table_name = 'part_master' AND ch.op = 'insert';

  WITH fit_rows AS (
    SELECT
      ch.line_no,
      coalesce(ch.after->>'vehicle_label', ch.after->>'make' || ' ' || ch.after->>'model') AS vehicle,
      coalesce(ch.after->>'position', ch.after->>'side', '—') AS pos
    FROM public.part_import_change ch
    WHERE ch.batch_id = p_batch_id AND ch.table_name = 'part_listing' AND ch.op IN ('insert', 'update')
  ),
  grouped AS (
    SELECT vehicle, pos, count(*)::int AS cnt
    FROM fit_rows
    GROUP BY vehicle, pos
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'vehicle', g.vehicle,
    'positions', g.pos,
    'count', g.cnt
  ) ORDER BY g.vehicle, g.pos), '[]'::jsonb)
  INTO v_fits
  FROM grouped g;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'line_no', ch.line_no,
    'brand', coalesce(ch.before->>'brand', ch.after->>'brand'),
    'part_number', coalesce(ch.before->>'part_number', ch.after->>'part_number'),
    'code', coalesce(ch.after->>'exclude_code', 'EXCLUDED'),
    'message', coalesce(ch.after->>'exclude_message', 'Excluded')
  ) ORDER BY ch.line_no), '[]'::jsonb)
  INTO v_left_out
  FROM public.part_import_change ch
  WHERE ch.batch_id = p_batch_id AND ch.table_name = 'part_master' AND ch.op = 'insert'
    AND coalesce(ch.after->>'excluded', 'false') = 'true';

  IF v_left_out IS NULL OR v_left_out = '[]'::jsonb THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'line_no', r.line_no,
      'brand', r.raw->>'brand',
      'part_number', r.raw->>'part_number',
      'code', (r.issues->0->>'code'),
      'message', coalesce(r.issues->0->>'message', 'Excluded')
    ) ORDER BY r.line_no), '[]'::jsonb)
    INTO v_left_out
    FROM public.part_import_row r
    WHERE r.batch_id = p_batch_id AND r.status IN ('error', 'duplicate');
  END IF;

  RETURN jsonb_build_object('parts', coalesce(v_parts, '[]'::jsonb), 'fits', coalesce(v_fits, '[]'::jsonb), 'leftOut', coalesce(v_left_out, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_batch_summary(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.part_import_batch%ROWTYPE;
  v_status jsonb;
  v_issues jsonb;
  v_actions jsonb;
  v_accepted int;
  v_importable int;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
  INTO v_status
  FROM (
    SELECT status, count(*)::int AS cnt
    FROM public.part_import_row
    WHERE batch_id = p_batch_id
    GROUP BY status
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_issues
  FROM (
    SELECT elem->>'code' AS code, count(*)::int AS cnt
    FROM public.part_import_row r,
      LATERAL jsonb_array_elements(r.issues) elem
    WHERE r.batch_id = p_batch_id AND elem->>'code' IS NOT NULL
    GROUP BY elem->>'code'
  ) i;

  SELECT jsonb_build_object(
    'create_part', count(*) FILTER (WHERE action = 'create_part'),
    'update_part', count(*) FILTER (WHERE action = 'update_part'),
    'add_fit', count(*) FILTER (WHERE action = 'add_fit'),
    'update_fit', count(*) FILTER (WHERE action = 'update_fit'),
    'unchanged', count(*) FILTER (WHERE action = 'unchanged')
  )
  INTO v_actions
  FROM public.part_import_row
  WHERE batch_id = p_batch_id;

  SELECT count(*)::int, count(*) FILTER (WHERE accepted IS TRUE AND status IN ('valid', 'labelled') AND coalesce(action, 'skip') <> 'skip')::int
  INTO v_accepted, v_importable
  FROM public.part_import_row
  WHERE batch_id = p_batch_id;

  RETURN jsonb_build_object(
    'batchId', p_batch_id,
    'status', v_batch.status,
    'checkedAt', v_batch.checked_at,
    'engineVersion', public.part_import_engine_version(),
    'templateVersion', v_batch.template_version,
    'statusCounts', v_status,
    'issueCounts', v_issues,
    'actions', v_actions,
    'rowsTotal', v_batch.rows_total,
    'rowsAccepted', v_accepted,
    'importableCount', v_importable,
    'rowsError', v_batch.rows_error,
    'rowsDuplicate', v_batch.rows_duplicate,
    'rowsUnchanged', v_batch.rows_unchanged
  );
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_batch_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_batch_summary(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_list_rows(
  p_batch_id uuid,
  p_status text DEFAULT NULL,
  p_issue_code text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_rows jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_off int := greatest(coalesce(p_offset, 0), 0);
BEGIN
  SELECT count(*)::int INTO v_total
  FROM public.part_import_row r
  WHERE r.batch_id = p_batch_id
    AND (p_status IS NULL OR p_status = '' OR r.status = p_status)
    AND (
      p_issue_code IS NULL OR p_issue_code = ''
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(r.issues) elem
        WHERE elem->>'code' = p_issue_code
      )
    )
    AND (
      p_q IS NULL OR p_q = ''
      OR lower(
        coalesce(r.raw->>'vehicle', '') || ' ' ||
        coalesce(r.raw->>'part_number', '') || ' ' ||
        coalesce(r.raw->>'brand', '') || ' ' ||
        coalesce(r.raw->>'part_type', '') || ' ' ||
        coalesce(r.raw->>'part_name', '')
      ) LIKE '%' || lower(trim(p_q)) || '%'
    );

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.line_no), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT r.*
    FROM public.part_import_row r
    WHERE r.batch_id = p_batch_id
      AND (p_status IS NULL OR p_status = '' OR r.status = p_status)
      AND (
        p_issue_code IS NULL OR p_issue_code = ''
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(r.issues) elem
          WHERE elem->>'code' = p_issue_code
        )
      )
      AND (
        p_q IS NULL OR p_q = ''
        OR lower(
          coalesce(r.raw->>'vehicle', '') || ' ' ||
          coalesce(r.raw->>'part_number', '') || ' ' ||
          coalesce(r.raw->>'brand', '') || ' ' ||
          coalesce(r.raw->>'part_type', '') || ' ' ||
          coalesce(r.raw->>'part_name', '')
        ) LIKE '%' || lower(trim(p_q)) || '%'
      )
    ORDER BY r.line_no
    OFFSET v_off LIMIT v_lim
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', coalesce(v_rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_list_rows(uuid, text, text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_list_rows(uuid, text, text, text, int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_row_inspect(p_batch_id uuid, p_line_no int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.part_import_row%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.part_import_row
  WHERE batch_id = p_batch_id AND line_no = p_line_no;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'lineNo', v_row.line_no,
    'status', v_row.status,
    'action', v_row.action,
    'issues', v_row.issues,
    'raw', v_row.raw,
    'normalized', v_row.normalized,
    'schemaValidation', jsonb_build_object(
      'passed', v_row.status IN ('valid', 'labelled', 'unchanged'),
      'issues', v_row.issues
    ),
    'fitmentAttributes', coalesce(v_row.normalized->'specs', v_row.normalized, '{}'::jsonb),
    'crossReferences', coalesce(v_row.normalized->'vehicle_candidates', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_row_inspect(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_row_inspect(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_set_rows_accepted(
  p_batch_id uuid,
  p_accepted boolean,
  p_only_importable boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.part_import_row r
  SET accepted = p_accepted
  WHERE r.batch_id = p_batch_id
    AND (
      NOT p_only_importable
      OR (r.status IN ('valid', 'labelled') AND coalesce(r.action, 'skip') <> 'skip')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_set_rows_accepted(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_set_rows_accepted(uuid, boolean, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_ledger_integrity_ratio()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH imported AS (
    SELECT b.id, b.parts_created + b.fits_created + b.parts_updated + b.fits_updated AS expected,
      (SELECT count(*) FROM public.part_import_change c WHERE c.batch_id = b.id) AS changes
    FROM public.part_import_batch b
    WHERE b.status = 'imported'
  )
  SELECT CASE
    WHEN count(*) = 0 THEN NULL
    ELSE round(
      (count(*) FILTER (WHERE expected > 0 AND changes >= expected))::numeric / nullif(count(*), 0),
      4
    )
  END
  FROM imported;
$$;

REVOKE ALL ON FUNCTION public.part_import_ledger_integrity_ratio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_ledger_integrity_ratio() TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_compute_ledger_hash(p_batch_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(
    digest(
      coalesce(
        (
          SELECT string_agg(
            c.id::text || c.op || c.table_name || coalesce(c.after::text, ''),
            '|' ORDER BY c.id
          )
          FROM public.part_import_change c
          WHERE c.batch_id = p_batch_id
        ),
        ''
      ),
      'sha256'::text
    ),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION public.part_import_compute_ledger_hash(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_compute_ledger_hash(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_finalize_promote_meta(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_rows_imported int;
BEGIN
  v_hash := public.part_import_compute_ledger_hash(p_batch_id);
  SELECT count(*)::int INTO v_rows_imported
  FROM public.part_import_row r
  WHERE r.batch_id = p_batch_id
    AND r.status IN ('valid', 'labelled')
    AND coalesce(r.action, 'skip') <> 'skip';

  UPDATE public.part_import_batch
  SET ledger_hash = v_hash
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ledgerHash', v_hash, 'rowsImported', v_rows_imported);
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_finalize_promote_meta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_finalize_promote_meta(uuid) TO service_role;
