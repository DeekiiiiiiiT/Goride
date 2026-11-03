-- AM-07 / AM-08: staged import templates for vehicle OE numbers, part cross-references, and shared platform links.
-- import_kind values: area (default) | vehicle_oe | part_cross_ref | platform_link

ALTER TABLE public.part_import_template
  ADD COLUMN IF NOT EXISTS import_kind text NOT NULL DEFAULT 'area';

ALTER TABLE public.part_import_batch
  ADD COLUMN IF NOT EXISTS import_kind text NOT NULL DEFAULT 'area';

INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, icon_key, sort_order, is_part)
VALUES
  (
    'd1000001-0000-4000-8000-000000000001',
    'imp-vehicle-oe',
    'Vehicle OE numbers',
    'system',
    'IMP-VOE',
    'upload',
    9001,
    false
  ),
  (
    'd1000001-0000-4000-8000-000000000002',
    'imp-part-cross',
    'Part cross-references',
    'system',
    'IMP-XREF',
    'hub',
    9002,
    false
  ),
  (
    'd1000001-0000-4000-8000-000000000003',
    'imp-platform-link',
    'Shared platform links',
    'system',
    'IMP-PLINK',
    'share',
    9003,
    false
  )
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  op_code = EXCLUDED.op_code,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_part = EXCLUDED.is_part;

CREATE UNIQUE INDEX IF NOT EXISTS part_import_template_kind_version_uidx
  ON public.part_import_template (import_kind, version)
  WHERE import_kind <> 'area';

ALTER TABLE public.part_import_row DROP CONSTRAINT IF EXISTS part_import_row_action_check;
ALTER TABLE public.part_import_row ADD CONSTRAINT part_import_row_action_check CHECK (
  action IN (
    'create_part', 'update_part', 'add_fit', 'update_fit', 'unchanged', 'skip',
    'upsert_vehicle_oe', 'upsert_part_cross', 'upsert_platform_link'
  )
);

ALTER TABLE public.part_import_change DROP CONSTRAINT IF EXISTS part_import_change_table_name_check;
ALTER TABLE public.part_import_change ADD CONSTRAINT part_import_change_table_name_check CHECK (
  table_name IN (
    'part_master', 'part_listing', 'part_interchange_group', 'universal_part',
    'vehicle_oe_number', 'part_oe_reference', 'part_index_number', 'part_approval',
    'platform_component_link', 'interchange_group_merge_log'
  )
);

