-- AP8 adaptation cards: enrich self_serve_part_recent with fit mode, plain words, and source host.

CREATE OR REPLACE FUNCTION public.self_serve_recent_row_enrichment(p_part_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_manufacturer text;
  v_number text;
  v_evidence text;
  v_source_type text;
  v_group uuid;
  v_type_name text;
  v_trade text;
  v_icon text;
  v_scheme text;
  v_fit_mode text := 'specific';
  v_engine_id uuid;
  v_engine_code text;
  v_spec_key text;
  v_spec_value text;
  v_listings jsonb := '[]'::jsonb;
  v_car_count int := 0;
  v_input jsonb;
  v_plain jsonb;
  v_host text;
  v_summary text;
  v_vehicle_hint text;
BEGIN
  SELECT
    pm.manufacturer,
    pm.oem_part_number,
    pm.evidence_url,
    pm.source_type,
    pm.interchange_group_id,
    coalesce(c.plain_name, c.name),
    c.trade_term,
    c.icon_key,
    coalesce(c.position_scheme, 'none')
  INTO
    v_manufacturer,
    v_number,
    v_evidence,
    v_source_type,
    v_group,
    v_type_name,
    v_trade,
    v_icon,
    v_scheme
  FROM public.part_master pm
  LEFT JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE pm.id = p_part_id;

  IF v_manufacturer IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT r.engine_family_id, ef.code
  INTO v_engine_id, v_engine_code
  FROM public.interchange_fitment_rule r
  JOIN public.engine_family ef ON ef.id = r.engine_family_id
  WHERE r.interchange_group_id = v_group
    AND r.target_kind = 'engine_family'
  ORDER BY r.id
  LIMIT 1;

  IF v_engine_id IS NOT NULL THEN
    v_fit_mode := 'engine';
    SELECT count(*)::int INTO v_car_count
    FROM public.vehicle_catalog vc
    WHERE vc.engine_family_id = v_engine_id;
  ELSE
    SELECT up.spec_key, up.spec_value
    INTO v_spec_key, v_spec_value
    FROM public.universal_part up
    WHERE up.manufacturer = v_manufacturer
      AND up.part_number = v_number
    ORDER BY up.id
    LIMIT 1;

    IF v_spec_key IS NOT NULL AND v_spec_value IS NOT NULL THEN
      v_fit_mode := 'spec';
      SELECT count(DISTINCT sv.vehicle_catalog_id)::int INTO v_car_count
      FROM public.catalog_spec_value sv
      WHERE sv.spec_key = v_spec_key
        AND btrim(sv.value) = btrim(v_spec_value);
    ELSE
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'vehicleId', pl.vehicle_catalog_id,
            'position', pl.position,
            'side', pl.side,
            'yearFrom', pl.year_from,
            'yearTo', pl.year_to
          )
          ORDER BY pl.id
        ),
        '[]'::jsonb
      )
      INTO v_listings
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group;

      SELECT count(DISTINCT pl.vehicle_catalog_id)::int INTO v_car_count
      FROM public.part_listing pl
      WHERE pl.interchange_group_id = v_group;
    END IF;
  END IF;

  v_input := jsonb_build_object(
    'fitMode', v_fit_mode,
    'brand', v_manufacturer,
    'partNumber', v_number,
    'partTypeName', coalesce(v_type_name, 'part'),
    'tradeTerm', v_trade,
    'sourceType', coalesce(v_source_type, 'other'),
    'positionScheme', v_scheme,
    'carCount', coalesce(v_car_count, 0),
    'totalReach', coalesce(v_car_count, 0)
  );

  IF v_fit_mode = 'engine' THEN
    v_input := v_input || jsonb_build_object(
      'engineFamilyId', v_engine_id,
      'engineCode', v_engine_code
    );
  ELSIF v_fit_mode = 'spec' THEN
    v_input := v_input || jsonb_build_object(
      'specKey', v_spec_key,
      'specValue', v_spec_value
    );
  ELSE
    v_input := v_input || jsonb_build_object('listings', v_listings);
  END IF;

  v_plain := public.self_serve_plain_words(v_input);

  IF v_evidence IS NOT NULL AND v_evidence ~* '^https?://' THEN
    v_host := split_part(regexp_replace(v_evidence, '^https?://', ''), '/', 1);
  END IF;

  v_summary := CASE
    WHEN coalesce(v_car_count, 0) = 1 THEN '1 car version'
    WHEN coalesce(v_car_count, 0) > 1 THEN format('%s car versions', v_car_count)
    ELSE 'No car versions yet'
  END;

  IF jsonb_typeof(v_plain->'fitSummaryLines') = 'array'
     AND jsonb_array_length(v_plain->'fitSummaryLines') > 0 THEN
    SELECT string_agg(left(line, 80), ', ' ORDER BY ord)
    INTO v_vehicle_hint
    FROM (
      SELECT value AS line, ordinality AS ord
      FROM jsonb_array_elements_text(v_plain->'fitSummaryLines') WITH ORDINALITY
      LIMIT 6
    ) sub;
  ELSIF (v_plain->'fitSummaryStructured'->>'vehicleSummary') IS NOT NULL THEN
    v_vehicle_hint := v_plain->'fitSummaryStructured'->>'vehicleSummary';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'fitMode', v_fit_mode,
    'partTypeName', v_type_name,
    'tradeTerm', v_trade,
    'iconKey', v_icon,
    'evidenceUrl', v_evidence,
    'sourceHost', v_host,
    'plainWordsSentence', v_plain->>'sentence',
    'fitSummary', v_summary,
    'reachLabel', v_summary,
    'trustLabel', v_plain->>'trustLabel',
    'vehicleHint', v_vehicle_hint
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.self_serve_part_recent(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'promotedAt' DESC), '[]'::jsonb)
  FROM (
    SELECT (
      jsonb_build_object(
        'batchId', b.id,
        'batchCode', b.code,
        'promotedAt', b.promoted_at,
        'undoEligible', b.promoted_at >= now() - interval '24 hours' AND b.status = 'imported',
        'undoReason', CASE
          WHEN b.status <> 'imported' THEN 'Already undone'
          WHEN b.promoted_at < now() - interval '24 hours' THEN 'Older than 24 hours — edit the part instead'
          ELSE NULL
        END,
        'partId', pm.id,
        'brand', pm.manufacturer,
        'partNumber', pm.oem_part_number,
        'partTypeId', pm.maintenance_component_id,
        'trustLabel', CASE pm.source_type
          WHEN 'car_maker_catalogue' THEN 'Verified · car maker''s catalogue'
          WHEN 'part_maker_catalogue' THEN 'Verified · part maker''s catalogue'
          ELSE 'Needs checking · other source'
        END
      ) || coalesce(public.self_serve_recent_row_enrichment(pm.id), '{}'::jsonb)
    ) AS row
    FROM public.part_import_batch b
    JOIN LATERAL (
      SELECT pic.row_id FROM public.part_import_change pic
      WHERE pic.batch_id = b.id AND pic.table_name = 'part_master'
      ORDER BY pic.id LIMIT 1
    ) first_part ON true
    JOIN public.part_master pm ON pm.id = first_part.row_id
    WHERE b.import_kind = 'self_serve_add' AND b.status = 'imported'
    ORDER BY b.promoted_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.self_serve_recent_row_enrichment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_recent_row_enrichment(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.self_serve_part_recent(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_part_recent(int) TO service_role;
