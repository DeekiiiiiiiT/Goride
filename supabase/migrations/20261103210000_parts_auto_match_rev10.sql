-- Parts auto-matching audit Rev 10 (database section 2)
-- New migration only; do not edit 20261102210000 / 20261102220000 / 20261103180000.

DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);


-- ---------------------------------------------------------------------------
-- AM-14: part_norm_position (R = rear; side L/R; preserve side-only rows)
-- Unmapped listing/exclusion dedupe in M backfill used norm (NULL,NULL) only;
-- rows with different original position+side must not collapse together.
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.part_norm_position(text, text) IS
  'Normalize part position/side. Unmapped position tokens dedupe only when the same original position+side (AM-14 backfill was one-shot in M).';

CREATE OR REPLACE FUNCTION public.part_norm_position(
  p_position text,
  p_side text DEFAULT NULL
)
RETURNS TABLE (norm_position text, norm_side text)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_pos text := upper(btrim(coalesce(p_position, '')));
  v_side_in text := lower(btrim(coalesce(p_side, '')));
  v_out_pos text;
  v_out_side text;
BEGIN
  IF v_pos = '' THEN
    norm_position := NULL;
    norm_side := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_out_side := CASE
    WHEN v_side_in IN ('left', 'right', 'both') THEN v_side_in
    WHEN v_side_in = 'l' THEN 'left'
    WHEN v_side_in = 'r' THEN 'right'
    ELSE NULL
  END;

  IF v_pos IN ('FRONT', 'F') THEN
    v_out_pos := 'front';
  ELSIF v_pos IN ('REAR', 'R') THEN
    v_out_pos := 'rear';
  ELSIF v_pos IN ('FL', 'FRONT LEFT', 'FRONTLEFT') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('FR', 'FRONT RIGHT', 'FRONTRIGHT') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('RL', 'REAR LEFT', 'REARLEFT') THEN
    v_out_pos := 'rear';
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('RR', 'REAR RIGHT', 'REARRIGHT') THEN
    v_out_pos := 'rear';
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos IN ('L', 'LEFT') THEN
    v_out_pos := NULL;
    v_out_side := coalesce(v_out_side, 'left');
  ELSIF v_pos IN ('RIGHT') THEN
    v_out_pos := NULL;
    v_out_side := coalesce(v_out_side, 'right');
  ELSIF v_pos = 'BOTH' THEN
    v_out_pos := NULL;
    v_out_side := NULL;
  ELSIF v_pos IN ('FRONT BOTH') OR (v_pos LIKE '%FRONT%' AND v_pos LIKE '%BOTH%') THEN
    v_out_pos := 'front';
    v_out_side := coalesce(v_out_side, 'both');
  ELSE
    v_out_pos := NULL;
    v_out_side := NULL;
  END IF;

  norm_position := v_out_pos;
  norm_side := v_out_side;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_side_covers(
  p_data_position text,
  p_data_side text,
  p_query_position text,
  p_query_side text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (p_data_position IS NULL OR p_data_position IS NOT DISTINCT FROM p_query_position)
    AND (
      p_data_side IS NULL
      OR p_data_side IS NOT DISTINCT FROM p_query_side
      OR (p_data_side = 'both' AND p_query_side IN ('left', 'right'))
    );
$$;

CREATE OR REPLACE FUNCTION public.part_listing_exclusion_blocks(
  p_group uuid,
  p_car uuid,
  p_position text,
  p_side text,
  p_match_year integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = p_group
      AND ex.vehicle_catalog_id = p_car
      AND public.part_side_covers(ex.position, ex.side, p_position, p_side)
      AND (ex.year_from IS NULL OR p_match_year IS NULL OR p_match_year >= ex.year_from)
      AND (ex.year_to IS NULL OR p_match_year IS NULL OR p_match_year <= ex.year_to)
  );
$$;

ALTER TABLE public.part_listing_exclusion
  DROP CONSTRAINT IF EXISTS part_listing_exclusion_evidence_check;

ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_evidence_check
  CHECK (
    (source = 'auto_match_removed' AND btrim(coalesce(reason, '')) <> '')
    OR (source <> 'auto_match_removed' AND btrim(coalesce(evidence_url, '')) <> '')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'part_fit_derived_matched_keys_len'
      AND conrelid = 'public.part_fit_derived'::regclass
  ) THEN
    ALTER TABLE public.part_fit_derived
      ADD CONSTRAINT part_fit_derived_matched_keys_len
      CHECK (cardinality(matched_keys) <= 6);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.part_match_oe_chain(p_von_id uuid)
RETURNS TABLE (
  norm text,
  brand text,
  chain text[],
  superseded boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE walk_fwd AS (
    SELECT
      von.oe_number_norm AS norm,
      upper(von.oe_brand) AS brand,
      ARRAY[von.oe_number_norm]::text[] AS chain,
      0 AS depth,
      false AS superseded
    FROM public.vehicle_oe_number von
    WHERE von.id = p_von_id
    UNION ALL
    SELECT s.to_norm, upper(s.oe_brand), w.chain || s.to_norm, w.depth + 1, true
    FROM walk_fwd w
    JOIN public.oe_number_supersession s
      ON s.from_norm = w.norm AND upper(s.oe_brand) = w.brand
    WHERE w.depth < 5 AND NOT s.to_norm = ANY (w.chain)
  ),
  walk_bwd AS (
    SELECT
      von.oe_number_norm AS norm,
      upper(von.oe_brand) AS brand,
      ARRAY[von.oe_number_norm]::text[] AS chain,
      0 AS depth,
      false AS superseded
    FROM public.vehicle_oe_number von
    WHERE von.id = p_von_id
    UNION ALL
    SELECT s.from_norm, upper(s.oe_brand), w.chain || s.from_norm, w.depth + 1, true
    FROM walk_bwd w
    JOIN public.oe_number_supersession s
      ON s.to_norm = w.norm AND upper(s.oe_brand) = w.brand AND s.fully_interchangeable
    WHERE w.depth < 5 AND NOT s.from_norm = ANY (w.chain)
  ),
  walk AS (
    SELECT * FROM walk_fwd
    UNION ALL
    SELECT * FROM walk_bwd
  )
  SELECT DISTINCT walk.norm, walk.brand, walk.chain, walk.superseded OR walk.depth > 0
  FROM walk;
$$;

CREATE OR REPLACE FUNCTION public.part_match_group_numbers(p_group_id uuid)
RETURNS TABLE (
  interchange_group_id uuid,
  brand text,
  norm text,
  part_oe_reference_ids uuid[],
  maintenance_component_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pm.interchange_group_id,
    upper(pm.manufacturer),
    pm.oem_part_number_norm,
    ARRAY[]::uuid[],
    pm.maintenance_component_id
  FROM public.part_master pm
  WHERE pm.oem_part_number_norm IS NOT NULL AND pm.oem_part_number_norm <> ''
    AND (p_group_id IS NULL OR pm.interchange_group_id = p_group_id)
  UNION ALL
  SELECT
    pm.interchange_group_id,
    upper(por.oe_brand),
    por.oe_number_norm,
    ARRAY[por.id],
    pm.maintenance_component_id
  FROM public.part_oe_reference por
  JOIN public.part_master pm ON pm.id = por.part_id
  WHERE (p_group_id IS NULL OR pm.interchange_group_id = p_group_id);
$$;

CREATE OR REPLACE FUNCTION public.part_match_cron_next_run(p_schedule text, p_after timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_parts text[];
  v_minute text;
  v_hour text;
  v_dom text;
  v_month text;
  v_dow text;
  v_candidate timestamptz;
  v_i integer;
  v_ts timestamptz := date_trunc('minute', coalesce(p_after, now()) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  v_parts := string_to_array(coalesce(nullif(btrim(p_schedule), ''), '0 3 * * *'), ' ');
  IF array_length(v_parts, 1) < 5 THEN
    RETURN v_ts + interval '1 day';
  END IF;
  v_minute := v_parts[1];
  v_hour := v_parts[2];
  v_dom := v_parts[3];
  v_month := v_parts[4];
  v_dow := v_parts[5];

  FOR v_i IN 1..20160 LOOP
    v_candidate := v_ts + make_interval(mins => v_i);
    IF public.part_match_cron_field_matches(v_minute, extract(minute FROM v_candidate AT TIME ZONE 'UTC')::integer, 0, 59)
       AND public.part_match_cron_field_matches(v_hour, extract(hour FROM v_candidate AT TIME ZONE 'UTC')::integer, 0, 23)
       AND public.part_match_cron_field_matches(v_dom, extract(day FROM v_candidate AT TIME ZONE 'UTC')::integer, 1, 31)
       AND public.part_match_cron_field_matches(v_month, extract(month FROM v_candidate AT TIME ZONE 'UTC')::integer, 1, 12)
       AND public.part_match_cron_field_matches(v_dow, extract(dow FROM v_candidate AT TIME ZONE 'UTC')::integer, 0, 6)
    THEN
      RETURN date_trunc('minute', v_candidate);
    END IF;
  END LOOP;
  RETURN v_ts + interval '14 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_cron_field_matches(
  p_field text,
  p_value integer,
  p_min integer,
  p_max integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_part text;
  v_range text[];
  v_a integer;
  v_b integer;
BEGIN
  IF p_field IS NULL OR p_field = '*' THEN
    RETURN true;
  END IF;
  IF p_field ~ '^\*/[0-9]+$' THEN
    RETURN (p_value % substring(p_field from 3)::integer) = 0;
  END IF;
  FOREACH v_part IN ARRAY string_to_array(p_field, ',') LOOP
    v_part := btrim(v_part);
    IF v_part ~ '^[0-9]+$' AND v_part::integer = p_value THEN
      RETURN true;
    END IF;
    IF v_part ~ '^[0-9]+-[0-9]+$' THEN
      v_range := string_to_array(v_part, '-');
      v_a := v_range[1]::integer;
      v_b := v_range[2]::integer;
      IF p_value BETWEEN v_a AND v_b THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;


-- ---------------------------------------------------------------------------
-- Keep / remove: manual listings win; null evidence for auto_match_removed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.part_match_conflict_keep(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  v_derived uuid;
  v_other uuid;
  v_group uuid;
  v_manual boolean;
  v_kept_code text;
  v_other_code text;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  IF c.conflict_type = 'index_merge_proposed' THEN
    UPDATE public.part_master pm
    SET interchange_group_id = (c.detail->>'target_group_id')::uuid
    WHERE pm.id = (c.detail->>'moving_part_id')::uuid;
    INSERT INTO public.interchange_group_merge_log (
      part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
    ) VALUES (
      (c.detail->>'moving_part_id')::uuid,
      (c.detail->>'source_group_id')::uuid,
      (c.detail->>'target_group_id')::uuid,
      'index', c.matched_key, c.id, p_actor
    );
  ELSE
    v_group := c.interchange_group_id;
    SELECT ig.code INTO v_kept_code
    FROM public.part_interchange_group ig
    WHERE ig.id = v_group;
    SELECT d.id INTO v_derived
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_catalog_id = c.vehicle_catalog_id
    ORDER BY d.computed_at DESC
    LIMIT 1;
    IF v_derived IS NOT NULL THEN
      INSERT INTO public.part_listing (
        interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
        evidence_url, origin, derived_fit_id, verified_by
      )
      SELECT
        d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
        von.evidence_url,
        'auto_match_kept', d.id, p_actor
      FROM public.part_fit_derived d
      LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
      WHERE d.id = v_derived
      ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
        SET origin = EXCLUDED.origin,
            derived_fit_id = EXCLUDED.derived_fit_id
        WHERE public.part_listing.origin IS DISTINCT FROM 'manual';
    END IF;

    IF c.conflict_type = 'oe_ambiguous' AND c.detail ? 'group_ids' THEN
      FOR v_other IN
        SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
      LOOP
        IF v_other = v_group THEN CONTINUE; END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.part_listing pl
          WHERE pl.interchange_group_id = v_other
            AND pl.vehicle_catalog_id = c.vehicle_catalog_id
            AND pl.origin IN ('manual', 'import')
        ) INTO v_manual;
        SELECT ig.code INTO v_other_code
        FROM public.part_interchange_group ig
        WHERE ig.id = v_other;
        IF v_manual THEN
          UPDATE public.part_match_conflict oc
          SET status = 'superseded',
              resolution_note = format(
                'Manual fit exists on %s; both kept',
                coalesce(v_other_code, v_other::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        ELSE
          INSERT INTO public.part_listing_exclusion (
            interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by
          ) VALUES (
            v_other,
            c.vehicle_catalog_id,
            coalesce(p_note, format('Resolved by keeping %s', coalesce(v_kept_code, v_group::text))),
            NULL,
            'auto_match_removed',
            p_actor
          )
          ON CONFLICT DO NOTHING;
          UPDATE public.part_match_conflict oc
          SET status = 'removed',
              resolution_note = format(
                'Resolved by keeping %s',
                coalesce(v_kept_code, v_group::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.part_match_conflict
  SET status = 'kept', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_conflict_remove(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    reason, evidence_url, source, created_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    coalesce(p_note, 'Removed via conflict resolution'),
    NULL, 'auto_match_removed', p_actor
  FROM public.part_fit_derived d
  WHERE d.interchange_group_id = c.interchange_group_id
    AND d.vehicle_catalog_id = c.vehicle_catalog_id
  ON CONFLICT DO NOTHING;

  DELETE FROM public.part_fit_derived d
  WHERE d.interchange_group_id = c.interchange_group_id
    AND d.vehicle_catalog_id = c.vehicle_catalog_id;

  UPDATE public.part_match_conflict
  SET status = 'removed', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_derived_keep(
  p_derived_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d public.part_fit_derived%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived WHERE id = p_derived_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Derived fit not found'; END IF;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    von.evidence_url,
    'auto_match_kept', d.id, p_actor
  FROM public.part_fit_derived d
  LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
  WHERE d.id = p_derived_id
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual';
  PERFORM public.part_match_recompute(d.interchange_group_id, d.vehicle_catalog_id);
END;
$$;

-- Import dedupe: batch + part + car + normalized position/side (incl. unmapped identity)
CREATE OR REPLACE FUNCTION public.part_import_validate_postprocess(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH normed AS (
    SELECT
      r.*,
      n.norm_position,
      n.norm_side,
      coalesce(
        n.norm_position,
        '@unmapped:' || coalesce(nullif(btrim(r.raw->>'position', ''), ''), '') || '|'
          || coalesce(nullif(btrim(coalesce(r.raw->>'side', r.normalized->>'side'), ''), ''), '')
      ) AS dedupe_position,
      coalesce(n.norm_side, '') AS dedupe_side
    FROM public.part_import_row r
    CROSS JOIN LATERAL public.part_norm_position(
      r.raw->>'position',
      coalesce(r.raw->>'side', r.normalized->>'side')
    ) AS n
    WHERE r.batch_id = p_batch_id
  ),
  d AS (
    SELECT
      line_no,
      row_number() OVER (
        PARTITION BY
          upper(btrim(coalesce(raw->>'brand', raw->>'manufacturer', ''))),
          public.part_import_norm_number(coalesce(raw->>'part_number', '')),
          vehicle_catalog_id,
          dedupe_position,
          dedupe_side
        ORDER BY line_no
      ) AS rn
    FROM normed
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

CREATE OR REPLACE FUNCTION public.part_match_schedule()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schedule text;
  v_next timestamptz;
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    SELECT j.schedule INTO v_schedule
    FROM cron.job j
    WHERE j.jobname = 'part-match-nightly'
    LIMIT 1;
  END IF;

  v_schedule := coalesce(v_schedule, '0 3 * * *');
  v_next := public.part_match_cron_next_run(v_schedule, now());

  RETURN jsonb_build_object(
    'nextRun', v_next,
    'cron', v_schedule,
    'cronSchedule', v_schedule,
    'jobname', 'part-match-nightly',
    'jobName', 'part-match-nightly',
    'intervalLabel', 'Interval · ' || v_schedule
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_platforms()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'code', p.code,
          'name', p.label,
          'label', p.label,
          'maker', p.maker,
          'bodyClass', (
            SELECT lower(regexp_replace(min(vc.model), '[^a-zA-Z0-9]+', '_', 'g'))
            FROM public.vehicle_catalog vc
            WHERE vc.platform_id = p.id AND btrim(coalesce(vc.model, '')) <> ''
          ),
          'body_class', (
            SELECT lower(regexp_replace(min(vc.model), '[^a-zA-Z0-9]+', '_', 'g'))
            FROM public.vehicle_catalog vc
            WHERE vc.platform_id = p.id AND btrim(coalesce(vc.model, '')) <> ''
          ),
          'market', (
            SELECT mode() WITHIN GROUP (ORDER BY vc.market)
            FROM public.vehicle_catalog vc
            WHERE vc.platform_id = p.id AND vc.market IS NOT NULL
          ),
          'carCount', (
            SELECT count(*)::integer FROM public.vehicle_catalog vc WHERE vc.platform_id = p.id
          ),
          'linkCount', (
            SELECT count(*)::integer
            FROM public.platform_component_link l
            WHERE l.platform_a_id = p.id OR l.platform_b_id = p.id
          ),
          'car_count', (
            SELECT count(*)::integer FROM public.vehicle_catalog vc WHERE vc.platform_id = p.id
          ),
          'link_count', (
            SELECT count(*)::integer
            FROM public.platform_component_link l
            WHERE l.platform_a_id = p.id OR l.platform_b_id = p.id
          )
        )
        ORDER BY p.code
      ),
      '[]'::jsonb
    )
  )
  FROM public.vehicle_platform p;
$$;

CREATE OR REPLACE FUNCTION public.admin_platform(p_platform_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_platform jsonb;
  v_links jsonb;
  v_vehicles jsonb;
  v_body_class text;
  v_market text;
BEGIN
  SELECT to_jsonb(p.*) INTO v_platform
  FROM public.vehicle_platform p
  WHERE p.id = p_platform_id;
  IF v_platform IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    lower(regexp_replace(min(vc.model), '[^a-zA-Z0-9]+', '_', 'g')),
    mode() WITHIN GROUP (ORDER BY vc.market)
  INTO v_body_class, v_market
  FROM public.vehicle_catalog vc
  WHERE vc.platform_id = p_platform_id AND btrim(coalesce(vc.model, '')) <> '';

  v_platform := v_platform
    || jsonb_build_object('body_class', v_body_class, 'market', v_market);

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(vc.*)
      || jsonb_build_object(
        'platform_role', vc.platform_role,
        'verified_fitment_count', (
          SELECT count(*)::integer
          FROM public.part_listing pl
          WHERE pl.vehicle_catalog_id = vc.id
            AND btrim(coalesce(pl.evidence_url, '')) <> ''
        )
      )
      ORDER BY vc.make, vc.model
    ),
    '[]'::jsonb
  )
  INTO v_vehicles
  FROM public.vehicle_catalog vc
  WHERE vc.platform_id = p_platform_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'platform_a_id', l.platform_a_id,
      'platform_b_id', l.platform_b_id,
      'platform_a_code', pa.code,
      'platform_b_code', pb.code,
      'maintenance_component_id', l.maintenance_component_id,
      'position', l.position,
      'side', l.side,
      'scope', l.scope,
      'evidence_url', l.evidence_url,
      'conflict_status', CASE
        WHEN EXISTS (
          SELECT 1 FROM public.part_match_conflict c
          WHERE c.status = 'open'
            AND c.conflict_type = 'system_link'
            AND c.platform_component_link_id = l.id
        ) THEN 'open'
        ELSE NULL
      END,
      'status', CASE
        WHEN EXISTS (
          SELECT 1 FROM public.part_match_conflict c
          WHERE c.status = 'open'
            AND c.conflict_type = 'system_link'
            AND c.platform_component_link_id = l.id
        ) THEN 'conflict_open'
        WHEN btrim(l.evidence_url) <> '' THEN 'verified'
        ELSE 'needs_source'
      END
    )
  ), '[]'::jsonb)
  INTO v_links
  FROM public.platform_component_link l
  JOIN public.vehicle_platform pa ON pa.id = l.platform_a_id
  JOIN public.vehicle_platform pb ON pb.id = l.platform_b_id
  WHERE l.platform_a_id = p_platform_id OR l.platform_b_id = p_platform_id;

  RETURN jsonb_build_object(
    'platform', v_platform,
    'vehicles', v_vehicles,
    'cars', v_vehicles,
    'links', v_links,
    'car_count', jsonb_array_length(v_vehicles),
    'link_count', jsonb_array_length(v_links),
    'body_class', v_body_class,
    'market', v_market
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_catalog_completeness()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vehicleCount', (SELECT count(*)::integer FROM public.vehicle_catalog),
    'vehiclesWithOeNumbers', (
      SELECT count(DISTINCT von.vehicle_catalog_id)::integer FROM public.vehicle_oe_number von
    ),
    'platformLinkCount', (SELECT count(*)::integer FROM public.platform_component_link),
    'groups', (SELECT count(*)::integer FROM public.part_interchange_group),
    'parts', (SELECT count(*)::integer FROM public.part_master),
    'listings', (SELECT count(*)::integer FROM public.part_listing),
    'derived', (SELECT count(*)::integer FROM public.part_fit_derived),
    'openConflicts', (SELECT count(*)::integer FROM public.part_match_conflict WHERE status = 'open'),
    'unresolvedPositionReports', (
      SELECT count(*)::integer FROM public.part_norm_position_backfill_report WHERE resolved_at IS NULL
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_catalog_master_part(p_part_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group uuid;
  v_part jsonb;
  v_fits jsonb;
  v_wva text;
  v_pos text;
  v_side text;
  v_fit_count integer;
  v_members jsonb;
  v_hash text;
BEGIN
  SELECT jsonb_build_object(
    'partId', pm.id,
    'groupId', pm.interchange_group_id,
    'name', coalesce(pm.name, ''),
    'number', coalesce(pm.oem_part_number, ''),
    'brand', coalesce(pm.manufacturer, ''),
    'partType', coalesce(mc.plain_name, mc.name, ''),
    'tier', CASE
      WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
      WHEN coalesce(g.fit_scope, '') = 'powertrain'
        AND NOT EXISTS (
          SELECT 1 FROM public.part_listing listed
          WHERE listed.interchange_group_id = pm.interchange_group_id
        ) THEN 3
      ELSE 1
    END,
    'status', CASE WHEN pm.catalog_decision = 'confirmed' THEN 'verified' ELSE 'needs_checking' END,
    'evidenceUrl', coalesce(pm.evidence_url, (
      SELECT pl.evidence_url FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id
      ORDER BY pl.verified_at DESC NULLS LAST
      LIMIT 1
    )),
    'note', coalesce(pm.description, (
      SELECT pl.note FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id AND coalesce(pl.note, '') <> ''
      LIMIT 1
    ), '')
  ), pm.interchange_group_id
  INTO v_part, v_group
  FROM public.part_master pm
  LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  LEFT JOIN public.maintenance_service_categories mc ON mc.id = pm.maintenance_component_id
  WHERE pm.id = p_part_id
    AND pm.catalog_decision IS DISTINCT FROM 'rejected';

  IF v_part IS NULL THEN
    RETURN jsonb_build_object('error', 'Part not on file');
  END IF;

  SELECT pin.value INTO v_wva
  FROM public.part_index_number pin
  WHERE pin.part_id = p_part_id AND pin.index_type = 'wva'
  ORDER BY pin.created_at DESC
  LIMIT 1;

  SELECT pl.position, pl.side INTO v_pos, v_side
  FROM public.part_listing pl
  WHERE pl.interchange_group_id = v_group
  ORDER BY pl.verified_at DESC NULLS LAST, pl.created_at DESC
  LIMIT 1;

  SELECT count(DISTINCT pl.vehicle_catalog_id)::integer INTO v_fit_count
  FROM public.part_listing pl
  WHERE pl.interchange_group_id = v_group;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'partId', pm2.id,
      'number', pm2.oem_part_number,
      'brand', pm2.manufacturer,
      'name', pm2.name
    ) ORDER BY pm2.oem_part_number
  ), '[]'::jsonb)
  INTO v_members
  FROM public.part_master pm2
  WHERE pm2.interchange_group_id = v_group;

  SELECT left(md5(
    coalesce((SELECT oem_part_number_norm FROM public.part_master WHERE id = p_part_id), '')
    || '|' || coalesce(v_group::text, '')
    || '|' || coalesce((SELECT revision::text FROM public.part_interchange_group WHERE id = v_group), '0')
  ), 8)
  INTO v_hash;

  SELECT coalesce(jsonb_agg(fit ORDER BY fit->>'linkType', fit->>'make', fit->>'model'), '[]'::jsonb)
  INTO v_fits
  FROM (
    SELECT jsonb_build_object(
      'variantId', vc.id,
      'make', vc.make,
      'model', vc.model,
      'chassis', coalesce(vc.chassis_code, ''),
      'years', CASE
        WHEN pl.year_from IS NULL AND pl.year_to IS NULL THEN trim(both FROM
          coalesce(vc.production_start_year::text, '') ||
          CASE WHEN vc.production_end_year IS NULL THEN '–present' ELSE '–' || vc.production_end_year::text END
        )
        ELSE coalesce(pl.year_from::text, '') || '–' || coalesce(pl.year_to::text, 'present')
      END,
      'position', coalesce(pl.position, ''),
      'side', coalesce(pl.side, ''),
      'linkType', 'DIRECT'
    ) AS fit
    FROM public.part_listing pl
    JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
    WHERE pl.interchange_group_id = v_group
    LIMIT 40
  ) direct;

  RETURN v_part
    || jsonb_build_object(
      'wva', v_wva,
      'position', coalesce(v_pos, ''),
      'side', coalesce(v_side, ''),
      'fitCount', coalesce(v_fit_count, 0),
      'groupRevision', (SELECT ig.revision FROM public.part_interchange_group ig WHERE ig.id = v_group),
      'groupCode', (SELECT ig.code FROM public.part_interchange_group ig WHERE ig.id = v_group),
      'groupMembers', coalesce(v_members, '[]'::jsonb),
      'provenanceHash', v_hash,
      'hash', v_hash,
      'fits', coalesce(v_fits, '[]'::jsonb)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- AM-06: parts_for_vehicle (+ derived_id, side, wva, checking_note)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text,
  evidence_url text,
  match_reason_code text,
  match_reason_params jsonb,
  match_status text,
  fit_source text,
  via text,
  part_badge_code text,
  part_badge_params jsonb,
  derived_id uuid,
  side text,
  wva text,
  checking_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cat AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.platform_id,
      vc.engine_family_id,
      vc.chassis_code,
      vc.engine_code,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id
    FROM public.vehicle_platform p
    JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id
       OR p.id = mine.parent_id
       OR p.parent_id = cat.platform_id
       OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT
      pl.interchange_group_id AS group_id,
      pl.vehicle_catalog_id AS listed_id,
      pl.position,
      pl.side,
      pl.origin,
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url,
      pl.id AS listing_id
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT public.part_listing_exclusion_blocks(
      pl.interchange_group_id, cat.id, pl.position, pl.side, cat.match_year
    )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 2
        WHEN listings.fit_scope = 'powertrain'
          AND listings.listed_engine IS NOT NULL
          AND listings.listed_engine = cat.engine_family_id
          AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family))
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position, side)
      group_id,
      listing_tier,
      position,
      side,
      origin,
      fit_scope,
      listed_label,
      evidence_url,
      listing_id
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, side, listing_tier ASC, listed_id
  ),
  listing_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      bg.fit_scope,
      'listing'::text AS rule_source,
      bg.position,
      bg.group_id AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        ELSE bg.listing_tier
      END AS tier,
      bg.listed_label AS source_make,
      bg.evidence_url,
      CASE WHEN bg.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END AS fit_source,
      CASE bg.listing_tier
        WHEN 1 THEN 'direct'
        WHEN 2 THEN 'sister'
        WHEN 3 THEN 'engine'
        ELSE 'direct'
      END AS via,
      'live'::text AS match_status,
      'listed_direct'::text AS match_reason_code,
      jsonb_build_object('part_listing_id', bg.listing_id) AS match_reason_params,
      bg.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        JOIN cat ON true
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  derived_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 1 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'direct'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    JOIN cat ON cat.id = d.vehicle_catalog_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
  ),
  tier1_fits AS (
    SELECT d.interchange_group_id, d.position, d.side, d.status AS match_status,
           d.reason_code, d.reason_params, 'derived'::text AS fit_source, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE public.parts_auto_match_enabled() AND d.status IN ('live', 'needs_checking')
    UNION ALL
    SELECT pl.interchange_group_id, pl.position, pl.side, 'live'::text,
           'listed_direct'::text, jsonb_build_object('part_listing_id', pl.id),
           CASE WHEN pl.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END,
           pl.vehicle_catalog_id
    FROM public.part_listing pl
    WHERE public.parts_auto_match_enabled()
  ),
  tier1_on_car AS (
    SELECT t.* FROM tier1_fits t JOIN cat ON cat.id = t.vehicle_catalog_id
  ),
  link_tier3_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      t1.position,
      t1.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 3 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      t1.fit_source,
      'platform_link'::text AS via,
      CASE
        WHEN l.scope = 'system' OR t1.match_status = 'needs_checking' THEN 'needs_checking'
        ELSE 'live'
      END AS match_status,
      'via_platform_link'::text AS match_reason_code,
      jsonb_build_object(
        'link_id', l.id,
        'platform_code', vp.code,
        'source_vehicle_id', src.id,
        'source_tier', 1
      ) AS match_reason_params,
      t1.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM public.platform_component_link l
    JOIN cat ON true
    JOIN public.vehicle_catalog src
      ON src.platform_id = CASE
        WHEN cat.platform_id = l.platform_a_id THEN l.platform_b_id
        ELSE l.platform_a_id
      END
    JOIN public.vehicle_platform vp ON vp.id = src.platform_id
    JOIN tier1_fits t1 ON t1.vehicle_catalog_id = src.id
    JOIN public.part_master pm ON pm.interchange_group_id = t1.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND cat.platform_id IN (l.platform_a_id, l.platform_b_id)
      AND l.maintenance_component_id = pm.maintenance_component_id
      AND public.part_side_covers(l.position, l.side, t1.position, t1.side)
      AND NOT public.part_listing_exclusion_blocks(
        t1.interchange_group_id, cat.id, t1.position, t1.side, cat.match_year
      )
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
  ),
  hits AS (
    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM link_tier3_hits
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  ),
  badges AS (
    SELECT
      m.part_id,
      CASE WHEN m.rule = 'index' THEN 'index_badge' END AS part_badge_code,
      jsonb_build_object(
        'index_type', m.matched_key,
        'merge_log_id', m.id
      ) AS part_badge_params
    FROM public.interchange_group_merge_log m
    WHERE m.reversed_at IS NULL
  ),
  ranked AS (
    SELECT DISTINCT ON (h.part_id, h."position", h.side)
      h.*
    FROM hits h
    ORDER BY h.part_id, h."position", h.side, h.tier ASC, h.rule_source
  )
  SELECT
    h.tier,
    h.part_id,
    h.part_name,
    h.oem_part_number,
    h.manufacturer,
    h.part_kind,
    h.fit_scope,
    h.rule_source,
    h.position,
    h.interchange_group_id,
    h.maintenance_component_id,
    h.category_id,
    sister.names AS sister_names,
    h.source_make,
    COALESCE(oem_ref.reference_oem, h.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, h.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      WHERE f.part_id = h.part_id AND f.outcome = 'fit'
    ), 0) AS confirmed_installs,
    h.description,
    h.evidence_url,
    h.match_reason_code,
    h.match_reason_params,
    h.match_status,
    h.fit_source,
    h.via,
    b.part_badge_code,
    b.part_badge_params,
    h.derived_id,
    h.side,
    h.wva,
    h.checking_note
  FROM ranked h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id
  LEFT JOIN badges b ON b.part_id = h.part_id;