CREATE OR REPLACE FUNCTION public.part_import_template_area_id(p_import_kind text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT t.area_id
  FROM public.part_import_template t
  WHERE t.import_kind = p_import_kind
    AND t.active IS TRUE
  ORDER BY t.version DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.part_import_hub_area_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.part_import_template_area_id('vehicle_oe');
$$;

REVOKE ALL ON FUNCTION public.part_import_template_area_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_template_area_id(text) TO service_role;
REVOKE ALL ON FUNCTION public.part_import_hub_area_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_hub_area_id() TO service_role;

INSERT INTO public.part_import_template (
  area_id, import_kind, version, columns, allowed_part_type_ids, example_rows, help_lines, active
)
VALUES
  (
    'd1000001-0000-4000-8000-000000000001'::uuid,
    'vehicle_oe',
    1,
    jsonb_build_array(
      jsonb_build_object('name', 'vehicle', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'part_type', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'position', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'side', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'oe_brand', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'oe_number', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'year_from', 'required', false, 'type', 'integer'),
      jsonb_build_object('name', 'year_to', 'required', false, 'type', 'integer'),
      jsonb_build_object('name', 'source_url', 'required', true, 'type', 'url')
    ),
    '{}'::uuid[],
    jsonb_build_array(
      jsonb_build_object(
        'vehicle', 'Toyota Roomy M900A 2019',
        'part_type', 'BRK-PADS',
        'position', 'FRONT',
        'oe_brand', 'Toyota',
        'oe_number', '04465-B1190',
        'source_url', 'https://partsouq.com/example',
        'note', 'EXAMPLE'
      )
    ),
    ARRAY[
      '# Vehicle factory (OE) numbers — one row per car, part type, position, and number.',
      '# source_url is stored as evidence_url in the catalog.'
    ],
    true
  ),
  (
    'd1000001-0000-4000-8000-000000000002'::uuid,
    'part_cross_ref',
    1,
    jsonb_build_array(
      jsonb_build_object('name', 'brand', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'part_number', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'oe_brand', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'oe_number', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'index_type', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'index_number', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'wear_sensor', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'approval_type', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'approval_value', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'source_url', 'required', true, 'type', 'url')
    ),
    '{}'::uuid[],
    jsonb_build_array(
      jsonb_build_object(
        'brand', 'Daihatsu',
        'part_number', 'D0051M-01-J',
        'oe_brand', 'Toyota',
        'oe_number', '04465-B1191',
        'index_type', 'wva',
        'index_number', '24551',
        'wear_sensor', 'none',
        'source_url', 'https://partsouq.com/example-cross',
        'note', 'EXAMPLE'
      )
    ),
    ARRAY[
      '# Part cross-references — each row must include at least one of: oe_number, index_number, or approval_value.',
      '# source_url is stored as evidence_url.'
    ],
    true
  ),
  (
    'd1000001-0000-4000-8000-000000000003'::uuid,
    'platform_link',
    1,
    jsonb_build_array(
      jsonb_build_object('name', 'platform_a', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'platform_b', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'part_type', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'scope', 'required', true, 'type', 'text'),
      jsonb_build_object('name', 'position', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'side', 'required', false, 'type', 'text'),
      jsonb_build_object('name', 'platform_a_year_from', 'required', false, 'type', 'integer'),
      jsonb_build_object('name', 'platform_a_year_to', 'required', false, 'type', 'integer'),
      jsonb_build_object('name', 'platform_b_year_from', 'required', false, 'type', 'integer'),
      jsonb_build_object('name', 'platform_b_year_to', 'required', false, 'type', 'integer'),
      jsonb_build_object('name', 'source_url', 'required', true, 'type', 'url'),
      jsonb_build_object('name', 'note', 'required', false, 'type', 'text')
    ),
    '{}'::uuid[],
    jsonb_build_array(
      jsonb_build_object(
        'platform_a', 'M900A',
        'platform_b', 'M900S',
        'part_type', 'BRK-PADS',
        'scope', 'component',
        'position', 'FRONT',
        'source_url', 'https://partsouq.com/example-link',
        'note', 'EXAMPLE'
      )
    ),
    ARRAY[
      '# Shared platform component links — scope component (live) or system (needs checking).',
      '# source_url is required and stored as evidence_url.'
    ],
    true
  )
ON CONFLICT (area_id, version) DO UPDATE SET
  import_kind = EXCLUDED.import_kind,
  columns = EXCLUDED.columns,
  help_lines = EXCLUDED.help_lines,
  example_rows = EXCLUDED.example_rows,
  active = EXCLUDED.active;

CREATE OR REPLACE VIEW public.part_import_special_templates AS
SELECT
  t.import_kind,
  t.area_id,
  t.version AS template_version,
  CASE t.import_kind
    WHEN 'vehicle_oe' THEN 'Vehicle OE numbers'
    WHEN 'part_cross_ref' THEN 'Part cross-references'
    WHEN 'platform_link' THEN 'Shared platform links'
    ELSE t.import_kind
  END AS hub_name,
  t.columns,
  t.help_lines,
  t.example_rows
FROM public.part_import_template t
WHERE t.import_kind <> 'area' AND t.active IS TRUE;

REVOKE ALL ON public.part_import_special_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.part_import_special_templates TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_record_validation_exception(
  p_batch_id uuid,
  p_line_no int,
  p_code text,
  p_detail jsonb,
  p_affected_ref text,
  p_severity text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_severity = 'error' OR p_code IN ('OE_NUMBER_INVALID', 'VALUE_NOT_ALLOWED', 'INDEX_CONFLICT') THEN
    INSERT INTO public.catalog_validation_exception (code, detail, affected_ref, source, severity, import_batch_id)
    VALUES (
      p_code,
      coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('line_no', p_line_no),
      p_affected_ref,
      'parts_import',
      CASE WHEN p_severity = 'label' THEN 'warning' ELSE p_severity END,
      p_batch_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_record_validation_exception(uuid, int, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_record_validation_exception(uuid, int, text, jsonb, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_row_snapshot(
  p_table text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_table = 'part_master' THEN
    RETURN (SELECT to_jsonb(pm.*) FROM public.part_master pm WHERE pm.id = p_id);
  ELSIF p_table = 'part_listing' THEN
    RETURN (SELECT to_jsonb(pl.*) FROM public.part_listing pl WHERE pl.id = p_id);
  ELSIF p_table = 'part_interchange_group' THEN
    RETURN (SELECT to_jsonb(g.*) FROM public.part_interchange_group g WHERE g.id = p_id);
  ELSIF p_table = 'vehicle_oe_number' THEN
    RETURN (SELECT to_jsonb(v.*) FROM public.vehicle_oe_number v WHERE v.id = p_id);
  ELSIF p_table = 'part_oe_reference' THEN
    RETURN (SELECT to_jsonb(r.*) FROM public.part_oe_reference r WHERE r.id = p_id);
  ELSIF p_table = 'part_index_number' THEN
    RETURN (SELECT to_jsonb(i.*) FROM public.part_index_number i WHERE i.id = p_id);
  ELSIF p_table = 'part_approval' THEN
    RETURN (SELECT to_jsonb(a.*) FROM public.part_approval a WHERE a.id = p_id);
  ELSIF p_table = 'platform_component_link' THEN
    RETURN (SELECT to_jsonb(l.*) FROM public.platform_component_link l WHERE l.id = p_id);
  ELSIF p_table = 'interchange_group_merge_log' THEN
    RETURN (SELECT to_jsonb(m.*) FROM public.interchange_group_merge_log m WHERE m.id = p_id);
  END IF;
  RETURN NULL;
END;
$$;

-- continued in part 2 (validate + promote + undo) appended by build script or below

CREATE OR REPLACE FUNCTION public.part_import_validate_auto_match_rows(
  p_batch_id uuid,
  p_only_line int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  r record;
  v_issues jsonb;
  v_status text;
  v_action text;
  v_vehicle uuid;
  v_part_type uuid;
  v_part uuid;
  v_existing uuid;
  v_src text;
  v_yf int;
  v_yt int;
  v_pos text;
  v_side text;
  v_oe_norm text;
  v_brand text;
  v_number_norm text;
  v_index_type text;
  v_wear text;
  v_plat_a uuid;
  v_plat_b uuid;
  v_scope text;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF v_kind IS NULL OR v_kind = 'area' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM public.part_import_row
    WHERE batch_id = p_batch_id AND (p_only_line IS NULL OR line_no = p_only_line)
    ORDER BY line_no
  LOOP
    v_issues := '[]'::jsonb;
    v_status := 'valid';
    v_action := CASE v_kind
      WHEN 'vehicle_oe' THEN 'upsert_vehicle_oe'
      WHEN 'part_cross_ref' THEN 'upsert_part_cross'
      WHEN 'platform_link' THEN 'upsert_platform_link'
      ELSE 'skip'
    END;
    v_vehicle := NULL;
    v_part_type := NULL;
    v_part := NULL;
    v_existing := NULL;
    v_plat_a := NULL;
    v_plat_b := NULL;
    v_pos := NULL;
    v_side := NULL;
    v_oe_norm := NULL;
    v_src := btrim(coalesce(r.raw->>'source_url', r.raw->>'evidence_url', ''));

    IF v_src = '' OR v_src !~* '^https://' THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'PARAM_MISSING', 'column', 'source_url', 'message', 'Source link required (https)', 'severity', 'error'));
    END IF;

    IF v_kind = 'vehicle_oe' THEN
      v_vehicle := r.vehicle_catalog_id;
      IF v_vehicle IS NULL OR NOT EXISTS (SELECT 1 FROM public.vehicle_catalog vc WHERE vc.id = v_vehicle) THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VEHICLE_NOT_FOUND', 'column', 'vehicle', 'message', 'Car not in Vehicle Database', 'severity', 'error'));
      END IF;

      SELECT c.id INTO v_part_type
      FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE
        AND (
          upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', '')))
          OR lower(coalesce(c.plain_name, c.name)) = lower(btrim(coalesce(r.raw->>'part_type', '')))
        )
      LIMIT 1;
      IF v_part_type IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not found', 'severity', 'error'));
      END IF;

      SELECT n.norm_position, n.norm_side INTO v_pos, v_side
      FROM public.part_norm_position(r.raw->>'position', r.raw->>'side') AS n;
      IF btrim(coalesce(r.raw->>'side', '')) <> '' AND v_side IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VALUE_NOT_ALLOWED', 'column', 'side', 'message', 'Side not allowed', 'severity', 'error'));
        PERFORM public.part_import_record_validation_exception(
          p_batch_id, r.line_no, 'VALUE_NOT_ALLOWED', jsonb_build_object('column', 'side'), r.raw->>'side', 'error');
      END IF;

      v_oe_norm := public.part_import_norm_number(coalesce(r.raw->>'oe_number', ''));
      IF btrim(coalesce(r.raw->>'oe_number', '')) = '' OR v_oe_norm = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'OE_NUMBER_INVALID', 'column', 'oe_number', 'message', 'Factory number invalid', 'severity', 'error'));
        PERFORM public.part_import_record_validation_exception(
          p_batch_id, r.line_no, 'OE_NUMBER_INVALID', jsonb_build_object('value', r.raw->>'oe_number'), r.raw->>'oe_number', 'error');
      END IF;

      v_yf := CASE WHEN btrim(coalesce(r.raw->>'year_from', '')) ~ '^\d{4}$' THEN (r.raw->>'year_from')::int ELSE NULL END;
      v_yt := CASE WHEN btrim(coalesce(r.raw->>'year_to', '')) ~ '^\d{4}$' THEN (r.raw->>'year_to')::int ELSE NULL END;

      IF v_vehicle IS NOT NULL AND v_part_type IS NOT NULL AND v_oe_norm <> '' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_issues) e WHERE e->>'severity' = 'error'
      ) THEN
        SELECT von.id INTO v_existing
        FROM public.vehicle_oe_number von
        WHERE von.vehicle_catalog_id = v_vehicle
          AND von.maintenance_component_id = v_part_type
          AND von.position IS NOT DISTINCT FROM v_pos
          AND von.side IS NOT DISTINCT FROM v_side
          AND von.oe_number_norm = v_oe_norm
        LIMIT 1;
        IF v_existing IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.vehicle_oe_number von
          WHERE von.id = v_existing
            AND von.evidence_url IS NOT DISTINCT FROM v_src
            AND von.year_from IS NOT DISTINCT FROM v_yf
            AND von.year_to IS NOT DISTINCT FROM v_yt
        ) THEN
          v_status := 'unchanged';
          v_action := 'unchanged';
          v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'code', 'UNCHANGED', 'column', 'oe_number', 'message', 'Already on file', 'severity', 'unchanged'));
        END IF;
      END IF;
    ELSIF v_kind = 'part_cross_ref' THEN
      v_brand := public.part_import_strip_brand(coalesce(r.raw->>'brand', ''));
      v_number_norm := public.part_import_norm_number(btrim(coalesce(r.raw->>'part_number', '')));
      IF v_brand = '' OR btrim(coalesce(r.raw->>'part_number', '')) = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'PARAM_MISSING', 'column', 'part_number', 'message', 'Brand and part number required', 'severity', 'error'));
      END IF;

      SELECT pm.id INTO v_part
      FROM public.part_master pm
      WHERE upper(coalesce(pm.manufacturer, '')) = v_brand
        AND pm.oem_part_number_norm = v_number_norm
      LIMIT 1;
      IF v_part IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'PART_NOT_FOUND', 'column', 'part_number', 'message', 'Part not in master catalog', 'severity', 'error'));
      END IF;

      IF btrim(coalesce(r.raw->>'oe_number', '')) <> '' THEN
        v_oe_norm := public.part_import_norm_number(r.raw->>'oe_number');
        IF v_oe_norm = '' OR length(v_oe_norm) < 3 THEN
          v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'code', 'OE_NUMBER_INVALID', 'column', 'oe_number', 'message', 'Factory number invalid', 'severity', 'error'));
          PERFORM public.part_import_record_validation_exception(
            p_batch_id, r.line_no, 'OE_NUMBER_INVALID', jsonb_build_object('value', r.raw->>'oe_number'), r.raw->>'oe_number', 'error');
        END IF;
      END IF;

      v_index_type := lower(btrim(coalesce(r.raw->>'index_type', '')));
      IF v_index_type <> '' AND v_index_type NOT IN ('wva', 'fmsi') THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VALUE_NOT_ALLOWED', 'column', 'index_type', 'message', 'Index type must be wva or fmsi', 'severity', 'error'));
        PERFORM public.part_import_record_validation_exception(
          p_batch_id, r.line_no, 'VALUE_NOT_ALLOWED', jsonb_build_object('column', 'index_type'), v_index_type, 'error');
      END IF;

      v_wear := lower(btrim(coalesce(r.raw->>'wear_sensor', 'none')));
      IF v_wear = '' THEN v_wear := 'none'; END IF;
      IF v_wear NOT IN ('none', 'integrated', 'separate') THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VALUE_NOT_ALLOWED', 'column', 'wear_sensor', 'message', 'Wear sensor not allowed', 'severity', 'error'));
        PERFORM public.part_import_record_validation_exception(
          p_batch_id, r.line_no, 'VALUE_NOT_ALLOWED', jsonb_build_object('column', 'wear_sensor'), v_wear, 'error');
      END IF;

      IF lower(btrim(coalesce(r.raw->>'approval_type', ''))) NOT IN ('', 'ece_r90') THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VALUE_NOT_ALLOWED', 'column', 'approval_type', 'message', 'Approval type not allowed', 'severity', 'error'));
        PERFORM public.part_import_record_validation_exception(
          p_batch_id, r.line_no, 'VALUE_NOT_ALLOWED', jsonb_build_object('column', 'approval_type'), r.raw->>'approval_type', 'error');
      END IF;

      IF btrim(coalesce(r.raw->>'oe_number', '')) = ''
         AND btrim(coalesce(r.raw->>'index_number', '')) = ''
         AND btrim(coalesce(r.raw->>'approval_value', '')) = '' THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'PARAM_MISSING', 'column', 'oe_number', 'message', 'Provide OE, index, or approval', 'severity', 'error'));
      END IF;

      IF v_part IS NOT NULL AND btrim(coalesce(r.raw->>'index_number', '')) <> '' AND v_index_type <> '' THEN
        IF EXISTS (
          SELECT 1
          FROM public.part_index_number pin
          WHERE pin.index_type = v_index_type
            AND pin.value_norm = upper(regexp_replace(r.raw->>'index_number', '[^A-Za-z0-9]', '', 'g'))
            AND pin.part_id <> v_part
            AND pin.wear_sensor IS DISTINCT FROM v_wear
        ) THEN
          v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'code', 'INDEX_CONFLICT', 'column', 'index_number', 'message', 'Index used with different wear sensor', 'severity', 'label'));
          PERFORM public.part_import_record_validation_exception(
            p_batch_id, r.line_no, 'INDEX_CONFLICT', jsonb_build_object('index_type', v_index_type), r.raw->>'index_number', 'label');
        END IF;
      END IF;
    ELSIF v_kind = 'platform_link' THEN
      SELECT id INTO v_plat_a FROM public.vehicle_platform vp WHERE upper(vp.code) = upper(btrim(r.raw->>'platform_a')) LIMIT 1;
      SELECT id INTO v_plat_b FROM public.vehicle_platform vp WHERE upper(vp.code) = upper(btrim(r.raw->>'platform_b')) LIMIT 1;
      IF v_plat_a IS NULL OR v_plat_b IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'PARAM_MISSING', 'column', 'platform_a', 'message', 'Platform code not found', 'severity', 'error'));
      ELSIF v_plat_a = v_plat_b THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VALUE_NOT_ALLOWED', 'column', 'platform_b', 'message', 'Platforms must differ', 'severity', 'error'));
      END IF;

      SELECT c.id INTO v_part_type
      FROM public.maintenance_service_categories c
      WHERE c.is_part IS TRUE
        AND upper(c.op_code) = upper(btrim(coalesce(r.raw->>'part_type', '')))
      LIMIT 1;
      IF v_part_type IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'DOMAIN_MISMATCH', 'column', 'part_type', 'message', 'Part type not found', 'severity', 'error'));
      END IF;

      v_scope := lower(btrim(coalesce(r.raw->>'scope', '')));
      IF v_scope NOT IN ('component', 'system') THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'code', 'VALUE_NOT_ALLOWED', 'column', 'scope', 'message', 'Scope must be component or system', 'severity', 'error'));
        PERFORM public.part_import_record_validation_exception(
          p_batch_id, r.line_no, 'VALUE_NOT_ALLOWED', jsonb_build_object('column', 'scope'), v_scope, 'error');
      END IF;

      SELECT n.norm_position, n.norm_side INTO v_pos, v_side
      FROM public.part_norm_position(r.raw->>'position', r.raw->>'side') AS n;
    END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_issues) e WHERE e->>'severity' = 'error') THEN
      v_status := 'error';
      v_action := 'skip';
    ELSIF v_status <> 'unchanged' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) e WHERE e->>'severity' = 'label'
    ) THEN
      v_status := 'labelled';
    END IF;

    UPDATE public.part_import_row
    SET issues = v_issues,
        status = v_status,
        action = v_action,
        vehicle_catalog_id = coalesce(v_vehicle, r.vehicle_catalog_id),
        part_type_id = coalesce(v_part_type, r.part_type_id),
        existing_part_id = coalesce(v_part, r.existing_part_id),
        normalized = coalesce(r.normalized, '{}'::jsonb) || jsonb_build_object(
          'source_url', v_src,
          'position', v_pos,
          'side', v_side,
          'platform_a_id', v_plat_a,
          'platform_b_id', v_plat_b,
          'oe_number_norm', v_oe_norm
        )
    WHERE batch_id = p_batch_id AND line_no = r.line_no;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_validate_auto_match_rows(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_validate_auto_match_rows(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_validate_auto_match_postprocess(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'area' THEN
    RETURN;
  END IF;

  IF v_kind = 'vehicle_oe' THEN
    WITH d AS (
      SELECT r.line_no,
        row_number() OVER (
          PARTITION BY r.vehicle_catalog_id, r.part_type_id,
            coalesce(r.normalized->>'position', ''), coalesce(r.normalized->>'side', ''),
            coalesce(r.normalized->>'oe_number_norm', '')
          ORDER BY r.line_no
        ) AS rn
      FROM public.part_import_row r
      WHERE r.batch_id = p_batch_id
    )
    UPDATE public.part_import_row r
    SET status = 'duplicate', action = 'skip',
      issues = coalesce(r.issues, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code', 'OE_DUPLICATE', 'column', 'oe_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'))
    FROM d
    WHERE r.batch_id = p_batch_id AND r.line_no = d.line_no AND d.rn > 1;
  ELSIF v_kind = 'part_cross_ref' THEN
    WITH d AS (
      SELECT r.line_no,
        row_number() OVER (
          PARTITION BY upper(btrim(coalesce(r.raw->>'brand', ''))),
            public.part_import_norm_number(coalesce(r.raw->>'part_number', '')),
            coalesce(r.raw->>'oe_number', ''), coalesce(r.raw->>'index_type', ''), coalesce(r.raw->>'index_number', '')
          ORDER BY r.line_no
        ) AS rn
      FROM public.part_import_row r
      WHERE r.batch_id = p_batch_id
    )
    UPDATE public.part_import_row r
    SET status = 'duplicate', action = 'skip',
      issues = coalesce(r.issues, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code', 'OE_DUPLICATE', 'column', 'part_number', 'message', 'Duplicate row in file', 'severity', 'duplicate'))
    FROM d
    WHERE r.batch_id = p_batch_id AND r.line_no = d.line_no AND d.rn > 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_validate_auto_match_postprocess(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_validate_auto_match_postprocess(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_validate(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_stats jsonb;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'area' THEN
    PERFORM public.part_import_validate_rows(p_batch_id, NULL);
    PERFORM public.part_import_validate_postprocess(p_batch_id);
  ELSE
    PERFORM public.part_import_validate_auto_match_rows(p_batch_id, NULL);
    PERFORM public.part_import_validate_auto_match_postprocess(p_batch_id);
  END IF;
  PERFORM public.part_import_route_review_rows(p_batch_id);
  v_stats := public.part_import_refresh_batch_counts(p_batch_id);
  RETURN v_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_validate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_validate(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_revalidate_line(p_batch_id uuid, p_line_no int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_kind text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.part_import_row WHERE batch_id = p_batch_id AND line_no = p_line_no) THEN
    RAISE EXCEPTION 'Row not found';
  END IF;
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') = 'area' THEN
    PERFORM public.part_import_validate_rows(p_batch_id, p_line_no);
    PERFORM public.part_import_validate_postprocess(p_batch_id);
  ELSE
    PERFORM public.part_import_validate_auto_match_rows(p_batch_id, p_line_no);
    PERFORM public.part_import_validate_auto_match_postprocess(p_batch_id);
  END IF;
  SELECT to_jsonb(r.*) INTO v_row FROM public.part_import_row r WHERE r.batch_id = p_batch_id AND r.line_no = p_line_no;
  PERFORM public.part_import_refresh_batch_counts(p_batch_id);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_revalidate_line(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_revalidate_line(uuid, int) TO service_role;
CREATE OR REPLACE FUNCTION public.part_import_promote_area_parts(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  v_norm_pos text;
  v_norm_side text;
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
  IF NOT pg_try_advisory_xact_lock(v_lock) THEN RAISE EXCEPTION 'Already importing this area'; END IF;

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
    SELECT n.norm_position, n.norm_side INTO v_norm_pos, v_norm_side
    FROM public.part_norm_position(r.raw->>'position', coalesce(r.raw->>'side', r.normalized->>'side')) AS n;

    IF r.action = 'add_fit' THEN
      SELECT bpp.part_id INTO v_part FROM part_import_batch_parts bpp WHERE bpp.line_no = r.existing_line_no;
      IF v_part IS NULL THEN v_part := r.existing_part_id; END IF;
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
        catalog_decision, metadata, updated_at, oem_part_number_norm_version
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
        now(),
        public.part_import_norm_version()
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
        AND pl.position IS NOT DISTINCT FROM v_norm_pos
        AND pl.side IS NOT DISTINCT FROM v_norm_side;

      IF v_listing IS NULL THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
          evidence_url, import_batch_id, origin
        ) VALUES (
          v_group,
          r.vehicle_catalog_id,
          v_norm_pos,
          v_norm_side,
          (r.normalized->>'year_from')::int,
          (r.normalized->>'year_to')::int,
          r.normalized->>'source_url',
          p_batch_id,
          'import'
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
            position = v_norm_pos,
            side = v_norm_side
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

REVOKE ALL ON FUNCTION public.save_guided_part(jsonb) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.part_import_promote_area_parts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_promote_area_parts(uuid, uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.part_import_promote_auto_match(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
  r record;
  v_before jsonb;
  v_row_id uuid;
  v_created int := 0;
  v_updated int := 0;
  v_matches_live int := 0;
  v_matches_checking int := 0;
  v_vehicle uuid;
  v_pos text;
  v_side text;
  v_yf int;
  v_yt int;
  v_part uuid;
  v_index_norm text;
BEGIN
  SELECT * INTO v_batch FROM public.part_import_batch WHERE id = p_batch_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.status <> 'checked' THEN RAISE EXCEPTION 'Batch must be checked before import'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('part_import:' || v_batch.area_id::text)) THEN
    RAISE EXCEPTION 'Already importing this template';
  END IF;

  UPDATE public.part_import_batch SET status = 'promoting' WHERE id = p_batch_id;

  CREATE TEMP TABLE IF NOT EXISTS _pm_import_batch_id (batch_id uuid) ON COMMIT DROP;
  TRUNCATE _pm_import_batch_id;
  INSERT INTO _pm_import_batch_id (batch_id) VALUES (p_batch_id);

  FOR r IN
    SELECT * FROM public.part_import_row
    WHERE batch_id = p_batch_id
      AND accepted IS TRUE
      AND status IN ('valid', 'labelled')
      AND action IN ('upsert_vehicle_oe', 'upsert_part_cross', 'upsert_platform_link')
    ORDER BY line_no
  LOOP
    v_pos := r.normalized->>'position';
    v_side := r.normalized->>'side';
    v_yf := nullif(r.raw->>'year_from', '')::int;
    v_yt := nullif(r.raw->>'year_to', '')::int;

    IF v_batch.import_kind = 'vehicle_oe' THEN
      v_vehicle := r.vehicle_catalog_id;
      SELECT id INTO v_row_id
      FROM public.vehicle_oe_number von
      WHERE von.vehicle_catalog_id = v_vehicle
        AND von.maintenance_component_id = r.part_type_id
        AND von.position IS NOT DISTINCT FROM v_pos
        AND von.side IS NOT DISTINCT FROM v_side
        AND von.oe_number_norm = r.normalized->>'oe_number_norm';

      IF v_row_id IS NULL THEN
        INSERT INTO public.vehicle_oe_number (
          vehicle_catalog_id, maintenance_component_id, position, side, year_from, year_to,
          oe_brand, oe_number, oe_number_norm, norm_version, evidence_url, created_by, import_batch_id
        ) VALUES (
          v_vehicle, r.part_type_id, v_pos, v_side, v_yf, v_yt,
          btrim(r.raw->>'oe_brand'), btrim(r.raw->>'oe_number'), r.normalized->>'oe_number_norm',
          public.part_import_norm_version(), r.normalized->>'source_url', p_actor, p_batch_id
        )
        RETURNING id INTO v_row_id;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (p_batch_id, r.line_no, 'vehicle_oe_number', v_row_id, 'insert', NULL,
          public.part_import_row_snapshot('vehicle_oe_number', v_row_id));
        v_created := v_created + 1;
      ELSE
        v_before := public.part_import_row_snapshot('vehicle_oe_number', v_row_id);
        UPDATE public.vehicle_oe_number von
        SET year_from = v_yf,
            year_to = v_yt,
            evidence_url = r.normalized->>'source_url',
            oe_brand = btrim(r.raw->>'oe_brand'),
            oe_number = btrim(r.raw->>'oe_number'),
            updated_at = now()
        WHERE von.id = v_row_id;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (p_batch_id, r.line_no, 'vehicle_oe_number', v_row_id, 'update', v_before,
          public.part_import_row_snapshot('vehicle_oe_number', v_row_id));
        v_updated := v_updated + 1;
      END IF;
      PERFORM public.part_import_tagged_match_recompute(p_batch_id, NULL, v_vehicle);
    ELSIF v_batch.import_kind = 'part_cross_ref' THEN
      v_part := r.existing_part_id;
      IF btrim(coalesce(r.raw->>'oe_number', '')) <> '' THEN
        SELECT id INTO v_row_id
        FROM public.part_oe_reference por
        WHERE por.part_id = v_part AND por.oe_number_norm = r.normalized->>'oe_number_norm';
        IF v_row_id IS NULL THEN
          INSERT INTO public.part_oe_reference (
            part_id, reference_type, oe_brand, oe_number, oe_number_norm, norm_version, evidence_url, created_by, import_batch_id
          ) VALUES (
            v_part, 'cross_ref', btrim(r.raw->>'oe_brand'), btrim(r.raw->>'oe_number'), r.normalized->>'oe_number_norm',
            public.part_import_norm_version(), r.normalized->>'source_url', p_actor, p_batch_id
          )
          RETURNING id INTO v_row_id;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
          VALUES (p_batch_id, r.line_no, 'part_oe_reference', v_row_id, 'insert', NULL,
            public.part_import_row_snapshot('part_oe_reference', v_row_id));
          v_created := v_created + 1;
        ELSE
          v_before := public.part_import_row_snapshot('part_oe_reference', v_row_id);
          UPDATE public.part_oe_reference por
          SET evidence_url = r.normalized->>'source_url', oe_brand = btrim(r.raw->>'oe_brand')
          WHERE por.id = v_row_id;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
          VALUES (p_batch_id, r.line_no, 'part_oe_reference', v_row_id, 'update', v_before,
            public.part_import_row_snapshot('part_oe_reference', v_row_id));
          v_updated := v_updated + 1;
        END IF;
      END IF;

      IF btrim(coalesce(r.raw->>'index_number', '')) <> '' AND btrim(coalesce(r.raw->>'index_type', '')) <> '' THEN
        v_index_norm := upper(regexp_replace(r.raw->>'index_number', '[^A-Za-z0-9]', '', 'g'));
        SELECT id INTO v_row_id
        FROM public.part_index_number pin
        WHERE pin.part_id = v_part AND pin.index_type = lower(r.raw->>'index_type') AND pin.value_norm = v_index_norm;
        IF v_row_id IS NULL THEN
          INSERT INTO public.part_index_number (
            part_id, index_type, value, value_norm, wear_sensor, evidence_url, created_by, import_batch_id
          ) VALUES (
            v_part, lower(r.raw->>'index_type'), btrim(r.raw->>'index_number'), v_index_norm,
            lower(coalesce(nullif(btrim(r.raw->>'wear_sensor'), ''), 'none')),
            r.normalized->>'source_url', p_actor, p_batch_id
          )
          RETURNING id INTO v_row_id;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
          VALUES (p_batch_id, r.line_no, 'part_index_number', v_row_id, 'insert', NULL,
            public.part_import_row_snapshot('part_index_number', v_row_id));
          v_created := v_created + 1;
        ELSE
          v_before := public.part_import_row_snapshot('part_index_number', v_row_id);
          UPDATE public.part_index_number pin
          SET evidence_url = r.normalized->>'source_url',
              wear_sensor = lower(coalesce(nullif(btrim(r.raw->>'wear_sensor'), ''), 'none'))
          WHERE pin.id = v_row_id;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
          VALUES (p_batch_id, r.line_no, 'part_index_number', v_row_id, 'update', v_before,
            public.part_import_row_snapshot('part_index_number', v_row_id));
          v_updated := v_updated + 1;
        END IF;
      END IF;

      IF btrim(coalesce(r.raw->>'approval_value', '')) <> '' THEN
        v_index_norm := upper(regexp_replace(r.raw->>'approval_value', '[^A-Za-z0-9]', '', 'g'));
        SELECT id INTO v_row_id
        FROM public.part_approval pa
        WHERE pa.part_id = v_part AND pa.approval_type = 'ece_r90' AND pa.value_norm = v_index_norm;
        IF v_row_id IS NULL THEN
          INSERT INTO public.part_approval (
            part_id, approval_type, value, value_norm, evidence_url, created_by, import_batch_id
          ) VALUES (
            v_part, 'ece_r90', btrim(r.raw->>'approval_value'), v_index_norm,
            r.normalized->>'source_url', p_actor, p_batch_id
          )
          RETURNING id INTO v_row_id;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
          VALUES (p_batch_id, r.line_no, 'part_approval', v_row_id, 'insert', NULL,
            public.part_import_row_snapshot('part_approval', v_row_id));
          v_created := v_created + 1;
        ELSE
          v_before := public.part_import_row_snapshot('part_approval', v_row_id);
          UPDATE public.part_approval pa SET evidence_url = r.normalized->>'source_url' WHERE pa.id = v_row_id;
          INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
          VALUES (p_batch_id, r.line_no, 'part_approval', v_row_id, 'update', v_before,
            public.part_import_row_snapshot('part_approval', v_row_id));
          v_updated := v_updated + 1;
        END IF;
      END IF;

      PERFORM public.part_import_tagged_match_recompute(
        p_batch_id,
        (SELECT interchange_group_id FROM public.part_master WHERE id = v_part),
        NULL
      );
      INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
      SELECT
        p_batch_id,
        r.line_no,
        'interchange_group_merge_log',
        m.id,
        'insert',
        public.part_import_row_snapshot('interchange_group_merge_log', m.id)
      FROM public.interchange_group_merge_log m
      WHERE m.reversed_at IS NULL
        AND m.part_id = v_part
        AND NOT EXISTS (
          SELECT 1
          FROM public.part_import_change c
          WHERE c.batch_id = p_batch_id
            AND c.table_name = 'interchange_group_merge_log'
            AND c.row_id = m.id
        );
    ELSIF v_batch.import_kind = 'platform_link' THEN
      SELECT id INTO v_row_id
      FROM public.platform_component_link l
      WHERE LEAST(l.platform_a_id, l.platform_b_id) = LEAST((r.normalized->>'platform_a_id')::uuid, (r.normalized->>'platform_b_id')::uuid)
        AND GREATEST(l.platform_a_id, l.platform_b_id) = GREATEST((r.normalized->>'platform_a_id')::uuid, (r.normalized->>'platform_b_id')::uuid)
        AND l.scope = lower(r.raw->>'scope')
        AND l.maintenance_component_id = r.part_type_id
        AND l.position IS NOT DISTINCT FROM v_pos
        AND l.side IS NOT DISTINCT FROM v_side;

      IF v_row_id IS NULL THEN
        INSERT INTO public.platform_component_link (
          platform_a_id, platform_b_id, scope, maintenance_component_id, position, side,
          platform_a_year_from, platform_a_year_to, platform_b_year_from, platform_b_year_to,
          evidence_url, note, created_by, import_batch_id
        ) VALUES (
          (r.normalized->>'platform_a_id')::uuid,
          (r.normalized->>'platform_b_id')::uuid,
          lower(r.raw->>'scope'),
          r.part_type_id,
          v_pos,
          v_side,
          nullif(r.raw->>'platform_a_year_from', '')::int,
          nullif(r.raw->>'platform_a_year_to', '')::int,
          nullif(r.raw->>'platform_b_year_from', '')::int,
          nullif(r.raw->>'platform_b_year_to', '')::int,
          r.normalized->>'source_url',
          nullif(btrim(r.raw->>'note'), ''),
          p_actor,
          p_batch_id
        )
        RETURNING id INTO v_row_id;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (p_batch_id, r.line_no, 'platform_component_link', v_row_id, 'insert', NULL,
          public.part_import_row_snapshot('platform_component_link', v_row_id));
        v_created := v_created + 1;
      ELSE
        v_before := public.part_import_row_snapshot('platform_component_link', v_row_id);
        UPDATE public.platform_component_link l
        SET platform_a_year_from = nullif(r.raw->>'platform_a_year_from', '')::int,
            platform_a_year_to = nullif(r.raw->>'platform_a_year_to', '')::int,
            platform_b_year_from = nullif(r.raw->>'platform_b_year_from', '')::int,
            platform_b_year_to = nullif(r.raw->>'platform_b_year_to', '')::int,
            evidence_url = r.normalized->>'source_url',
            note = coalesce(nullif(btrim(r.raw->>'note'), ''), l.note)
        WHERE l.id = v_row_id;
        INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, before, after)
        VALUES (p_batch_id, r.line_no, 'platform_component_link', v_row_id, 'update', v_before,
          public.part_import_row_snapshot('platform_component_link', v_row_id));
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*)::int, count(*) FILTER (WHERE status = 'needs_checking')::int
  INTO v_matches_live, v_matches_checking
  FROM public.part_fit_derived
  WHERE import_batch_id = p_batch_id;

  UPDATE public.part_fit_derived d
  SET import_batch_id = p_batch_id
  WHERE d.import_batch_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.part_import_change c
      WHERE c.batch_id = p_batch_id
        AND c.table_name = 'vehicle_oe_number'
        AND (
          (c.op = 'insert' AND (c.after->>'vehicle_catalog_id')::uuid = d.vehicle_catalog_id)
          OR (c.op = 'update' AND (c.before->>'vehicle_catalog_id')::uuid = d.vehicle_catalog_id)
        )
    );

  IF EXISTS (SELECT 1 FROM _pm_import_batch_id LIMIT 1) THEN
    TRUNCATE _pm_import_batch_id;
  END IF;

  UPDATE public.part_import_batch
  SET status = 'imported',
      promoted_at = now(),
      promoted_by = p_actor,
      parts_created = v_created,
      parts_updated = v_updated
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'partsCreated', v_created,
    'partsUpdated', v_updated,
    'fitsCreated', 0,
    'fitsUpdated', 0,
    'matchesCreated', v_matches_live,
    'matchesNeedChecking', v_matches_checking
  );
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_promote_auto_match(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_promote_auto_match(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_promote(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT import_kind INTO v_kind FROM public.part_import_batch WHERE id = p_batch_id;
  IF coalesce(v_kind, 'area') <> 'area' THEN
    RETURN public.part_import_promote_auto_match(p_batch_id, p_actor);
  END IF;
  RETURN public.part_import_promote_area_parts(p_batch_id, p_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_promote(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_promote(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_undo(p_batch_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
  c record;
  v_pf jsonb;
  v_kept int := 0;
  r record;
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

  CREATE TEMP TABLE IF NOT EXISTS part_import_undo_groups (group_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS part_import_undo_vehicles (vehicle_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE part_import_undo_groups;
  TRUNCATE part_import_undo_vehicles;

  INSERT INTO part_import_undo_vehicles (vehicle_id)
  SELECT DISTINCT coalesce(c.after->>'vehicle_catalog_id', c.before->>'vehicle_catalog_id')::uuid
  FROM public.part_import_change c
  WHERE c.batch_id = p_batch_id
    AND c.table_name = 'vehicle_oe_number'
    AND coalesce(c.after->>'vehicle_catalog_id', c.before->>'vehicle_catalog_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change c
  JOIN public.part_master pm ON pm.id = coalesce(c.after->>'part_id', c.before->>'part_id')::uuid
  WHERE c.batch_id = p_batch_id
    AND c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval')
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT pm.interchange_group_id
  FROM public.part_import_change c
  JOIN public.part_master pm ON pm.id = c.row_id
  WHERE c.batch_id = p_batch_id
    AND c.table_name = 'part_master'
    AND pm.interchange_group_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO part_import_undo_groups (group_id)
  SELECT DISTINCT coalesce(c.after->>'interchange_group_id', c.before->>'interchange_group_id')::uuid
  FROM public.part_import_change c
  WHERE c.batch_id = p_batch_id
    AND c.table_name = 'part_listing'
    AND coalesce(c.after->>'interchange_group_id', c.before->>'interchange_group_id') IS NOT NULL
  ON CONFLICT DO NOTHING;

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
      ELSIF c.table_name = 'vehicle_oe_number' THEN
        DELETE FROM public.vehicle_oe_number WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval') THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', c.table_name) USING c.row_id;
      ELSIF c.table_name = 'platform_component_link' THEN
        DELETE FROM public.platform_component_link WHERE id = c.row_id;
      ELSIF c.table_name = 'interchange_group_merge_log' THEN
        IF EXISTS (
          SELECT 1
          FROM public.interchange_group_merge_log m
          LEFT JOIN public.part_match_conflict pc ON pc.id = m.conflict_id
          WHERE m.id = c.row_id AND coalesce(pc.status, '') = 'kept'
        ) THEN
          CONTINUE;
        END IF;
        UPDATE public.interchange_group_merge_log m
        SET reversed_at = now()
        WHERE m.id = c.row_id AND m.reversed_at IS NULL;
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
      ELSIF c.table_name = 'vehicle_oe_number' THEN
        UPDATE public.vehicle_oe_number von SET
          year_from = (c.before->>'year_from')::int,
          year_to = (c.before->>'year_to')::int,
          evidence_url = c.before->>'evidence_url',
          oe_brand = c.before->>'oe_brand',
          oe_number = c.before->>'oe_number',
          oe_number_norm = c.before->>'oe_number_norm'
        WHERE id = c.row_id;
      ELSIF c.table_name IN ('part_oe_reference', 'part_index_number', 'part_approval', 'platform_component_link') THEN
        EXECUTE format(
          'UPDATE public.%I SET evidence_url = $1 WHERE id = $2',
          c.table_name
        ) USING c.before->>'evidence_url', c.row_id;
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT g.group_id FROM part_import_undo_groups g LOOP
    PERFORM public.part_match_recompute(r.group_id, NULL);
  END LOOP;
  FOR r IN SELECT v.vehicle_id FROM part_import_undo_vehicles v LOOP
    PERFORM public.part_match_recompute(NULL, r.vehicle_id);
  END LOOP;

  PERFORM public.refresh_variant_parts_readiness();

  UPDATE public.part_import_batch
  SET status = 'undone', undone_at = now(), undone_by = p_actor
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'partsKept', v_kept);
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_undo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_undo(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_engine_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT '2.5.0'::text;
$$;

REVOKE ALL ON FUNCTION public.part_import_engine_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_engine_version() TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_tagged_match_recompute(
  p_batch_id uuid,
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pm_import_batch_id (batch_id uuid) ON COMMIT DROP;
  TRUNCATE _pm_import_batch_id;
  INSERT INTO _pm_import_batch_id (batch_id) VALUES (p_batch_id);
  PERFORM public.part_match_recompute(p_group_id, p_vehicle_id);
  UPDATE public.part_fit_derived d
  SET import_batch_id = p_batch_id
  WHERE d.import_batch_id IS NULL
    AND (
      (p_vehicle_id IS NOT NULL AND d.vehicle_catalog_id = p_vehicle_id)
      OR (p_group_id IS NOT NULL AND d.interchange_group_id = p_group_id)
    );
  TRUNCATE _pm_import_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_tagged_match_recompute(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_tagged_match_recompute(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_match_recompute_pairs(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  OUT rows_added integer,
  OUT rows_changed integer,
  OUT rows_removed integer,
  OUT rows_scanned integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine integer := public.part_match_engine_version();
BEGIN
  rows_added := 0;
  rows_changed := 0;
  rows_removed := 0;
  rows_scanned := 0;

  CREATE TEMP TABLE IF NOT EXISTS _pm_scope (group_id uuid NOT NULL, vehicle_id uuid NOT NULL, PRIMARY KEY (group_id, vehicle_id)) ON COMMIT DROP;
  TRUNCATE _pm_scope;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _pm_import_batch_id (batch_id uuid) ON COMMIT DROP;
  IF EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1) THEN
    INSERT INTO _pm_scope SELECT bs.group_id, bs.vehicle_id FROM _pm_batch_scope bs;
  ELSIF p_group_id IS NOT NULL AND p_vehicle_id IS NOT NULL THEN
    INSERT INTO _pm_scope VALUES (p_group_id, p_vehicle_id);
  ELSIF p_group_id IS NOT NULL THEN
    INSERT INTO _pm_scope
    SELECT DISTINCT p_group_id, von.vehicle_catalog_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(p_group_id) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = p_group_id
    UNION
    SELECT p_group_id, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = p_group_id;
  ELSIF p_vehicle_id IS NOT NULL THEN
    INSERT INTO _pm_scope
    SELECT DISTINCT gn.interchange_group_id, p_vehicle_id
    FROM public.vehicle_oe_number von
    JOIN public.part_match_oe_chain(von.id) ch ON true
    JOIN public.part_match_group_numbers(NULL) gn ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE von.vehicle_catalog_id = p_vehicle_id
    UNION
    SELECT d.interchange_group_id, p_vehicle_id
    FROM public.part_fit_derived d
    WHERE d.vehicle_catalog_id = p_vehicle_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _pm_desired (
    interchange_group_id uuid NOT NULL,
    vehicle_catalog_id uuid NOT NULL,
    position text,
    side text,
    year_from integer,
    year_to integer,
    vehicle_oe_number_id uuid NOT NULL,
    part_oe_reference_ids uuid[] NOT NULL,
    reason_code text NOT NULL,
    reason_params jsonb NOT NULL,
    status text NOT NULL,
    matched_keys text[] NOT NULL,
    rule text NOT NULL DEFAULT 'oe_number'
  ) ON COMMIT DROP;
  TRUNCATE _pm_desired;

  SELECT count(*)::integer INTO rows_scanned FROM _pm_scope;

  INSERT INTO _pm_desired
  SELECT DISTINCT ON (sp.group_id, sp.vehicle_id, von.position, von.side, 'oe_number')
    sp.group_id,
    sp.vehicle_id,
    von.position,
    von.side,
    CASE
      WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
      ELSE clip.yf
    END,
    CASE
      WHEN clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf > clip.yt THEN NULL
      ELSE clip.yt
    END,
    von.id,
    gn.part_oe_reference_ids,
    CASE WHEN ch.superseded THEN 'oe_number_superseded' ELSE 'oe_number' END,
    jsonb_build_object(
      'oe_number', von.oe_number,
      'oe_brand', von.oe_brand,
      'vehicle_oe_number_id', von.id,
      'part_oe_reference_ids', gn.part_oe_reference_ids,
      'chain', ch.chain
    ),
    'live',
    ch.chain,
    'oe_number'
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.vehicle_catalog vc ON vc.id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN vc.production_start_year IS NOT NULL THEN
          greatest(coalesce(von.year_from, vc.production_start_year), vc.production_start_year)
        ELSE von.year_from
      END AS yf,
      CASE
        WHEN vc.production_end_year IS NOT NULL THEN
          least(coalesce(von.year_to, vc.production_end_year), vc.production_end_year)
        ELSE von.year_to
      END AS yt
  ) clip
  WHERE sp.group_id = gn.interchange_group_id
    AND von.maintenance_component_id = gn.maintenance_component_id
    AND NOT public.part_listing_exclusion_blocks(
      sp.group_id, sp.vehicle_id, von.position, von.side,
      coalesce(vc.production_start_year, von.year_from)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.interchange_group_id = sp.group_id
        AND pl.vehicle_catalog_id = sp.vehicle_id
        AND NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    )
    AND (
      (clip.yf IS NULL AND clip.yt IS NULL)
      OR (clip.yf IS NOT NULL AND clip.yt IS NOT NULL AND clip.yf <= clip.yt)
      OR (clip.yf IS NOT NULL AND clip.yt IS NULL)
      OR (clip.yf IS NULL AND clip.yt IS NOT NULL)
    )
  ORDER BY sp.group_id, sp.vehicle_id, von.position, von.side, von.id;

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, part_listing_id,
    matched_key, detail, status, engine_version
  )
  SELECT
    'part_type_mismatch',
    gn.interchange_group_id,
    sp.vehicle_id,
    von.id,
    NULL,
    von.oe_number_norm,
    jsonb_build_object(
      'vehicle_oe_number_id', von.id,
      'expected_part_type_id', von.maintenance_component_id,
      'actual_part_type_id', gn.maintenance_component_id
    ),
    'open',
    v_engine
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = sp.group_id
  WHERE von.maintenance_component_id IS DISTINCT FROM gn.maintenance_component_id
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'part_type_mismatch'
        AND c.vehicle_oe_number_id = von.id
        AND c.interchange_group_id = gn.interchange_group_id
        AND c.vehicle_catalog_id = sp.vehicle_id
    );

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, part_listing_id,
    matched_key, detail, status, engine_version
  )
  SELECT
    'position_side_mismatch',
    pl.interchange_group_id,
    sp.vehicle_id,
    von.id,
    pl.id,
    von.oe_number_norm,
    jsonb_build_object(
      'vehicle_oe_number_id', von.id,
      'part_listing_id', pl.id,
      'expected', jsonb_build_object('position', von.position, 'side', von.side),
      'actual', jsonb_build_object('position', pl.position, 'side', pl.side)
    ),
    'open',
    v_engine
  FROM _pm_scope sp
  JOIN public.vehicle_oe_number von ON von.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_listing pl
    ON pl.interchange_group_id = sp.group_id AND pl.vehicle_catalog_id = sp.vehicle_id
  JOIN public.part_match_oe_chain(von.id) ch ON true
  JOIN public.part_match_group_numbers(sp.group_id) gn
    ON gn.norm = ch.norm AND gn.brand = ch.brand AND gn.interchange_group_id = sp.group_id
  WHERE NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'position_side_mismatch'
        AND c.part_listing_id = pl.id
        AND c.vehicle_oe_number_id = von.id
        AND c.interchange_group_id = pl.interchange_group_id
        AND c.vehicle_catalog_id = sp.vehicle_id
    );

  WITH ins AS (
    INSERT INTO public.part_fit_derived (
      interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, rule,
      matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
      status, engine_version, computed_at, import_batch_id
    )
    SELECT
      d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to, 'oe_number',
      d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
      d.status, v_engine, now(), (SELECT ib.batch_id FROM _pm_import_batch_id ib LIMIT 1)
    FROM _pm_desired d
    ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side, rule) DO UPDATE
    SET
      year_from = EXCLUDED.year_from,
      year_to = EXCLUDED.year_to,
      matched_keys = EXCLUDED.matched_keys,
      vehicle_oe_number_id = EXCLUDED.vehicle_oe_number_id,
      part_oe_reference_ids = EXCLUDED.part_oe_reference_ids,
      reason_code = EXCLUDED.reason_code,
      reason_params = EXCLUDED.reason_params,
      status = EXCLUDED.status,
      engine_version = EXCLUDED.engine_version,
      computed_at = EXCLUDED.computed_at,
      import_batch_id = coalesce((SELECT ib.batch_id FROM _pm_import_batch_id ib LIMIT 1), public.part_fit_derived.import_batch_id)
    WHERE public.part_fit_derived.engine_version IS DISTINCT FROM EXCLUDED.engine_version
       OR public.part_fit_derived.reason_code IS DISTINCT FROM EXCLUDED.reason_code
       OR public.part_fit_derived.matched_keys IS DISTINCT FROM EXCLUDED.matched_keys
       OR (
         EXISTS (SELECT 1 FROM _pm_import_batch_id ib LIMIT 1)
         AND public.part_fit_derived.import_batch_id IS DISTINCT FROM EXCLUDED.import_batch_id
       )
    RETURNING (xmax = 0) AS inserted
  )
  SELECT
    count(*) FILTER (WHERE inserted)::integer,
    count(*) FILTER (WHERE NOT inserted)::integer
  INTO rows_added, rows_changed
  FROM ins;

  WITH del AS (
    DELETE FROM public.part_fit_derived d
    USING _pm_scope sp
    WHERE d.interchange_group_id = sp.group_id
      AND d.vehicle_catalog_id = sp.vehicle_id
      AND NOT EXISTS (
        SELECT 1 FROM _pm_desired x
        WHERE x.interchange_group_id = d.interchange_group_id
          AND x.vehicle_catalog_id = d.vehicle_catalog_id
          AND x.position IS NOT DISTINCT FROM d.position
          AND x.side IS NOT DISTINCT FROM d.side
      )
    RETURNING 1
  )
  SELECT count(*)::integer INTO rows_removed FROM del;

  IF p_group_id IS NULL AND p_vehicle_id IS NULL AND EXISTS (SELECT 1 FROM _pm_scope LIMIT 1) THEN
    UPDATE public.part_fit_derived d
    SET status = 'suppressed'
    FROM _pm_scope sp
    WHERE d.interchange_group_id = sp.group_id
      AND d.vehicle_catalog_id = sp.vehicle_id
      AND d.status <> 'suppressed'
      AND EXISTS (
        SELECT 1
        FROM public.part_listing pl
        WHERE pl.interchange_group_id = d.interchange_group_id
          AND pl.vehicle_catalog_id = d.vehicle_catalog_id
          AND public.part_side_covers(pl.position, pl.side, d.position, d.side)
      );
  ELSE
    PERFORM public.part_match_apply_suppression(p_group_id, p_vehicle_id);
  END IF;
END;
$$;


REVOKE ALL ON FUNCTION public.part_match_recompute_pairs(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_recompute_pairs(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.part_import_next_code(p_area_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_op text;
  v_day text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD');
  v_base text;
  v_n int;
BEGIN
  SELECT upper(coalesce(nullif(op_code, ''), substr(replace(id::text, '-', ''), 1, 4)))
  INTO v_op
  FROM public.maintenance_service_categories
  WHERE id = p_area_id;
  IF v_op IS NULL THEN
    v_op := upper(substr(replace(p_area_id::text, '-', ''), 1, 4));
  END IF;
  v_base := 'IMP-' || v_day || '-' || coalesce(v_op, 'AREA');
  SELECT count(*) + 1 INTO v_n
  FROM public.part_import_batch
  WHERE code LIKE v_base || '%';
  RETURN v_base || '-' || lpad(v_n::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.part_import_next_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_next_code(uuid) TO service_role;

DROP VIEW IF EXISTS public.part_import_ledger_by_area;

CREATE VIEW public.part_import_ledger_by_area AS
SELECT
  b.id,
  b.code,
  b.area_id,
  coalesce(sys.plain_name, sys.name, CASE b.import_kind
    WHEN 'vehicle_oe' THEN 'Vehicle OE numbers'
    WHEN 'part_cross_ref' THEN 'Part cross-references'
    WHEN 'platform_link' THEN 'Shared platform links'
    ELSE b.import_kind
  END) AS area_name,
  b.import_kind,
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
  (
    SELECT count(*)::int FROM public.part_fit_derived d WHERE d.import_batch_id = b.id
  ) AS matches_created,
  (
    SELECT count(*)::int FROM public.part_fit_derived d
    WHERE d.import_batch_id = b.id AND d.status = 'needs_checking'
  ) AS matches_need_checking,
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
LEFT JOIN public.maintenance_service_categories sys ON sys.id = b.area_id
LEFT JOIN auth.users pu ON pu.id = b.promoted_by
LEFT JOIN LATERAL (
  SELECT public.part_import_undo_preflight(b.id) AS pf
) pf ON b.status = 'imported';

REVOKE ALL ON public.part_import_ledger_by_area FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.part_import_ledger_by_area TO service_role;
