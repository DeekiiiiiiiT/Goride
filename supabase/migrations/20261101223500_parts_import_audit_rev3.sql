-- Parts import by area audit Rev 3 (PI-02 .. PI-06, PI-08 partial)

-- ---------------------------------------------------------------------------
-- admin_access_requests (PI-08 request access)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_type text NOT NULL,
  permission text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_access_requests_no_direct ON public.admin_access_requests;
CREATE POLICY admin_access_requests_no_direct ON public.admin_access_requests
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.admin_access_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_access_requests TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.part_import_number_shape_unusual(p_brand text, p_number_norm text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_norm text := upper(coalesce(p_number_norm, ''));
  v_brand text := lower(coalesce(p_brand, ''));
BEGIN
  IF v_norm = '' THEN
    RETURN true;
  END IF;
  IF v_brand LIKE '%toyota%' OR v_brand LIKE '%daihatsu%' THEN
    RETURN NOT (v_norm ~ '^\d{5}[A-Z0-9]{5}$');
  END IF;
  IF v_brand LIKE '%honda%' THEN
    RETURN NOT (v_norm ~ '^\d{11}$');
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_strip_brand(p_brand text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(regexp_replace(
    regexp_replace(coalesce(p_brand, ''), '\(\s*oem\s*\)', '', 'gi'),
    '\(\s*genuine\s*\)', '', 'gi'
  )));
$$;

CREATE OR REPLACE FUNCTION public.part_import_source_domain(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        coalesce(substring(btrim(p_url) from '^https?://([^/?#]+)'), ''),
        '^www\.',
        ''
      ),
      ':\d+$',
      ''
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.part_import_area_fit_scope(p_area_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(sys.op_code, '') IN ('ENG', 'TRN', 'BELT') THEN 'powertrain'
    ELSE 'body'
  END
  FROM public.maintenance_service_categories sys
  WHERE sys.id = p_area_id;
$$;

CREATE OR REPLACE FUNCTION public.part_import_row_specs(p_area_id uuid, p_raw jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'spec', nullif(btrim(coalesce(p_raw->>'spec', '')), ''),
    'engine_code', nullif(btrim(coalesce(p_raw->>'engine_code', '')), ''),
    'size', nullif(btrim(coalesce(p_raw->>'size', '')), ''),
    'load_speed', nullif(btrim(coalesce(p_raw->>'load_speed', '')), ''),
    'rib_profile', nullif(btrim(coalesce(p_raw->>'rib_profile', '')), ''),
    'bulb_code', nullif(btrim(coalesce(p_raw->>'bulb_code', '')), ''),
    'length_mm', nullif(btrim(coalesce(p_raw->>'length_mm', '')), ''),
    'group_size', nullif(btrim(coalesce(p_raw->>'group_size', '')), '')
  ));
$$;

CREATE OR REPLACE FUNCTION public.part_import_raw_has_fleet_data(p_raw jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key text;
  v_val text;
BEGIN
  IF p_raw IS NULL THEN
    RETURN false;
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_raw)
  LOOP
    IF v_key IN ('vehicle', 'note') THEN
      CONTINUE;
    END IF;
    IF v_val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN true;
    END IF;
    IF upper(regexp_replace(v_val, '[^A-Z0-9]', '', 'g')) ~ '^[0-9]{4}[A-Z]{2,3}$' THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_snapshot_comparable(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p, '{}'::jsonb)
    - 'updated_at'
    - 'verified_at'
    - 'created_at'
    - 'id';
$$;

CREATE OR REPLACE FUNCTION public.part_import_undo_row_reason(
  p_table text,
  p_row_id uuid,
  p_batch_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_part uuid;
BEGIN
  IF p_table = 'part_master' THEN
    v_part := p_row_id;
  ELSIF p_table = 'part_listing' THEN
    SELECT pm.id INTO v_part
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    WHERE pl.id = p_row_id
    LIMIT 1;
  END IF;

  IF v_part IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = v_part
  ) THEN
    RETURN 'used in a service log';
  END IF;

  IF p_table = 'part_master' THEN
    SELECT b.code INTO v_code
    FROM public.part_master pm
    JOIN public.part_import_batch b ON b.id = pm.import_batch_id
    WHERE pm.id = p_row_id
      AND pm.import_batch_id IS NOT NULL
      AND pm.import_batch_id IS DISTINCT FROM p_batch_id
    LIMIT 1;
  ELSIF p_table = 'part_listing' THEN
    SELECT b.code INTO v_code
    FROM public.part_listing pl
    JOIN public.part_import_batch b ON b.id = pl.import_batch_id
    WHERE pl.id = p_row_id
      AND pl.import_batch_id IS NOT NULL
      AND pl.import_batch_id IS DISTINCT FROM p_batch_id
    LIMIT 1;
  ELSIF p_table = 'part_interchange_group' THEN
    SELECT b.code INTO v_code
    FROM public.part_interchange_group g
    JOIN public.part_import_batch b ON b.id = g.import_batch_id
    WHERE g.id = p_row_id
      AND g.import_batch_id IS NOT NULL
      AND g.import_batch_id IS DISTINCT FROM p_batch_id
    LIMIT 1;
  END IF;
  IF v_code IS NOT NULL THEN
    RETURN 'changed by import ' || v_code;
  END IF;

  IF p_table = 'part_master' AND EXISTS (
    SELECT 1 FROM public.catalog_part_proposal p
    WHERE p.promoted_part_id = p_row_id
  ) THEN
    RETURN 'changed by Research';
  END IF;

  RETURN 'edited by manual catalog override';
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_undo_preflight(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c record;
  v_current jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_reason text;
  v_ok boolean := true;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.part_import_batch b
    WHERE b.id = p_batch_id AND b.status = 'imported'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reasons', jsonb_build_array(
      jsonb_build_object('line', NULL, 'reason', 'Batch is not imported')
    ));
  END IF;

  FOR c IN
    SELECT * FROM public.part_import_change
    WHERE batch_id = p_batch_id
    ORDER BY line_no NULLS LAST, id
  LOOP
    v_current := public.part_import_row_snapshot(c.table_name, c.row_id);
    IF v_current IS NULL THEN
      v_ok := false;
      v_reason := public.part_import_undo_row_reason(c.table_name, c.row_id, p_batch_id);
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('line', c.line_no, 'reason', v_reason));
    ELSIF public.part_import_snapshot_comparable(v_current)
      IS DISTINCT FROM public.part_import_snapshot_comparable(c.after) THEN
      v_ok := false;
      v_reason := public.part_import_undo_row_reason(c.table_name, c.row_id, p_batch_id);
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('line', c.line_no, 'reason', v_reason));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', v_ok, 'reasons', v_reasons);
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_area_spec_issues(
  p_area_id uuid,
  p_part_type_id uuid,
  p_raw jsonb,
  p_match_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_op text;
  v_pt_op text;
  v_pt_name text;
  v_issues jsonb := '[]'::jsonb;
  v_spec text := btrim(coalesce(p_raw->>'spec', ''));
  v_pos text := btrim(coalesce(p_raw->>'position', ''));
  v_engine text := btrim(coalesce(p_raw->>'engine_code', ''));
  v_size text := btrim(coalesce(p_raw->>'size', ''));
  v_bulb text := btrim(coalesce(p_raw->>'bulb_code', ''));
  v_len text := btrim(coalesce(p_raw->>'length_mm', ''));
  v_group text := btrim(coalesce(p_raw->>'group_size', ''));
BEGIN
  SELECT op_code INTO v_op FROM public.maintenance_service_categories WHERE id = p_area_id;
  SELECT upper(coalesce(op_code, '')), lower(coalesce(plain_name, name, ''))
  INTO v_pt_op, v_pt_name
  FROM public.maintenance_service_categories
  WHERE id = p_part_type_id;

  IF v_op = 'BRK' THEN
    IF v_pt_op LIKE '%FLUID%' OR v_pt_name LIKE '%fluid%' THEN
      IF v_spec = '' OR upper(v_spec) !~ 'DOT\s*(3|4|5\.1)' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'spec', 'message', 'Brake fluid needs DOT 3/4/5.1 in spec', 'severity', 'error'));
      END IF;
    ELSIF v_pt_op LIKE '%PAD%' OR v_pt_op LIKE '%SHOE%' OR v_pt_op LIKE '%ROTOR%'
      OR v_pt_name LIKE '%pad%' OR v_pt_name LIKE '%shoe%' OR v_pt_name LIKE '%rotor%' THEN
      IF v_pos = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'position', 'message', 'Brake pads/shoes/rotors need position', 'severity', 'error'));
      END IF;
    END IF;
  ELSIF v_op = 'ENG' THEN
    IF p_match_type = 'engine' OR v_engine <> '' THEN
      IF v_engine = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'engine_code', 'message', 'Engine parts need engine_code', 'severity', 'error'));
      END IF;
    END IF;
  ELSIF v_op = 'TIRE' THEN
    IF v_size <> '' AND v_size !~ '^\d{3}/\d{2}R\d{2}$' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'size', 'message', 'Tire size must match ###/##R##', 'severity', 'error'));
    ELSIF v_size = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'size', 'message', 'Tires need size', 'severity', 'error'));
    END IF;
  ELSIF v_op IN ('FLD', 'TRN') THEN
    IF v_spec = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'spec', 'message', 'Spec column required for this area', 'severity', 'error'));
    END IF;
  ELSIF v_op = 'LGT' THEN
    IF v_pt_name LIKE '%bulb%' OR v_pt_name LIKE '%lamp%' THEN
      IF v_bulb = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'bulb_code', 'message', 'Bulbs need bulb_code', 'severity', 'error'));
      END IF;
    ELSIF v_pt_name LIKE '%wiper%' THEN
      IF v_len = '' OR v_pos = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_SPEC_MISSING', 'column', 'length_mm', 'message', 'Wipers need length_mm and position', 'severity', 'error'));
      END IF;
    END IF;
  ELSIF v_op = 'ELEC' THEN
    IF v_pt_name LIKE '%battery%' AND v_group = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'AREA_SPEC_MISSING', 'column', 'group_size', 'message', 'Battery needs group_size', 'severity', 'error'));
    END IF;
  END IF;

  RETURN v_issues;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_validate_postprocess(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH d AS (
    SELECT
      r.line_no,
      row_number() OVER (
        PARTITION BY
          upper(btrim(coalesce(r.raw->>'brand', r.raw->>'manufacturer', ''))),
          public.part_import_norm_number(coalesce(r.raw->>'part_number', '')),
          r.vehicle_catalog_id,
          coalesce(nullif(btrim(r.raw->>'position', ''), ''), ''),
          coalesce(nullif(btrim(r.raw->>'side', ''), ''), '')
        ORDER BY r.line_no
      ) AS rn
    FROM public.part_import_row r
    WHERE r.batch_id = p_batch_id
  )
  UPDATE public.part_import_row r
  SET
    status = 'duplicate',
    action = 'skip',
    issues = CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(r.issues, '[]'::jsonb)) elem
        WHERE elem->>'code' = 'DUPLICATE'
      ) THEN r.issues
      ELSE coalesce(r.issues, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code', 'DUPLICATE', 'column', 'part_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'))
    END
  FROM d
  WHERE r.batch_id = p_batch_id
    AND r.line_no = d.line_no
    AND d.rn > 1
    AND r.status IS DISTINCT FROM 'duplicate';

  WITH first_lines AS (
    SELECT
      r.line_no,
      min(r.line_no) OVER (
        PARTITION BY
          upper(btrim(coalesce(r.raw->>'brand', r.raw->>'manufacturer', ''))),
          public.part_import_norm_number(coalesce(r.raw->>'part_number', ''))
      ) AS first_line
    FROM public.part_import_row r
    WHERE r.batch_id = p_batch_id
      AND r.status NOT IN ('duplicate', 'error')
  )
  UPDATE public.part_import_row r
  SET
    action = CASE WHEN r.line_no = fl.first_line THEN r.action ELSE 'add_fit' END,
    existing_line_no = CASE WHEN r.line_no = fl.first_line THEN NULL ELSE fl.first_line END
  FROM first_lines fl
  WHERE r.batch_id = p_batch_id
    AND r.line_no = fl.line_no
    AND r.status NOT IN ('duplicate', 'error', 'unchanged')
    AND r.action IN ('create_part', 'add_fit', 'update_part');
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_validate_rows(
  p_batch_id uuid,
  p_only_line int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area uuid;
  v_area_name text;
  v_allowed uuid[];
  r record;
  v_vehicle uuid;
  v_candidates jsonb;
  v_part_type uuid;
  v_part_parent uuid;
  v_brand text;
  v_number text;
  v_number_norm text;
  v_match_type text;
  v_existing uuid;
  v_confirmed boolean;
  v_replaces uuid;
  v_issues jsonb;
  v_status text;
  v_action text;
  v_yf int;
  v_yt int;
  v_yf_txt text;
  v_yt_txt text;
  v_src text;
  v_domain text;
  v_pos text;
  v_listing uuid;
  v_live_name text;
  v_live_kind text;
  v_live_url text;
  v_prod_start int;
  v_prod_end int;
BEGIN
  SELECT b.area_id, coalesce(sys.plain_name, sys.name)
  INTO v_area, v_area_name
  FROM public.part_import_batch b
  JOIN public.maintenance_service_categories sys ON sys.id = b.area_id
  WHERE b.id = p_batch_id
  FOR UPDATE;

  IF v_area IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  SELECT allowed_part_type_ids INTO v_allowed
  FROM public.part_import_template
  WHERE area_id = v_area AND active IS TRUE
  ORDER BY version DESC
  LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND (p_only_line IS NULL OR line_no = p_only_line)
    ORDER BY line_no
  LOOP
    v_issues := '[]'::jsonb;
    v_status := 'valid';
    v_action := 'create_part';
    v_vehicle := r.vehicle_catalog_id;
    v_part_type := NULL;
    v_existing := NULL;
    v_replaces := NULL;
    v_brand := public.part_import_strip_brand(coalesce(r.raw->>'brand', r.raw->>'manufacturer', ''));
    v_number := btrim(coalesce(r.raw->>'part_number', ''));
    v_number_norm := public.part_import_norm_number(v_number);
    v_match_type := lower(btrim(coalesce(r.raw->>'match_type', r.raw->>'part_kind', 'oem')));
    IF v_match_type IN ('factory', 'genuine') THEN v_match_type := 'oem'; END IF;
    v_src := btrim(coalesce(r.raw->>'source_url', r.raw->>'evidence_url', ''));
    v_pos := btrim(coalesce(r.raw->>'position', ''));
    v_yf_txt := btrim(coalesce(r.raw->>'year_from', ''));
    v_yt_txt := btrim(coalesce(r.raw->>'year_to', ''));
    v_yf := CASE WHEN v_yf_txt ~ '^\d{4}$' THEN v_yf_txt::int ELSE NULL END;
    v_yt := CASE WHEN v_yt_txt ~ '^\d{4}$' THEN v_yt_txt::int ELSE NULL END;

    IF public.part_import_raw_has_fleet_data(r.raw) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'FLEET_DATA_FORBIDDEN', 'column', 'raw', 'message', 'Fleet plate or org id in row', 'severity', 'error'));
    END IF;

    IF v_brand = '' OR v_number = '' OR v_src = '' OR btrim(coalesce(r.raw->>'vehicle', '')) = ''
       OR btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')) = '' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'PARAM_MISSING', 'column', 'required', 'message', 'Required cells missing', 'severity', 'error'));
    END IF;

    IF v_match_type NOT IN ('oem', 'sister', 'engine', 'aftermarket', 'universal') THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'MATCH_TYPE_INVALID', 'column', 'match_type', 'message', 'Match type not allowed', 'severity', 'error'));
    END IF;

    IF v_src <> '' AND v_src !~* '^https://' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'SOURCE_INVALID', 'column', 'source_url', 'message', 'Source must be https', 'severity', 'error'));
    END IF;

    v_candidates := coalesce(r.normalized->'vehicle_candidates', '[]'::jsonb);
    IF v_vehicle IS NULL THEN
      IF jsonb_array_length(v_candidates) = 0 THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
      ELSIF jsonb_array_length(v_candidates) > 1 THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DISAMBIGUATION_REQ', 'column', 'vehicle',
          'message', 'Pick one car version from candidates', 'severity', 'error'));
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog vc WHERE vc.id = v_vehicle) THEN
      v_vehicle := NULL;
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
    END IF;

    IF (v_yf_txt <> '' AND v_yf IS NULL) OR (v_yt_txt <> '' AND v_yt IS NULL)
       OR (v_yf IS NOT NULL AND v_yt IS NOT NULL AND v_yf > v_yt) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'YEAR_RANGE_INVALID', 'column', 'year_from', 'message', 'Invalid year range', 'severity', 'error'));
    END IF;

    IF v_vehicle IS NOT NULL AND (v_yf IS NOT NULL OR v_yt IS NOT NULL) THEN
      SELECT vc.production_start_year, coalesce(vc.production_end_year, vc.production_start_year)
      INTO v_prod_start, v_prod_end
      FROM public.vehicle_catalog vc WHERE vc.id = v_vehicle;
      IF v_yf IS NOT NULL AND v_prod_start IS NOT NULL AND v_yf < v_prod_start THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'YEAR_OUTSIDE_PRODUCTION', 'column', 'year_from', 'message', 'Year before production', 'severity', 'label'));
      END IF;
      IF v_yt IS NOT NULL AND v_prod_end IS NOT NULL AND v_yt > v_prod_end THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'YEAR_OUTSIDE_PRODUCTION', 'column', 'year_to', 'message', 'Year after production', 'severity', 'label'));
      END IF;
    END IF;

    SELECT c.id, c.parent_id INTO v_part_type, v_part_parent
    FROM public.maintenance_service_categories c
    WHERE c.parent_id = v_area
      AND c.is_part IS TRUE
      AND (
        upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
        OR lower(coalesce(c.plain_name, c.name)) = lower(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
      )
    LIMIT 1;

    IF v_part_type IS NULL THEN
      SELECT c.id, c.parent_id INTO v_part_type, v_part_parent
      FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE
        AND (
          upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
          OR lower(coalesce(c.plain_name, c.name)) = lower(btrim(coalesce(r.raw->>'part_type', r.raw->>'job', '')))
        )
      LIMIT 1;
      IF v_part_type IS NOT NULL AND v_part_parent IS DISTINCT FROM v_area THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
      ELSIF v_part_type IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
      END IF;
    ELSIF v_allowed IS NOT NULL AND NOT (v_part_type = ANY (v_allowed)) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not in this area', 'severity', 'error'));
    END IF;

    IF v_part_type IS NOT NULL AND coalesce((
      SELECT c.position_aware FROM public.maintenance_service_categories c WHERE c.id = v_part_type
    ), false) THEN
      IF v_pos = '' OR upper(v_pos) NOT IN (
        'FRONT', 'REAR', 'FRONT LEFT', 'FRONT RIGHT', 'REAR LEFT', 'REAR RIGHT', 'FL', 'FR', 'RL', 'RR'
      ) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'PARAM_MISSING', 'column', 'position', 'message', 'Position required for this part type', 'severity', 'error'));
      END IF;
    END IF;

    IF v_part_type IS NOT NULL THEN
      v_issues := v_issues || public.part_import_area_spec_issues(v_area, v_part_type, r.raw, v_match_type);
    END IF;

    IF v_brand <> '' AND NOT EXISTS (
      SELECT 1 FROM public.part_master pm
      WHERE upper(coalesce(pm.manufacturer, '')) = v_brand
    ) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'BRAND_NEW', 'column', 'brand', 'message', 'Brand not seen in catalog before', 'severity', 'label'));
    END IF;

    IF public.part_import_number_shape_unusual(v_brand, v_number_norm) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'NUMBER_SHAPE_UNUSUAL', 'column', 'part_number', 'message', 'Unusual OEM number shape', 'severity', 'label'));
    END IF;

    IF v_src <> '' THEN
      v_domain := public.part_import_source_domain(v_src);
      IF v_domain <> '' AND NOT EXISTS (
        SELECT 1 FROM public.catalog_trusted_source ts
        WHERE ts.domain = v_domain AND ts.active IS TRUE
      ) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'SOURCE_UNTRUSTED', 'column', 'source_url', 'message', 'Source domain not on trusted list', 'severity', 'label'));
      END IF;
    END IF;

    IF btrim(coalesce(r.raw->>'replaces_oem_number', '')) <> '' THEN
      SELECT pm.id INTO v_replaces
      FROM public.part_master pm
      WHERE pm.oem_part_number_norm = public.part_import_norm_number(r.raw->>'replaces_oem_number')
        AND upper(coalesce(pm.manufacturer, '')) = v_brand
      LIMIT 1;
      IF v_replaces IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'OEM_NOT_ON_FILE', 'column', 'replaces_oem_number', 'message', 'Replaced OEM not in catalog', 'severity', 'label'));
      END IF;
    END IF;

    SELECT pm.id, (pm.catalog_decision = 'confirmed'), pm.name, pm.part_kind, pm.evidence_url
    INTO v_existing, v_confirmed, v_live_name, v_live_kind, v_live_url
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = v_brand
      AND pm.oem_part_number_norm = v_number_norm
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.part_master pm
        JOIN public.maintenance_service_categories comp ON comp.id = pm.maintenance_component_id
        WHERE pm.id = v_existing AND comp.parent_id IS NOT NULL AND comp.parent_id <> v_area
      ) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'AREA_CONFLICT', 'column', 'part_number', 'message', 'Part already filed under another area', 'severity', 'error'));
      END IF;
    END IF;

    IF v_existing IS NOT NULL AND v_confirmed THEN
      v_action := 'add_fit';
      IF coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), v_number) IS DISTINCT FROM v_live_name
         OR v_match_type IS DISTINCT FROM v_live_kind
         OR v_src IS DISTINCT FROM coalesce(v_live_url, '') THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DIFFERS_FROM_CONFIRMED', 'column', 'part_name', 'message', 'Differs from confirmed part — fit only', 'severity', 'label'));
      END IF;
    ELSIF v_existing IS NOT NULL THEN
      v_action := 'update_part';
    ELSE
      v_action := 'create_part';
    END IF;

    IF v_existing IS NOT NULL AND v_vehicle IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'error'
    ) THEN
      SELECT pl.id INTO v_listing
      FROM public.part_master pm
      JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
      WHERE pm.id = v_existing
        AND pl.vehicle_catalog_id = v_vehicle
        AND coalesce(pl.position, '') = coalesce(nullif(v_pos, ''), '')
        AND coalesce(pl.side, '') = coalesce(nullif(btrim(r.raw->>'side', ''), ''), '');

      IF v_listing IS NOT NULL
         AND coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), v_number) IS NOT DISTINCT FROM v_live_name
         AND v_match_type IS NOT DISTINCT FROM v_live_kind
         AND v_src IS NOT DISTINCT FROM coalesce(v_live_url, '')
         AND (v_yf IS NOT DISTINCT FROM (SELECT pl2.year_from FROM public.part_listing pl2 WHERE pl2.id = v_listing))
         AND (v_yt IS NOT DISTINCT FROM (SELECT pl2.year_to FROM public.part_listing pl2 WHERE pl2.id = v_listing)) THEN
        v_status := 'unchanged';
        v_action := 'unchanged';
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'UNCHANGED', 'column', 'part_number', 'message', 'Matches catalog', 'severity', 'unchanged'));
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'error'
    ) THEN
      v_status := 'error';
      v_action := 'skip';
    ELSIF v_status = 'unchanged' THEN
      NULL;
    ELSIF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elem WHERE elem->>'severity' = 'label'
    ) THEN
      v_status := 'labelled';
    END IF;

    UPDATE public.part_import_row
    SET normalized = coalesce(r.normalized, '{}'::jsonb) || jsonb_build_object(
          'brand', v_brand,
          'number', v_number,
          'number_norm', v_number_norm,
          'match_type', v_match_type,
          'year_from', v_yf,
          'year_to', v_yt,
          'source_url', v_src,
          'specs', public.part_import_row_specs(v_area, r.raw)
        ),
        vehicle_catalog_id = v_vehicle,
        part_type_id = v_part_type,
        existing_part_id = v_existing,
        replaces_part_id = v_replaces,
        existing_line_no = NULL,
        issues = v_issues,
        status = v_status,
        action = v_action
    WHERE batch_id = p_batch_id AND line_no = r.line_no;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_refresh_batch_counts(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid int;
  v_label int;
  v_err int;
  v_dup int;
  v_unch int;
BEGIN
  SELECT
    count(*) FILTER (WHERE status = 'valid'),
    count(*) FILTER (WHERE status = 'labelled'),
    count(*) FILTER (WHERE status = 'error'),
    count(*) FILTER (WHERE status = 'duplicate'),
    count(*) FILTER (WHERE status = 'unchanged')
  INTO v_valid, v_label, v_err, v_dup, v_unch
  FROM public.part_import_row
  WHERE batch_id = p_batch_id;

  UPDATE public.part_import_batch
  SET status = 'checked',
      checked_at = now(),
      rows_valid = v_valid,
      rows_labelled = v_label,
      rows_error = v_err,
      rows_duplicate = v_dup,
      rows_unchanged = v_unch,
      rows_checked = rows_total
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'valid', v_valid,
    'labelled', v_label,
    'error', v_err,
    'duplicate', v_dup,
    'unchanged', v_unch
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_validate(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  PERFORM public.part_import_validate_rows(p_batch_id, NULL);
  PERFORM public.part_import_validate_postprocess(p_batch_id);
  PERFORM public.part_import_route_review_rows(p_batch_id);
  v_stats := public.part_import_refresh_batch_counts(p_batch_id);
  RETURN v_stats;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_revalidate_line(p_batch_id uuid, p_line_no int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.part_import_row WHERE batch_id = p_batch_id AND line_no = p_line_no
  ) THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  PERFORM public.part_import_validate_rows(p_batch_id, p_line_no);
  PERFORM public.part_import_validate_postprocess(p_batch_id);

  SELECT to_jsonb(r.*) INTO v_row
  FROM public.part_import_row r
  WHERE r.batch_id = p_batch_id AND r.line_no = p_line_no;

  PERFORM public.part_import_refresh_batch_counts(p_batch_id);

  RETURN jsonb_build_object('row', v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_route_review_rows(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  r record;
  v_target uuid;
  v_target_name text;
  v_review uuid;
  v_code text;
  v_routed int := 0;
  v_pt_name text;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id;
  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  IF v_batch.source_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object('routed', 0);
  END IF;

  FOR r IN
    SELECT pr.*
    FROM public.part_import_row pr
    WHERE pr.batch_id = p_batch_id
      AND pr.part_type_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(pr.issues) elem
        WHERE elem->>'code' = 'DOMAIN_MISMATCH'
      )
  LOOP
    SELECT c.parent_id, coalesce(c.plain_name, c.name)
    INTO v_target, v_pt_name
    FROM public.maintenance_service_categories c
    WHERE c.id = r.part_type_id;

    IF v_target IS NULL OR v_target = v_batch.area_id THEN
      CONTINUE;
    END IF;

    SELECT coalesce(plain_name, name) INTO v_target_name
    FROM public.maintenance_service_categories WHERE id = v_target;

    SELECT id INTO v_review
    FROM public.part_import_batch
    WHERE source_batch_id = p_batch_id
      AND area_id = v_target
      AND status = 'checked'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_review IS NULL THEN
      v_code := public.part_import_next_code(v_target);
      INSERT INTO public.part_import_batch (
        code, area_id, source_batch_id, template_version, status, rows_total, rows_checked
      )
      VALUES (v_code, v_target, p_batch_id, 2, 'checked', 0, 0)
      RETURNING id INTO v_review;
    END IF;

    INSERT INTO public.part_import_row (batch_id, line_no, raw, vehicle_catalog_id, accepted)
    VALUES (v_review, r.line_no, r.raw, r.vehicle_catalog_id, true)
    ON CONFLICT (batch_id, line_no) DO UPDATE SET
      raw = EXCLUDED.raw,
      vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

    UPDATE public.part_import_batch
    SET rows_total = (SELECT count(*) FROM public.part_import_row WHERE batch_id = v_review)
    WHERE id = v_review;

    PERFORM public.part_import_validate_rows(v_review, r.line_no);
    PERFORM public.part_import_validate_postprocess(v_review);
    PERFORM public.part_import_refresh_batch_counts(v_review);

    UPDATE public.part_import_row pr
    SET issues = (
      SELECT coalesce(jsonb_agg(
        CASE WHEN elem->>'code' = 'DOMAIN_MISMATCH' THEN
          jsonb_set(
            elem,
            '{message}',
            to_jsonb(format(
              '%s is not a %s part. Routed to %s review bucket.',
              v_pt_name,
              coalesce((SELECT plain_name FROM public.maintenance_service_categories WHERE id = v_batch.area_id), 'this area'),
              v_target_name
            ))
          )
        ELSE elem END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(pr.issues) elem
    )
    WHERE pr.batch_id = p_batch_id AND pr.line_no = r.line_no;

    v_routed := v_routed + 1;
  END LOOP;

  RETURN jsonb_build_object('routed', v_routed);
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_promote(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_lock int;
  r record;
  v_group uuid;
  v_part uuid;
  v_listing uuid;
  v_category uuid;
  v_before jsonb;
  v_created_parts int := 0;
  v_updated_parts int := 0;
  v_created_fits int := 0;
  v_updated_fits int := 0;
  v_refresh text;
  v_fit_scope text;
  v_specs jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS part_import_batch_parts (
    line_no int PRIMARY KEY,
    part_id uuid NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE part_import_batch_parts;

  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'checked' THEN RAISE EXCEPTION 'Batch must be checked before import'; END IF;

  v_lock := hashtext('part_import:' || v_batch.area_id::text);
  IF NOT pg_try_advisory_xact_lock(v_lock) THEN
    RAISE EXCEPTION 'Already importing this area';
  END IF;

  v_fit_scope := coalesce(public.part_import_area_fit_scope(v_batch.area_id), 'body');

  UPDATE public.part_import_batch SET status = 'promoting' WHERE id = p_batch_id;

  SELECT pc.id INTO v_category FROM public.part_category pc WHERE pc.area_id = v_batch.area_id LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND accepted IS TRUE
      AND status IN ('valid', 'labelled')
      AND action IN ('create_part', 'update_part', 'add_fit')
    ORDER BY line_no
  LOOP
    v_group := NULL;
    v_part := r.existing_part_id;
    v_specs := coalesce(r.normalized->'specs', public.part_import_row_specs(v_batch.area_id, r.raw));

    IF r.action = 'add_fit' THEN
      SELECT bpp.part_id INTO v_part FROM part_import_batch_parts bpp WHERE bpp.line_no = r.existing_line_no;
      IF v_part IS NULL THEN
        v_part := r.existing_part_id;
      END IF;
    END IF;

    IF r.replaces_part_id IS NOT NULL AND r.action = 'create_part' THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = r.replaces_part_id;
    END IF;

    IF r.action = 'create_part' THEN
      IF v_group IS NULL THEN
        INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
        VALUES (
          'IMP-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          coalesce(r.raw->>'part_name', r.raw->>'part_number'),
          v_fit_scope,
          p_batch_id
        )
        RETURNING id INTO v_group;
      END IF;

      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, import_batch_id, evidence_url,
        catalog_decision, metadata, updated_at
      ) VALUES (
        v_category,
        coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), r.raw->>'part_number'),
        r.raw->>'part_number',
        coalesce(r.normalized->>'brand', r.raw->>'brand'),
        coalesce(r.normalized->>'match_type', 'oem'),
        v_group,
        r.part_type_id,
        p_batch_id,
        r.normalized->>'source_url',
        'pending',
        jsonb_build_object('import_labels', r.issues, 'specs', v_specs),
        now()
      )
      RETURNING id INTO v_part;

      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_interchange_group', v_group, 'insert', NULL,
        public.part_import_row_snapshot('part_interchange_group', v_group)
      );
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'insert', NULL,
        public.part_import_row_snapshot('part_master', v_part)
      );
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part);
      v_created_parts := v_created_parts + 1;
    ELSIF r.action = 'update_part' AND v_part IS NOT NULL THEN
      v_before := public.part_import_row_snapshot('part_master', v_part);
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      UPDATE public.part_master pm
      SET name = coalesce(nullif(btrim(r.raw->>'part_name', ''), ''), pm.name),
          evidence_url = coalesce(r.normalized->>'source_url', pm.evidence_url),
          maintenance_component_id = coalesce(r.part_type_id, pm.maintenance_component_id),
          part_kind = coalesce(r.normalized->>'match_type', pm.part_kind),
          metadata = coalesce(pm.metadata, '{}'::jsonb) || jsonb_build_object('specs', v_specs, 'import_labels', r.issues),
          catalog_decision = 'pending',
          updated_at = now()
      WHERE id = v_part AND pm.catalog_decision IS DISTINCT FROM 'confirmed';
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
      VALUES (
        p_batch_id, r.line_no, 'part_master', v_part, 'update', v_before,
        public.part_import_row_snapshot('part_master', v_part)
      );
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part)
      ON CONFLICT (line_no) DO UPDATE SET part_id = EXCLUDED.part_id;
      v_updated_parts := v_updated_parts + 1;
    ELSIF r.action = 'add_fit' AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
      INSERT INTO part_import_batch_parts (line_no, part_id) VALUES (r.line_no, v_part)
      ON CONFLICT (line_no) DO UPDATE SET part_id = EXCLUDED.part_id;
    END IF;

    IF v_group IS NULL AND v_part IS NOT NULL THEN
      SELECT interchange_group_id INTO v_group FROM public.part_master WHERE id = v_part;
    END IF;

    IF v_group IS NOT NULL AND r.vehicle_catalog_id IS NOT NULL THEN
      SELECT pl.id INTO v_listing
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group
        AND pl.vehicle_catalog_id = r.vehicle_catalog_id
        AND coalesce(pl.position, '') = coalesce(nullif(btrim(r.raw->>'position', ''), ''), '')
        AND coalesce(pl.side, '') = coalesce(nullif(btrim(r.raw->>'side', ''), ''), '');

      IF v_listing IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, evidence_url, import_batch_id
        ) VALUES (
          v_group,
          r.vehicle_catalog_id,
          nullif(btrim(r.raw->>'position', ''), ''),
          nullif(btrim(r.raw->>'side', ''), ''),
          (r.normalized->>'year_from')::int,
          (r.normalized->>'year_to')::int,
          r.normalized->>'source_url',
          p_batch_id
        )
        RETURNING id INTO v_listing;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (
          p_batch_id, r.line_no, 'part_listing', v_listing, 'insert', NULL,
          public.part_import_row_snapshot('part_listing', v_listing)
        );
        v_created_fits := v_created_fits + 1;
      ELSE
        v_before := public.part_import_row_snapshot('part_listing', v_listing);
        UPDATE public.part_listing pl
        SET year_from = (r.normalized->>'year_from')::int,
            year_to = (r.normalized->>'year_to')::int,
            evidence_url = r.normalized->>'source_url',
            side = coalesce(nullif(btrim(r.raw->>'side', ''), ''), pl.side)
        WHERE id = v_listing;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (
          p_batch_id, r.line_no, 'part_listing', v_listing, 'update', v_before,
          public.part_import_row_snapshot('part_listing', v_listing)
        );
        v_updated_fits := v_updated_fits + 1;
      END IF;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.refresh_variant_parts_readiness();
  EXCEPTION WHEN OTHERS THEN
    v_refresh := SQLERRM;
  END;

  UPDATE public.part_import_batch
  SET status = 'imported',
      promoted_at = now(),
      promoted_by = p_actor,
      parts_created = v_created_parts,
      parts_updated = v_updated_parts,
      fits_created = v_created_fits,
      fits_updated = v_updated_fits,
      refresh_warning = v_refresh
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'partsCreated', v_created_parts,
    'partsUpdated', v_updated_parts,
    'fitsCreated', v_created_fits,
    'fitsUpdated', v_updated_fits,
    'refreshWarning', v_refresh
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.part_import_undo(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  c record;
  v_pf jsonb;
  v_kept int := 0;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'imported' THEN RAISE EXCEPTION 'Only imported batches can be undone'; END IF;
  IF v_batch.promoted_at IS NULL OR v_batch.promoted_at < now() - interval '72 hours' THEN
    RAISE EXCEPTION 'Rollback window closed';
  END IF;

  v_pf := public.part_import_undo_preflight(p_batch_id);
  IF NOT coalesce((v_pf->>'ok')::boolean, false) THEN
    RETURN v_pf;
  END IF;

  FOR c IN
    SELECT * FROM public.part_import_change
    WHERE batch_id = p_batch_id
    ORDER BY id DESC
  LOOP
    IF c.op = 'insert' THEN
      IF c.table_name = 'part_listing' THEN
        DELETE FROM public.part_listing WHERE id = c.row_id;
      ELSIF c.table_name = 'part_master' THEN
        IF EXISTS (SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = c.row_id) THEN
          v_kept := v_kept + 1;
        ELSE
          DELETE FROM public.part_master WHERE id = c.row_id;
        END IF;
      ELSIF c.table_name = 'part_interchange_group' THEN
        DELETE FROM public.part_interchange_group g
        WHERE g.id = c.row_id
          AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id);
      END IF;
    ELSIF c.op = 'update' AND c.before IS NOT NULL THEN
      IF c.table_name = 'part_master' THEN
        UPDATE public.part_master pm SET
          category_id = (c.before->>'category_id')::uuid,
          name = c.before->>'name',
          evidence_url = c.before->>'evidence_url',
          part_kind = c.before->>'part_kind',
          catalog_decision = c.before->>'catalog_decision',
          maintenance_component_id = nullif(c.before->>'maintenance_component_id', '')::uuid,
          metadata = coalesce(c.before->'metadata', pm.metadata)
        WHERE id = c.row_id;
      ELSIF c.table_name = 'part_listing' THEN
        UPDATE public.part_listing pl SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          position = c.before->>'position',
          side = c.before->>'side'
        WHERE id = c.row_id;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.refresh_variant_parts_readiness();

  UPDATE public.part_import_batch
  SET status = 'undone', undone_at = now(), undone_by = p_actor
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'partsKept', v_kept);
END;
$$;

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
      AND b.promoted_at < now() - interval '24 hours'
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'part-import-staging-purge';
    PERFORM cron.schedule(
      'part-import-staging-purge',
      '0 * * * *',
      $cron$SELECT public.part_import_purge_staging()$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped part-import-staging-purge';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.part_import_ledger_by_area AS
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
LEFT JOIN LATERAL (
  SELECT public.part_import_undo_preflight(b.id) AS pf
) pf ON b.status = 'imported';

REVOKE ALL ON public.part_import_ledger_by_area FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.part_import_ledger_by_area TO service_role;

-- ---------------------------------------------------------------------------
-- Template v2 (PI-06)
-- ---------------------------------------------------------------------------

UPDATE public.part_import_template SET active = false WHERE version = 1;

WITH base_cols AS (
  SELECT jsonb_build_array(
    jsonb_build_object('name', 'vehicle', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'part_type', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'brand', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'part_number', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'part_name', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'match_type', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'year_from', 'required', false, 'type', 'integer'),
    jsonb_build_object('name', 'year_to', 'required', false, 'type', 'integer'),
    jsonb_build_object('name', 'source_url', 'required', true, 'type', 'url'),
    jsonb_build_object('name', 'replaces_oem_number', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'position', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'side', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'note', 'required', false, 'type', 'text')
  ) AS cols
)
INSERT INTO public.part_import_template (
  area_id, version, columns, allowed_part_type_ids, example_rows, help_lines, active
)
SELECT
  sys.id,
  2,
  bc.cols || CASE sys.op_code
    WHEN 'BRK' THEN jsonb_build_array(
      jsonb_build_object('name', 'spec', 'required', false, 'type', 'text'))
    WHEN 'ENG' THEN jsonb_build_array(
      jsonb_build_object('name', 'engine_code', 'required', false, 'type', 'text'))
    WHEN 'TIRE' THEN jsonb_build_array(
      jsonb_build_object('name', 'size', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'load_speed', 'required', false, 'type', 'text'))
    WHEN 'FLD' THEN jsonb_build_array(
      jsonb_build_object('name', 'spec', 'required', true, 'type', 'text'))
    WHEN 'TRN' THEN jsonb_build_array(
      jsonb_build_object('name', 'spec', 'required', true, 'type', 'text'))
    WHEN 'BELT' THEN jsonb_build_array(
      jsonb_build_object('name', 'rib_profile', 'required', false, 'type', 'text'))
    WHEN 'LGT' THEN jsonb_build_array(
      jsonb_build_object('name', 'bulb_code', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'length_mm', 'required', false, 'type', 'text'))
    WHEN 'ELEC' THEN jsonb_build_array(
      jsonb_build_object('name', 'group_size', 'required', false, 'type', 'text'))
    ELSE '[]'::jsonb
  END,
  coalesce(array_agg(child.id) FILTER (WHERE child.id IS NOT NULL), '{}'::uuid[]),
  jsonb_build_array(
    jsonb_build_object(
      'vehicle', 'Toyota Roomy M900A 2019',
      'part_type', coalesce(min(child.op_code) FILTER (WHERE child.is_part IS TRUE), 'PART'),
      'brand', 'Toyota',
      'part_number', '04465-02230',
      'part_name', 'Example part',
      'match_type', CASE WHEN sys.op_code = 'TIRE' THEN 'universal' ELSE 'oem' END,
      'source_url', 'https://partsouq.com/example',
      'note', 'EXAMPLE'
    ),
    jsonb_build_object(
      'vehicle', 'Toyota Roomy M900A 2019',
      'part_type', coalesce(min(child.op_code) FILTER (WHERE child.is_part IS TRUE), 'PART'),
      'brand', 'Toyota',
      'part_number', '04465-02231',
      'match_type', CASE WHEN sys.op_code = 'TIRE' THEN 'universal' ELSE 'oem' END,
      'source_url', 'https://partsouq.com/example-2',
      'note', 'EXAMPLE'
    ),
    jsonb_build_object(
      'vehicle', 'Toyota Roomy M900A 2019',
      'part_type', coalesce(min(child.op_code) FILTER (WHERE child.is_part IS TRUE), 'PART'),
      'brand', 'Toyota',
      'part_number', '04465-02232',
      'match_type', CASE WHEN sys.op_code = 'TIRE' THEN 'universal' ELSE 'oem' END,
      'source_url', 'https://partsouq.com/example-3',
      'note', 'EXAMPLE'
    )
  ),
  ARRAY[
    '# Area: ' || coalesce(sys.plain_name, sys.name),
    '# Use part_type codes from your maintenance catalog for this area',
    '# Years are optional; leave blank when unknown',
    '# Rows with note=EXAMPLE are skipped on import',
    '# Allowed position: Front, Rear, Front left/right, Rear left/right (FL FR RL RR)'
  ]::text[],
  true
FROM public.maintenance_service_categories sys
CROSS JOIN base_cols bc
LEFT JOIN public.maintenance_service_categories child
  ON child.parent_id = sys.id AND child.is_part IS TRUE
WHERE sys.kind = 'system'
GROUP BY sys.id, sys.op_code, sys.plain_name, sys.name, bc.cols
ON CONFLICT (area_id, version) DO UPDATE SET
  columns = excluded.columns,
  allowed_part_type_ids = excluded.allowed_part_type_ids,
  example_rows = excluded.example_rows,
  help_lines = excluded.help_lines,
  active = true;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.part_import_number_shape_unusual(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_undo_preflight(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_revalidate_line(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_route_review_rows(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_purge_staging() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_area_fit_scope(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.part_import_number_shape_unusual(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_undo_preflight(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_revalidate_line(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_route_review_rows(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_purge_staging() TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_area_fit_scope(uuid) TO service_role;