$$;

REVOKE ALL ON FUNCTION public.part_match_cron_next_run(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_cron_field_matches(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_cron_next_run(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_cron_field_matches(text, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_catalog_master_part(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_catalog_master_part(uuid) TO service_role;

-- Keep-batch: one recompute per distinct group/car after all listings
CREATE OR REPLACE FUNCTION public.part_match_derived_keep_batch(
  p_derived_ids uuid[],
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_found integer;
  v_pair record;
BEGIN
  IF p_derived_ids IS NULL OR array_length(p_derived_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one fit.';
  END IF;
  SELECT count(*) INTO v_found
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);
  IF v_found <> array_length(p_derived_ids, 1) THEN
    RAISE EXCEPTION 'Unknown derived fit';
  END IF;

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    von.evidence_url,
    'auto_match_kept', d.id, p_actor
  FROM public.part_fit_derived d
  LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual';

  FOR v_pair IN
    SELECT DISTINCT d.interchange_group_id, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.id = ANY (p_derived_ids)
  LOOP
    PERFORM public.part_match_recompute(v_pair.interchange_group_id, v_pair.vehicle_catalog_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_vehicle_oe_numbers(p_vehicle uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb;
  v_last public.part_match_recompute_log%ROWTYPE;
BEGIN
  SELECT coalesce(
    jsonb_agg(
      to_jsonb(von.*) || jsonb_build_object(
        'supersession_note', (
          SELECT CASE
            WHEN s.fully_interchangeable THEN 'Fully interchangeable with ' || s.to_norm
            ELSE 'Superseded to ' || s.to_norm
          END
          FROM public.oe_number_supersession s
          WHERE upper(s.oe_brand) = upper(von.oe_brand)
            AND s.from_norm = von.oe_number_norm
          ORDER BY s.created_at DESC
          LIMIT 1
        )
      )
      ORDER BY von.maintenance_component_id, von.position, von.side
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.vehicle_oe_number von
  WHERE von.vehicle_catalog_id = p_vehicle;

  SELECT * INTO v_last
  FROM public.part_match_recompute_log l
  WHERE l.scope_vehicle_id = p_vehicle OR l.kind = 'nightly'
  ORDER BY l.started_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'lastRun', CASE WHEN v_last.id IS NULL THEN NULL ELSE to_jsonb(v_last) END
  );
END;
$$;
