-- Guided parts entry, not-applicable jobs, and universal specs.
-- Dominion stays master data. Fleet stock is a separate column on org_part_stock.

CREATE OR REPLACE FUNCTION public.is_engine_level_op(p_op text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(trim(coalesce(p_op, ''))) IN ('ENG-OIL', 'ENG-SPARK', 'ENG-COIL', 'ENG-THERM');
$$;

-- A verified part needs a source. Rows already verified without one stay until someone edits them.
CREATE OR REPLACE FUNCTION public.enforce_verified_part_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.catalog_decision = 'confirmed' AND coalesce(btrim(NEW.evidence_url), '') = '' THEN
    IF TG_OP = 'INSERT'
      OR OLD.catalog_decision IS DISTINCT FROM 'confirmed'
      OR coalesce(btrim(OLD.evidence_url), '') <> '' THEN
      RAISE EXCEPTION 'A verified part needs a source link';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS part_master_verified_source ON public.part_master;
CREATE TRIGGER part_master_verified_source
  BEFORE INSERT OR UPDATE ON public.part_master
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_verified_part_source();

CREATE OR REPLACE FUNCTION public.assert_group_fit_allowed(p_group uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_engine boolean;
  v_other boolean;
  v_has_parts boolean;
BEGIN
  IF p_group IS NULL THEN
    RETURN;
  END IF;
  SELECT
    bool_or(public.is_engine_level_op(c.op_code)),
    bool_or(c.id IS NOT NULL AND NOT public.is_engine_level_op(c.op_code)),
    count(pm.id) > 0
  INTO v_engine, v_other, v_has_parts
  FROM public.part_master pm
  LEFT JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE pm.interchange_group_id = p_group;

  IF EXISTS (
    SELECT 1 FROM public.interchange_fitment_rule r
    WHERE r.interchange_group_id = p_group AND r.target_kind = 'engine_family'
  ) AND (
    coalesce(v_other, false)
    OR (coalesce(v_has_parts, false) AND NOT coalesce(v_engine, false))
  ) THEN
    RAISE EXCEPTION 'All cars with this engine is only for the oil filter, spark plugs, coils, and thermostat';
  END IF;

  IF coalesce(v_engine, false) AND EXISTS (
    SELECT 1
    FROM public.interchange_fitment_rule r
    JOIN public.vehicle_catalog vc ON vc.platform_id = r.platform_id
      OR vc.platform_id IN (
        SELECT child.id FROM public.vehicle_platform child WHERE child.parent_id = r.platform_id
      )
    WHERE r.interchange_group_id = p_group
      AND r.target_kind = 'platform'
    GROUP BY r.id
    HAVING count(DISTINCT vc.engine_family_id) > 1
  ) THEN
    RAISE EXCEPTION 'This body has more than one engine. Choose the exact vehicles instead';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_group_fit_from_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_group_fit_allowed(NEW.interchange_group_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interchange_fitment_job_guard ON public.interchange_fitment_rule;
CREATE TRIGGER interchange_fitment_job_guard
  AFTER INSERT OR UPDATE ON public.interchange_fitment_rule
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_fit_from_rule();

CREATE OR REPLACE FUNCTION public.enforce_group_fit_from_part()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.interchange_group_id IS NOT NULL THEN
    PERFORM public.assert_group_fit_allowed(NEW.interchange_group_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS part_master_fit_job_guard ON public.part_master;
CREATE TRIGGER part_master_fit_job_guard
  AFTER INSERT OR UPDATE OF interchange_group_id, maintenance_component_id ON public.part_master
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_fit_from_part();

-- Engine-wide "fill the gaps" only for engine jobs, so the new guard does not reject the button.
CREATE OR REPLACE FUNCTION public.seed_in_use_engine_parts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  PERFORM public.refresh_catalog_variant_demand();
  INSERT INTO public.interchange_fitment_rule (
    interchange_group_id, target_kind, engine_family_id, source
  )
  SELECT DISTINCT g.id, 'engine_family', iu.engine_family_id, 'seed_in_use'
  FROM public.part_master pm
  JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  JOIN public.interchange_fitment_rule existing ON existing.interchange_group_id = g.id
  JOIN public.catalog_variant_demand d ON COALESCE(d.vehicle_count, 0) > 0
  JOIN public.vehicle_catalog iu
    ON iu.id = d.variant_id
   AND iu.engine_family_id IS NOT NULL
  WHERE pm.catalog_decision = 'confirmed'
    AND pm.part_kind = 'oem'
    AND g.fit_scope IN ('powertrain', 'universal')
    AND public.is_engine_level_op(c.op_code)
    AND (
      (existing.target_kind = 'catalog_variant' AND existing.vehicle_catalog_id = iu.id)
      OR (existing.target_kind = 'platform' AND existing.platform_id = iu.platform_id)
      OR (existing.target_kind = 'engine_family' AND existing.engine_family_id = iu.engine_family_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.interchange_fitment_rule r
      WHERE r.interchange_group_id = g.id
        AND r.target_kind = 'engine_family'
        AND r.engine_family_id = iu.engine_family_id
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN inserted;
END;
$$;

CREATE TABLE IF NOT EXISTS public.catalog_component_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  platform_id uuid REFERENCES public.vehicle_platform(id) ON DELETE CASCADE,
  engine_family_id uuid REFERENCES public.engine_family(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.maintenance_service_categories(id),
  applicable boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  evidence_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_component_applicability_scope_check CHECK (
    (scope = 'variant' AND vehicle_catalog_id IS NOT NULL AND platform_id IS NULL AND engine_family_id IS NULL)
    OR (scope = 'platform' AND platform_id IS NOT NULL AND vehicle_catalog_id IS NULL AND engine_family_id IS NULL)
    OR (scope = 'engine_family' AND engine_family_id IS NOT NULL AND vehicle_catalog_id IS NULL AND platform_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_applicability_variant
  ON public.catalog_component_applicability (component_id, vehicle_catalog_id)
  WHERE scope = 'variant';
CREATE UNIQUE INDEX IF NOT EXISTS catalog_applicability_platform
  ON public.catalog_component_applicability (component_id, platform_id)
  WHERE scope = 'platform';
CREATE UNIQUE INDEX IF NOT EXISTS catalog_applicability_engine
  ON public.catalog_component_applicability (component_id, engine_family_id)
  WHERE scope = 'engine_family';

CREATE TABLE IF NOT EXISTS public.spec_key (
  key text PRIMARY KEY,
  label text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('number', 'text', 'enum')),
  unit text,
  allowed_values text[],
  component_id uuid REFERENCES public.maintenance_service_categories(id)
);

CREATE TABLE IF NOT EXISTS public.catalog_spec_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_key text NOT NULL REFERENCES public.spec_key(key),
  scope text NOT NULL,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  platform_id uuid REFERENCES public.vehicle_platform(id) ON DELETE CASCADE,
  engine_family_id uuid REFERENCES public.engine_family(id) ON DELETE CASCADE,
  value text NOT NULL,
  year_from int,
  year_to int,
  evidence_url text NOT NULL,
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_spec_value_scope_check CHECK (
    (scope = 'variant' AND vehicle_catalog_id IS NOT NULL AND platform_id IS NULL AND engine_family_id IS NULL)
    OR (scope = 'platform' AND platform_id IS NOT NULL AND vehicle_catalog_id IS NULL AND engine_family_id IS NULL)
    OR (scope = 'engine_family' AND engine_family_id IS NOT NULL AND vehicle_catalog_id IS NULL AND platform_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_spec_variant
  ON public.catalog_spec_value (spec_key, vehicle_catalog_id)
  WHERE scope = 'variant';
CREATE UNIQUE INDEX IF NOT EXISTS catalog_spec_platform
  ON public.catalog_spec_value (spec_key, platform_id)
  WHERE scope = 'platform';
CREATE UNIQUE INDEX IF NOT EXISTS catalog_spec_engine
  ON public.catalog_spec_value (spec_key, engine_family_id)
  WHERE scope = 'engine_family';

CREATE TABLE IF NOT EXISTS public.universal_part (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_key text NOT NULL REFERENCES public.spec_key(key),
  spec_value text NOT NULL,
  manufacturer text NOT NULL,
  part_number text NOT NULL,
  name text NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer, part_number)
);

CREATE TABLE IF NOT EXISTS public.component_related_supply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.maintenance_service_categories(id) ON DELETE CASCADE,
  supply_name text NOT NULL,
  note text,
  UNIQUE (component_id, supply_name)
);

INSERT INTO public.spec_key (key, label, value_type, unit, component_id)
SELECT v.key, v.label, v.value_type, v.unit, c.id
FROM (VALUES
  ('engine_oil_grade', 'Engine oil grade', 'text', NULL::text, NULL::text),
  ('engine_oil_capacity_with_filter_l', 'Engine oil capacity with filter', 'number', 'L', NULL::text),
  ('wiper_driver_mm', 'Wiper, driver side', 'number', 'mm', 'LGT-WIPER'),
  ('wiper_passenger_mm', 'Wiper, passenger side', 'number', 'mm', 'LGT-WIPER'),
  ('wiper_rear_mm', 'Wiper, rear', 'number', 'mm', 'LGT-WIPER'),
  ('wiper_connector', 'Wiper connector', 'enum', NULL::text, 'LGT-WIPER'),
  ('battery_jis', 'Battery size', 'text', NULL::text, NULL::text),
  ('headlight_low_bulb', 'Headlight, low beam', 'text', NULL::text, NULL::text),
  ('headlight_high_bulb', 'Headlight, high beam', 'text', NULL::text, NULL::text),
  ('fog_bulb', 'Fog light bulb', 'text', NULL::text, NULL::text),
  ('brake_fluid', 'Brake fluid', 'text', NULL::text, NULL::text),
  ('coolant_type', 'Coolant', 'text', NULL::text, 'FLD-COOL'),
  ('transmission_fluid', 'Transmission fluid', 'text', NULL::text, 'TRN-FLUID')
) AS v(key, label, value_type, unit, op_code)
LEFT JOIN public.maintenance_service_categories c ON c.op_code = v.op_code
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    value_type = EXCLUDED.value_type,
    unit = EXCLUDED.unit,
    component_id = EXCLUDED.component_id;

UPDATE public.spec_key
SET allowed_values = ARRAY['U-hook', 'Bayonet', 'Side pin', 'Pinch tab', 'Special']
WHERE key = 'wiper_connector';

-- Candidates for "which cars", using the same year test as parts search.
CREATE OR REPLACE FUNCTION public.guided_fit_rows(
  p_variant_id uuid,
  p_fit text,
  p_year_from integer,
  p_year_to integer,
  p_ticked uuid[]
)
RETURNS TABLE (
  variant_id uuid,
  make text,
  model text,
  trim_name text,
  chassis text,
  engine text,
  production_start integer,
  production_end integer,
  included boolean,
  different_engine boolean,
  outside_years boolean,
  platform_id uuid,
  engine_family_id uuid
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_fit text := lower(trim(coalesce(p_fit, '')));
  v_src public.vehicle_catalog%ROWTYPE;
  v_root uuid;
  v_from integer;
  v_to integer;
BEGIN
  SELECT * INTO v_src FROM public.vehicle_catalog WHERE id = p_variant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That vehicle is not in the catalog';
  END IF;
  IF v_fit NOT IN ('catalog_variant', 'platform', 'engine_family') THEN
    RAISE EXCEPTION 'Choose this vehicle, this body, or this engine';
  END IF;
  v_from := COALESCE(p_year_from, v_src.production_start_year);
  v_to := COALESCE(p_year_to, v_src.production_end_year);
  IF v_fit = 'engine_family' AND v_src.engine_family_id IS NULL THEN
    RAISE EXCEPTION 'This vehicle has no engine on file';
  END IF;
  IF v_fit = 'platform' THEN
    SELECT COALESCE(p.parent_id, p.id) INTO v_root
    FROM public.vehicle_platform p
    WHERE p.id = v_src.platform_id;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT vc.*
    FROM public.vehicle_catalog vc
    LEFT JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
    WHERE (
      v_fit = 'catalog_variant' AND vc.id = v_src.id
    ) OR (
      v_fit = 'platform' AND v_root IS NOT NULL AND (vp.id = v_root OR vp.parent_id = v_root)
    ) OR (
      v_fit = 'platform' AND v_root IS NULL AND vc.id = v_src.id
    ) OR (
      v_fit = 'engine_family' AND vc.engine_family_id = v_src.engine_family_id
    )
  ),
  marked AS (
    SELECT
      c.id,
      c.make,
      c.model,
      coalesce(c.catalog_trim, c.trim_series) AS trim_name,
      c.chassis_code,
      c.engine_code,
      c.production_start_year,
      c.production_end_year,
      c.platform_id,
      c.engine_family_id,
      upper(trim(coalesce(c.engine_code, ''))) IS DISTINCT FROM upper(trim(coalesce(v_src.engine_code, ''))) AS different_engine,
      NOT (
        (v_from IS NULL OR c.production_start_year IS NULL OR c.production_start_year >= v_from)
        AND (v_to IS NULL OR c.production_start_year IS NULL OR c.production_start_year <= v_to)
      ) AS outside_years
    FROM candidates c
  )
  SELECT
    m.id,
    m.make,
    m.model,
    m.trim_name,
    m.chassis_code,
    m.engine_code,
    m.production_start_year,
    m.production_end_year,
    CASE
      WHEN p_ticked IS NOT NULL THEN m.id = ANY(p_ticked)
      WHEN v_fit = 'catalog_variant' THEN true
      WHEN v_fit = 'engine_family' THEN NOT m.outside_years
      ELSE NOT m.different_engine AND NOT m.outside_years
    END,
    m.different_engine,
    m.outside_years,
    m.platform_id,
    m.engine_family_id
  FROM marked m
  ORDER BY m.make, m.model, m.production_start_year NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_guided_fit(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_fit text := COALESCE(NULLIF(p_input->>'fit', ''), 'catalog_variant');
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_rows jsonb;
  v_included integer;
  v_total integer;
  v_engines integer;
BEGIN
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'variantId', r.variant_id,
      'make', r.make,
      'model', r.model,
      'trim', r.trim_name,
      'chassis', r.chassis,
      'engine', r.engine,
      'yearFrom', r.production_start,
      'yearTo', r.production_end,
      'included', r.included,
      'differentEngine', r.different_engine,
      'outsideYears', r.outside_years
    ) ORDER BY r.make, r.model), '[]'::jsonb),
    count(*) FILTER (WHERE r.included),
    count(*),
    count(DISTINCT upper(trim(coalesce(r.engine, ''))))
  INTO v_rows, v_included, v_total, v_engines
  FROM public.guided_fit_rows(v_variant, v_fit, v_from, v_to, v_ticked) r;

  RETURN jsonb_build_object(
    'fit', v_fit,
    'count', v_included,
    'total', v_total,
    'wholeSet', v_total > 0 AND v_included = v_total,
    'mixedEngines', v_engines > 1,
    'engineScopeAllowed', public.is_engine_level_op(v_op),
    'vehicles', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.write_guided_rules(
  p_group uuid,
  p_variant uuid,
  p_fit text,
  p_year_from integer,
  p_year_to integer,
  p_ticked uuid[],
  p_position text,
  p_op text,
  p_note text,
  p_verified_by uuid,
  p_replace boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fit text := lower(trim(coalesce(p_fit, 'catalog_variant')));
  v_src public.vehicle_catalog%ROWTYPE;
  v_root uuid;
  v_included integer;
  v_total integer;
  v_engines integer;
  v_year_blocked boolean;
  v_from integer;
  v_to integer;
  v_row record;
BEGIN
  SELECT * INTO v_src FROM public.vehicle_catalog WHERE id = p_variant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That vehicle is not in the catalog';
  END IF;
  IF v_fit = 'engine_family' AND NOT public.is_engine_level_op(p_op) THEN
    RAISE EXCEPTION 'All cars with this engine is only for the oil filter, spark plugs, coils, and thermostat';
  END IF;
  SELECT
    count(*) FILTER (WHERE included),
    count(*),
    count(DISTINCT upper(trim(coalesce(engine, '')))),
    bool_or(included AND outside_years)
  INTO v_included, v_total, v_engines, v_year_blocked
  FROM public.guided_fit_rows(p_variant, v_fit, p_year_from, p_year_to, p_ticked);
  IF COALESCE(v_included, 0) = 0 THEN
    RAISE EXCEPTION 'Pick at least one vehicle';
  END IF;
  IF p_replace THEN
    DELETE FROM public.interchange_fitment_rule WHERE interchange_group_id = p_group;
  END IF;

  v_from := p_year_from;
  v_to := p_year_to;
  IF COALESCE(v_year_blocked, false) THEN
    v_from := NULL;
    v_to := NULL;
  END IF;

  IF v_fit = 'catalog_variant' OR v_included < v_total
    OR (v_fit = 'platform' AND public.is_engine_level_op(p_op) AND v_engines > 1) THEN
    FOR v_row IN
      SELECT variant_id FROM public.guided_fit_rows(p_variant, v_fit, p_year_from, p_year_to, p_ticked)
      WHERE included
    LOOP
      IF p_replace OR NOT EXISTS (
        SELECT 1 FROM public.interchange_fitment_rule r
        WHERE r.interchange_group_id = p_group
          AND r.target_kind = 'catalog_variant'
          AND r.vehicle_catalog_id = v_row.variant_id
          AND coalesce(r."position", '') = coalesce(NULLIF(p_position, ''), '')
      ) THEN
        INSERT INTO public.interchange_fitment_rule (
          interchange_group_id, target_kind, vehicle_catalog_id, "position", source, notes, verified_by, verified_at
        ) VALUES (
          p_group, 'catalog_variant', v_row.variant_id, NULLIF(p_position, ''), 'manual',
          NULLIF(p_note, ''), p_verified_by, now()
        );
      END IF;
    END LOOP;
    RETURN;
  END IF;

  IF v_fit = 'engine_family' THEN
    IF p_replace OR NOT EXISTS (
      SELECT 1 FROM public.interchange_fitment_rule r
      WHERE r.interchange_group_id = p_group
        AND r.target_kind = 'engine_family'
        AND r.engine_family_id = v_src.engine_family_id
    ) THEN
      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, engine_family_id, year_from, year_to, "position", source, notes, verified_by, verified_at
      ) VALUES (
        p_group, 'engine_family', v_src.engine_family_id, v_from, v_to, NULLIF(p_position, ''), 'manual',
        NULLIF(p_note, ''), p_verified_by, now()
      );
    END IF;
    RETURN;
  END IF;

  SELECT COALESCE(p.parent_id, p.id) INTO v_root
  FROM public.vehicle_platform p
  WHERE p.id = v_src.platform_id;
  IF v_root IS NULL THEN
    RAISE EXCEPTION 'This vehicle has no body on file';
  END IF;
  IF p_replace OR NOT EXISTS (
    SELECT 1 FROM public.interchange_fitment_rule r
    WHERE r.interchange_group_id = p_group
      AND r.target_kind = 'platform'
      AND r.platform_id = v_root
  ) THEN
    INSERT INTO public.interchange_fitment_rule (
      interchange_group_id, target_kind, platform_id, year_from, year_to, "position", source, notes, verified_by, verified_at
    ) VALUES (
      p_group, 'platform', v_root, v_from, v_to, NULLIF(p_position, ''), 'manual',
      NULLIF(p_note, ''), p_verified_by, now()
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guided_category_id(p_op text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.part_category
  WHERE slug = CASE upper(trim(p_op))
    WHEN 'ENG-OIL' THEN 'engine-components'
    WHEN 'ENG-SPARK' THEN 'engine-components'
    WHEN 'ENG-COIL' THEN 'electrical-computers'
    WHEN 'ENG-THERM' THEN 'cooling'
    WHEN 'FILT-AIR' THEN 'engine-components'
    WHEN 'BELT-SERP' THEN 'engine-components'
    WHEN 'BRK-PADS' THEN 'brake'
    WHEN 'BRK-ROTOR' THEN 'brake'
    WHEN 'SUS-SHOCK' THEN 'suspension'
    WHEN 'LGT-WIPER' THEN 'lighting-mirrors'
    WHEN 'HVAC-CABIN' THEN 'hvac'
    ELSE NULL
  END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_fit text := COALESCE(NULLIF(p_input->>'fit', ''), 'catalog_variant');
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_note text := NULLIF(btrim(coalesce(p_input->>'note', '')), '');
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_replace boolean := NULLIF(p_input->>'groupId', '') IS NOT NULL;
  v_component uuid;
  v_category uuid;
  v_part jsonb;
  v_kind text;
  v_mfr text;
  v_number text;
  v_name text;
  v_part_id uuid;
  v_existing_group uuid;
  v_old uuid;
  v_scope text;
BEGIN
  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'Choose a vehicle';
  END IF;
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A verified part needs a source link';
  END IF;
  SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
  IF v_component IS NULL THEN
    RAISE EXCEPTION 'That job is not in the catalog';
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part number';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;

  v_category := public.guided_category_id(v_op);
  IF v_category IS NULL THEN
    SELECT id INTO v_category FROM public.part_category ORDER BY sort_order, label LIMIT 1;
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Add a parts category before saving a part';
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := NULLIF(btrim(coalesce(v_part->>'manufacturer', '')), '');
    v_number := NULLIF(btrim(coalesce(v_part->>'partNumber', '')), '');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_mfr IS NULL OR v_number IS NULL THEN
      RAISE EXCEPTION 'Each part needs a brand and a part number';
    END IF;
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    IF v_kind NOT IN ('oem', 'oe_supplier', 'aftermarket') THEN
      RAISE EXCEPTION 'Choose factory, original supplier, or other brand';
    END IF;
    SELECT pm.id, pm.interchange_group_id
    INTO v_part_id, v_existing_group
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'))
      AND pm.oem_part_number_norm <> '';
    IF v_existing_group IS NOT NULL AND v_group IS NOT NULL AND v_existing_group <> v_group THEN
      RAISE EXCEPTION 'Those part numbers are already saved under different fits. Edit each one.';
    END IF;
    IF v_group IS NULL AND v_existing_group IS NOT NULL THEN
      v_group := v_existing_group;
      v_replace := false;
    END IF;
  END LOOP;

  IF v_group IS NULL THEN
    v_scope := CASE WHEN public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'chassis' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES (
      'GD-' || v_op || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      v_op,
      v_scope
    )
    RETURNING id INTO v_group;
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := btrim(v_part->>'manufacturer');
    v_number := btrim(v_part->>'partNumber');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'));
    IF v_part_id IS NULL THEN
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, evidence_url, verified_by, verified_at,
        catalog_decision, updated_at
      ) VALUES (
        v_category, v_name, v_number, v_mfr, v_kind,
        v_group, v_component, v_evidence, v_actor, now(),
        'confirmed', now()
      )
      RETURNING id INTO v_part_id;
    ELSE
      UPDATE public.part_master
      SET name = v_name,
          part_kind = v_kind,
          interchange_group_id = v_group,
          maintenance_component_id = v_component,
          evidence_url = v_evidence,
          verified_by = v_actor,
          verified_at = now(),
          catalog_decision = 'confirmed',
          updated_at = now()
      WHERE id = v_part_id;
    END IF;
    IF coalesce(btrim(v_part->>'supersedes'), '') <> '' THEN
      SELECT pm.id INTO v_old
      FROM public.part_master pm
      WHERE pm.oem_part_number_norm = upper(regexp_replace(v_part->>'supersedes', '[^A-Za-z0-9]', '', 'g'))
        AND pm.id <> v_part_id
      LIMIT 1;
      IF v_old IS NOT NULL THEN
        INSERT INTO public.part_supersession (old_part_id, new_part_id)
        VALUES (v_old, v_part_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.write_guided_rules(
    v_group, v_variant, v_fit, v_from, v_to, v_ticked, v_position, v_op, v_note, v_actor, v_replace
  );
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
$$;

CREATE OR REPLACE FUNCTION public.rules_reach(p_group uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'variantId', vc.id,
    'make', vc.make,
    'model', vc.model,
    'chassis', vc.chassis_code,
    'engine', vc.engine_code,
    'yearFrom', vc.production_start_year,
    'yearTo', vc.production_end_year
  ) ORDER BY vc.make, vc.model), '[]'::jsonb)
  FROM public.vehicle_catalog vc
  WHERE EXISTS (
    SELECT 1
    FROM public.interchange_fitment_rule r
    LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
    WHERE r.interchange_group_id = p_group
      AND (
        (r.target_kind = 'catalog_variant' AND r.vehicle_catalog_id = vc.id)
        OR (
          r.target_kind = 'platform'
          AND (r.platform_id = vc.platform_id OR r.platform_id = mine.parent_id)
        )
        OR (r.target_kind = 'engine_family' AND r.engine_family_id = vc.engine_family_id)
      )
      AND (r.year_from IS NULL OR vc.production_start_year IS NULL OR vc.production_start_year >= r.year_from)
      AND (r.year_to IS NULL OR vc.production_start_year IS NULL OR vc.production_start_year <= r.year_to)
  );
$$;

CREATE OR REPLACE FUNCTION public.replace_guided_fit(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_before jsonb;
  v_after jsonb;
  v_op text;
  v_ticked uuid[];
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
BEGIN
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Choose the part to change';
  END IF;
  SELECT upper(c.op_code) INTO v_op
  FROM public.part_master pm
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE pm.interchange_group_id = v_group
  LIMIT 1;
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'That part has no job';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;
  v_before := public.rules_reach(v_group);
  PERFORM public.write_guided_rules(
    v_group,
    NULLIF(p_input->>'variantId', '')::uuid,
    COALESCE(NULLIF(p_input->>'fit', ''), 'catalog_variant'),
    NULLIF(p_input->>'yearFrom', '')::integer,
    NULLIF(p_input->>'yearTo', '')::integer,
    v_ticked,
    NULLIF(p_input->>'position', ''),
    v_op,
    NULLIF(p_input->>'note', ''),
    v_actor,
    true
  );
  v_after := public.rules_reach(v_group);
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'before', v_before, 'after', v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_guided_variant(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_delete boolean := COALESCE((p_input->>'deletePart')::boolean, false);
  v_rule record;
  v_other record;
  v_left integer;
BEGIN
  IF v_group IS NULL OR v_variant IS NULL THEN
    RAISE EXCEPTION 'Choose the part and the vehicle';
  END IF;
  DELETE FROM public.interchange_fitment_rule
  WHERE interchange_group_id = v_group
    AND target_kind = 'catalog_variant'
    AND vehicle_catalog_id = v_variant;

  FOR v_rule IN
    SELECT r.*
    FROM public.interchange_fitment_rule r
    JOIN public.vehicle_catalog vc ON vc.id = v_variant
    LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
    WHERE r.interchange_group_id = v_group
      AND (
        (r.target_kind = 'platform' AND (r.platform_id = vc.platform_id OR r.platform_id = mine.parent_id))
        OR (r.target_kind = 'engine_family' AND r.engine_family_id = vc.engine_family_id)
      )
      AND (r.year_from IS NULL OR vc.production_start_year IS NULL OR vc.production_start_year >= r.year_from)
      AND (r.year_to IS NULL OR vc.production_start_year IS NULL OR vc.production_start_year <= r.year_to)
  LOOP
    FOR v_other IN
      SELECT id FROM public.vehicle_catalog other
      LEFT JOIN public.vehicle_platform om ON om.id = other.platform_id
      WHERE other.id <> v_variant
        AND (
          (v_rule.target_kind = 'platform' AND (other.platform_id = v_rule.platform_id OR om.parent_id = v_rule.platform_id))
          OR (v_rule.target_kind = 'engine_family' AND other.engine_family_id = v_rule.engine_family_id)
        )
        AND (v_rule.year_from IS NULL OR other.production_start_year IS NULL OR other.production_start_year >= v_rule.year_from)
        AND (v_rule.year_to IS NULL OR other.production_start_year IS NULL OR other.production_start_year <= v_rule.year_to)
    LOOP
      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, vehicle_catalog_id, year_from, year_to, "position", source, notes
      ) VALUES (
        v_group, 'catalog_variant', v_other.id, NULL, NULL, v_rule."position", 'manual', v_rule.notes
      );
    END LOOP;
    DELETE FROM public.interchange_fitment_rule WHERE id = v_rule.id;
  END LOOP;

  SELECT count(*) INTO v_left FROM public.interchange_fitment_rule WHERE interchange_group_id = v_group;
  IF v_left = 0 AND v_delete THEN
    DELETE FROM public.part_master WHERE interchange_group_id = v_group;
    DELETE FROM public.part_interchange_group WHERE id = v_group;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'rulesLeft', v_left, 'deletedPart', v_left = 0 AND v_delete);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_component_applicability(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_scope text := COALESCE(NULLIF(p_input->>'scope', ''), 'variant');
  v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), '');
  v_src public.vehicle_catalog%ROWTYPE;
  v_component uuid;
  v_platform uuid;
  v_engine uuid;
  v_id uuid;
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Say why this is not on the car';
  END IF;
  IF v_scope NOT IN ('variant', 'platform', 'engine_family') THEN
    RAISE EXCEPTION 'Choose this vehicle, this body, or this engine';
  END IF;
  SELECT * INTO v_src FROM public.vehicle_catalog WHERE id = v_variant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That vehicle is not in the catalog';
  END IF;
  SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
  IF v_component IS NULL THEN
    RAISE EXCEPTION 'That job is not in the catalog';
  END IF;
  IF v_scope = 'platform' THEN
    SELECT COALESCE(p.parent_id, p.id) INTO v_platform
    FROM public.vehicle_platform p WHERE p.id = v_src.platform_id;
    IF v_platform IS NULL THEN
      RAISE EXCEPTION 'This vehicle has no body on file';
    END IF;
  ELSIF v_scope = 'engine_family' THEN
    v_engine := v_src.engine_family_id;
    IF v_engine IS NULL THEN
      RAISE EXCEPTION 'This vehicle has no engine on file';
    END IF;
  END IF;

  IF v_scope = 'variant' THEN
    SELECT id INTO v_id FROM public.catalog_component_applicability
    WHERE component_id = v_component AND vehicle_catalog_id = v_variant AND scope = 'variant';
  ELSIF v_scope = 'platform' THEN
    SELECT id INTO v_id FROM public.catalog_component_applicability
    WHERE component_id = v_component AND platform_id = v_platform AND scope = 'platform';
  ELSE
    SELECT id INTO v_id FROM public.catalog_component_applicability
    WHERE component_id = v_component AND engine_family_id = v_engine AND scope = 'engine_family';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.catalog_component_applicability (
      scope, vehicle_catalog_id, platform_id, engine_family_id, component_id,
      applicable, reason, evidence_url, created_by
    ) VALUES (
      v_scope,
      CASE WHEN v_scope = 'variant' THEN v_variant END,
      CASE WHEN v_scope = 'platform' THEN v_platform END,
      CASE WHEN v_scope = 'engine_family' THEN v_engine END,
      v_component,
      COALESCE((p_input->>'applicable')::boolean, false),
      v_reason,
      NULLIF(p_input->>'evidenceUrl', ''),
      NULLIF(p_input->>'createdBy', '')::uuid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.catalog_component_applicability
    SET applicable = COALESCE((p_input->>'applicable')::boolean, false),
        reason = v_reason,
        evidence_url = NULLIF(p_input->>'evidenceUrl', ''),
        created_by = COALESCE(NULLIF(p_input->>'createdBy', '')::uuid, created_by)
    WHERE id = v_id;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.guided_part_jobs()
RETURNS TABLE (section text, op_code text, label text, "position" text, sort_order integer)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    ('Engine service', 'ENG-OIL', 'Oil filter', NULL::text, 10),
    ('Engine service', 'ENG-SPARK', 'Spark plugs', NULL, 20),
    ('Engine service', 'FILT-AIR', 'Air filter', NULL, 30),
    ('Engine service', 'BELT-SERP', 'Drive belt', NULL, 40),
    ('Engine service', 'ENG-THERM', 'Thermostat', NULL, 50),
    ('Cabin', 'HVAC-CABIN', 'Cabin (A/C) filter', NULL, 60),
    ('Brakes', 'BRK-PADS', 'Front pads', 'front', 70),
    ('Brakes', 'BRK-ROTOR', 'Front rotors', 'front', 80),
    ('Brakes', 'BRK-PADS', 'Rear shoes / pads', 'rear', 90),
    ('Visibility', 'LGT-WIPER', 'Wiper, driver', 'driver', 100),
    ('Visibility', 'LGT-WIPER', 'Wiper, passenger', 'passenger', 110),
    ('Visibility', 'LGT-WIPER', 'Wiper, rear', 'rear', 120),
    ('Suspension', 'SUS-SHOCK', 'Shock, front left', 'front-left', 130),
    ('Suspension', 'SUS-SHOCK', 'Shock, front right', 'front-right', 140),
    ('Suspension', 'SUS-SHOCK', 'Shock, rear', 'rear', 150)
  ) AS v(section, op_code, label, "position", sort_order);
$$;

CREATE OR REPLACE FUNCTION public.variant_parts_checklist(p_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs jsonb;
  v_specs jsonb;
  v_supplies jsonb;
BEGIN
  WITH hits AS (
    SELECT * FROM public.parts_for_vehicle(p_catalog_id, NULL, NULL)
  ),
  na AS (
    SELECT DISTINCT ON (c.op_code)
      c.op_code,
      a.applicable,
      a.reason
    FROM public.catalog_component_applicability a
    JOIN public.maintenance_service_categories c ON c.id = a.component_id
    JOIN public.vehicle_catalog vc ON vc.id = p_catalog_id
    WHERE (
      (a.scope = 'variant' AND a.vehicle_catalog_id = vc.id)
      OR (a.scope = 'platform' AND a.platform_id = vc.platform_id)
      OR (
        a.scope = 'platform'
        AND a.platform_id = (SELECT parent_id FROM public.vehicle_platform WHERE id = vc.platform_id)
      )
      OR (a.scope = 'engine_family' AND a.engine_family_id = vc.engine_family_id)
    )
    ORDER BY c.op_code, CASE a.scope WHEN 'variant' THEN 1 WHEN 'platform' THEN 2 ELSE 3 END
  ),
  job_hits AS (
    SELECT
      j.section,
      j.op_code,
      j.label,
      j."position",
      j.sort_order,
      h.tier,
      h.part_id,
      h.part_name,
      h.oem_part_number,
      h.manufacturer,
      h.part_kind,
      h.interchange_group_id,
      pm.catalog_decision,
      pm.evidence_url
    FROM public.guided_part_jobs() j
    LEFT JOIN public.maintenance_service_categories c ON c.op_code = j.op_code
    LEFT JOIN hits h ON h.maintenance_component_id = c.id
      AND (
        j."position" IS NULL
        OR h."position" IS NULL
        OR lower(h."position") = lower(j."position")
      )
    LEFT JOIN public.part_master pm ON pm.id = h.part_id
  ),
  rolled AS (
    SELECT
      section,
      op_code,
      label,
      "position",
      sort_order,
      CASE
        WHEN bool_or(catalog_decision = 'confirmed' AND tier BETWEEN 1 AND 3) THEN 'verified'
        WHEN (SELECT na.applicable FROM na WHERE na.op_code = job_hits.op_code) = false
          AND EXISTS (SELECT 1 FROM na WHERE na.op_code = job_hits.op_code) THEN 'not_applicable'
        WHEN bool_or(part_id IS NOT NULL AND catalog_decision IS DISTINCT FROM 'rejected') THEN 'unverified'
        ELSE 'missing'
      END AS status,
      (SELECT na.reason FROM na WHERE na.op_code = job_hits.op_code) AS na_reason,
      (ARRAY_AGG(interchange_group_id ORDER BY tier NULLS LAST))[1] AS group_id,
      (ARRAY_AGG(evidence_url ORDER BY tier NULLS LAST) FILTER (WHERE evidence_url IS NOT NULL))[1] AS evidence_url,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'id', part_id,
        'manufacturer', manufacturer,
        'partNumber', oem_part_number,
        'name', part_name,
        'kind', part_kind
      )) FILTER (WHERE part_id IS NOT NULL), '[]'::jsonb) AS parts
    FROM job_hits
    GROUP BY section, op_code, label, "position", sort_order
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'section', section,
    'opCode', op_code,
    'label', label,
    'position', "position",
    'status', status,
    'reason', na_reason,
    'groupId', group_id,
    'evidenceUrl', evidence_url,
    'parts', parts
  ) ORDER BY sort_order), '[]'::jsonb)
  INTO v_jobs
  FROM rolled;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'specKey', s.spec_key,
    'label', s.label,
    'value', s.value,
    'unit', s.unit,
    'scope', s.scope,
    'sourced', s.sourced
  ) ORDER BY s.label), '[]'::jsonb)
  INTO v_specs
  FROM public.specs_for_variant(p_catalog_id, NULL) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'opCode', c.op_code,
    'name', s.supply_name,
    'note', s.note
  ) ORDER BY c.op_code, s.supply_name), '[]'::jsonb)
  INTO v_supplies
  FROM public.component_related_supply s
  JOIN public.maintenance_service_categories c ON c.id = s.component_id;

  RETURN jsonb_build_object('jobs', v_jobs, 'specs', COALESCE(v_specs, '[]'::jsonb), 'supplies', COALESCE(v_supplies, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.specs_for_variant(
  p_catalog_id uuid,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  spec_key text,
  label text,
  value text,
  unit text,
  scope text,
  evidence_url text,
  sourced boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH cat AS (
    SELECT *
    FROM public.vehicle_catalog
    WHERE id = p_catalog_id
  ),
  match_year AS (
    SELECT COALESCE(p_vehicle_year, cat.production_start_year) AS y FROM cat
  ),
  ranked AS (
    SELECT
      sv.spec_key,
      sk.label,
      sv.value,
      sk.unit,
      sv.scope,
      sv.evidence_url,
      true AS sourced,
      CASE sv.scope WHEN 'variant' THEN 1 WHEN 'platform' THEN 2 ELSE 3 END AS rank
    FROM public.catalog_spec_value sv
    JOIN public.spec_key sk ON sk.key = sv.spec_key
    CROSS JOIN cat
    CROSS JOIN match_year
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE (
      (sv.scope = 'variant' AND sv.vehicle_catalog_id = cat.id)
      OR (sv.scope = 'platform' AND (sv.platform_id = cat.platform_id OR sv.platform_id = mine.parent_id))
      OR (sv.scope = 'engine_family' AND sv.engine_family_id = cat.engine_family_id)
    )
    AND (sv.year_from IS NULL OR match_year.y IS NULL OR match_year.y >= sv.year_from)
    AND (sv.year_to IS NULL OR match_year.y IS NULL OR match_year.y <= sv.year_to)
  ),
  won AS (
    SELECT DISTINCT ON (spec_key) *
    FROM ranked
    ORDER BY spec_key, rank
  ),
  notes AS (
    SELECT n.spec_key, n.label, n.value, n.unit
    FROM cat
    CROSS JOIN LATERAL (VALUES
      ('tire_size', 'Tire size', cat.tire_size, NULL::text),
      ('bolt_pattern', 'Bolt pattern', cat.bolt_pattern, NULL::text),
      ('engine_oil_capacity_l', 'Engine oil capacity (catalog note)', cat.engine_oil_capacity_l::text, 'L'),
      ('coolant_capacity_l', 'Coolant capacity (catalog note)', cat.coolant_capacity_l::text, 'L'),
      ('brake_size_mm', 'Brake size (catalog note)', cat.brake_size_mm::text, 'mm')
    ) AS n(spec_key, label, value, unit)
    WHERE n.value IS NOT NULL AND btrim(n.value) <> ''
  )
  SELECT w.spec_key, w.label, w.value, w.unit, w.scope, w.evidence_url, w.sourced FROM won w
  UNION ALL
  SELECT n.spec_key, n.label, n.value, n.unit, 'catalog_note', NULL::text, false
  FROM notes n
  WHERE NOT EXISTS (SELECT 1 FROM won w WHERE w.spec_key = n.spec_key);
$$;

CREATE OR REPLACE FUNCTION public.universal_parts_for_variant(
  p_catalog_id uuid,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  spec_key text,
  label text,
  spec_value text,
  unit text,
  universal_part_id uuid,
  manufacturer text,
  part_number text,
  name text,
  extra jsonb
)
LANGUAGE sql
STABLE
AS $$
  WITH specs AS (
    SELECT * FROM public.specs_for_variant(p_catalog_id, p_vehicle_year)
    WHERE sourced
  ),
  conn AS (
    SELECT value FROM specs WHERE spec_key = 'wiper_connector' LIMIT 1
  )
  SELECT
    s.spec_key,
    s.label,
    s.value,
    s.unit,
    up.id,
    up.manufacturer,
    up.part_number,
    up.name,
    up.extra
  FROM specs s
  LEFT JOIN public.universal_part up
    ON up.spec_key = s.spec_key
   AND lower(btrim(up.spec_value)) = lower(btrim(s.value))
   AND (
     s.spec_key NOT LIKE 'wiper_%_mm'
     OR NOT EXISTS (SELECT 1 FROM conn)
     OR lower(coalesce(up.extra->>'connector', '')) = lower((SELECT value FROM conn))
   );
$$;

CREATE OR REPLACE FUNCTION public.universal_section_for_variant(
  p_catalog_id uuid,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'specKey', spec_key,
    'label', label,
    'value', spec_value,
    'unit', unit,
    'items', items
  ) ORDER BY label), '[]'::jsonb)
  FROM (
    SELECT
      spec_key,
      label,
      spec_value,
      unit,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', universal_part_id,
        'manufacturer', manufacturer,
        'partNumber', part_number,
        'name', name,
        'extra', extra
      ) ORDER BY manufacturer) FILTER (WHERE universal_part_id IS NOT NULL), '[]'::jsonb) AS items
    FROM public.universal_parts_for_variant(p_catalog_id, p_vehicle_year)
    GROUP BY spec_key, label, spec_value, unit
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.save_catalog_spec(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_key text := NULLIF(btrim(coalesce(p_input->>'specKey', '')), '');
  v_value text := NULLIF(btrim(coalesce(p_input->>'value', '')), '');
  v_scope text := COALESCE(NULLIF(p_input->>'scope', ''), 'variant');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_src public.vehicle_catalog%ROWTYPE;
  v_platform uuid;
  v_engine uuid;
  v_id uuid;
BEGIN
  IF v_key IS NULL OR v_value IS NULL THEN
    RAISE EXCEPTION 'Enter the spec and its value';
  END IF;
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A verified spec needs a source link';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spec_key WHERE key = v_key) THEN
    RAISE EXCEPTION 'That spec is not on the list';
  END IF;
  SELECT * INTO v_src FROM public.vehicle_catalog WHERE id = v_variant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That vehicle is not in the catalog';
  END IF;
  IF v_scope = 'platform' THEN
    SELECT COALESCE(p.parent_id, p.id) INTO v_platform FROM public.vehicle_platform p WHERE p.id = v_src.platform_id;
    IF v_platform IS NULL THEN
      RAISE EXCEPTION 'This vehicle has no body on file';
    END IF;
  ELSIF v_scope = 'engine_family' THEN
    v_engine := v_src.engine_family_id;
    IF v_engine IS NULL THEN
      RAISE EXCEPTION 'This vehicle has no engine on file';
    END IF;
  ELSIF v_scope <> 'variant' THEN
    RAISE EXCEPTION 'Choose this vehicle, this body, or this engine';
  END IF;

  IF v_scope = 'variant' THEN
    SELECT id INTO v_id FROM public.catalog_spec_value
    WHERE spec_key = v_key AND scope = 'variant' AND vehicle_catalog_id = v_variant;
  ELSIF v_scope = 'platform' THEN
    SELECT id INTO v_id FROM public.catalog_spec_value
    WHERE spec_key = v_key AND scope = 'platform' AND platform_id = v_platform;
  ELSE
    SELECT id INTO v_id FROM public.catalog_spec_value
    WHERE spec_key = v_key AND scope = 'engine_family' AND engine_family_id = v_engine;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.catalog_spec_value (
      spec_key, scope, vehicle_catalog_id, platform_id, engine_family_id,
      value, year_from, year_to, evidence_url, verified_by
    ) VALUES (
      v_key, v_scope,
      CASE WHEN v_scope = 'variant' THEN v_variant END,
      CASE WHEN v_scope = 'platform' THEN v_platform END,
      CASE WHEN v_scope = 'engine_family' THEN v_engine END,
      v_value,
      NULLIF(p_input->>'yearFrom', '')::integer,
      NULLIF(p_input->>'yearTo', '')::integer,
      v_evidence,
      NULLIF(p_input->>'verifiedBy', '')::uuid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.catalog_spec_value
    SET value = v_value,
        year_from = NULLIF(p_input->>'yearFrom', '')::integer,
        year_to = NULLIF(p_input->>'yearTo', '')::integer,
        evidence_url = v_evidence,
        verified_by = COALESCE(NULLIF(p_input->>'verifiedBy', '')::uuid, verified_by),
        verified_at = now()
    WHERE id = v_id;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_universal_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '') IS NULL THEN
    RAISE EXCEPTION 'A universal item needs a source link';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spec_key WHERE key = p_input->>'specKey') THEN
    RAISE EXCEPTION 'That spec is not on the list';
  END IF;
  INSERT INTO public.universal_part (spec_key, spec_value, manufacturer, part_number, name, extra, evidence_url)
  VALUES (
    p_input->>'specKey',
    btrim(p_input->>'specValue'),
    btrim(p_input->>'manufacturer'),
    btrim(p_input->>'partNumber'),
    COALESCE(NULLIF(btrim(coalesce(p_input->>'name', '')), ''), btrim(p_input->>'partNumber')),
    COALESCE(p_input->'extra', '{}'::jsonb),
    btrim(p_input->>'evidenceUrl')
  )
  ON CONFLICT (manufacturer, part_number) DO UPDATE
  SET spec_key = EXCLUDED.spec_key,
      spec_value = EXCLUDED.spec_value,
      name = EXCLUDED.name,
      extra = EXCLUDED.extra,
      evidence_url = EXCLUDED.evidence_url
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_related_supply(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_component uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_component
  FROM public.maintenance_service_categories
  WHERE op_code = upper(trim(coalesce(p_input->>'componentOpCode', '')));
  IF v_component IS NULL THEN
    RAISE EXCEPTION 'That job is not in the catalog';
  END IF;
  IF NULLIF(btrim(coalesce(p_input->>'supplyName', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Name the supply';
  END IF;
  INSERT INTO public.component_related_supply (component_id, supply_name, note)
  VALUES (v_component, btrim(p_input->>'supplyName'), NULLIF(btrim(coalesce(p_input->>'note', '')), ''))
  ON CONFLICT (component_id, supply_name) DO UPDATE
  SET note = EXCLUDED.note
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- Readiness: a core job is ready with a verified tier 1–3 part, a not-applicable mark, or a verified spec.
-- CASCADE: the coverage function is SQL and depends on this view.
DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness CASCADE;

CREATE MATERIALIZED VIEW public.variant_parts_readiness AS
WITH core AS (
  SELECT op_code FROM (VALUES
    ('ENG-OIL'), ('ENG-SPARK'), ('ENG-THERM'), ('FILT-AIR'), ('HVAC-CABIN'),
    ('BRK-PADS'), ('BELT-SERP'), ('LGT-WIPER'), ('BRK-ROTOR'), ('SUS-SHOCK')
  ) AS v(op_code)
),
comp AS (
  SELECT c.id, c.op_code
  FROM public.maintenance_service_categories c
  JOIN core ON core.op_code = c.op_code
),
na AS (
  SELECT DISTINCT ON (vc.id, comp.op_code)
    vc.id AS variant_id,
    comp.op_code,
    a.applicable
  FROM public.vehicle_catalog vc
  CROSS JOIN comp
  JOIN public.catalog_component_applicability a ON a.component_id = comp.id
  LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
  WHERE (
    (a.scope = 'variant' AND a.vehicle_catalog_id = vc.id)
    OR (a.scope = 'platform' AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id))
    OR (a.scope = 'engine_family' AND a.engine_family_id = vc.engine_family_id)
  )
  ORDER BY vc.id, comp.op_code, CASE a.scope WHEN 'variant' THEN 1 WHEN 'platform' THEN 2 ELSE 3 END
),
spec_hit AS (
  SELECT DISTINCT vc.id AS variant_id, c.op_code
  FROM public.vehicle_catalog vc
  JOIN public.catalog_spec_value sv ON true
  JOIN public.spec_key sk ON sk.key = sv.spec_key
  JOIN public.maintenance_service_categories c ON c.id = sk.component_id
  JOIN core ON core.op_code = c.op_code
  LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
  WHERE coalesce(btrim(sv.evidence_url), '') <> ''
    AND coalesce(btrim(sv.value), '') <> ''
    AND (
      (sv.scope = 'variant' AND sv.vehicle_catalog_id = vc.id)
      OR (sv.scope = 'platform' AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id))
      OR (sv.scope = 'engine_family' AND sv.engine_family_id = vc.engine_family_id)
    )
),
hits AS (
  SELECT
    vc.id AS variant_id,
    comp.op_code,
    bool_or(pm.catalog_decision = 'confirmed' AND p.tier BETWEEN 1 AND 3)
      OR bool_or(sh.op_code IS NOT NULL) AS verified,
    bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected' AND p.tier BETWEEN 1 AND 3) AS any_part,
    bool_or(na.applicable = false) AS not_applicable
  FROM public.vehicle_catalog vc
  CROSS JOIN comp
  LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL) p ON true
  LEFT JOIN public.part_master pm ON pm.id = p.part_id
  LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
  LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
  GROUP BY vc.id, comp.op_code
),
rolled AS (
  SELECT
    variant_id,
    count(*) FILTER (WHERE verified OR not_applicable)::int AS components_ready,
    jsonb_object_agg(
      op_code,
      CASE
        WHEN verified THEN 'verified'
        WHEN not_applicable THEN 'not_applicable'
        WHEN any_part THEN 'unverified'
        ELSE 'missing'
      END
    ) AS cells
  FROM hits
  GROUP BY variant_id
)
SELECT
  variant_id,
  components_ready,
  (components_ready = (SELECT count(*) FROM core)) AS ready,
  cells
FROM rolled;

CREATE UNIQUE INDEX variant_parts_readiness_variant_id
  ON public.variant_parts_readiness (variant_id);

REVOKE ALL ON public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.variant_parts_readiness TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_coverage_matrix()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.chassis_code,
      vc.engine_code,
      vc.platform_id,
      vc.engine_family_id,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(d.vehicle_count, 0) AS demand,
      COALESCE(d.fleet_count, 0) AS fleet_count,
      COALESCE(r.ready, false) AS ready,
      COALESCE(r.cells, '{}'::jsonb) AS cells
    FROM public.vehicle_catalog vc
    LEFT JOIN public.catalog_variant_demand d ON d.variant_id = vc.id
    LEFT JOIN public.variant_parts_readiness r ON r.variant_id = vc.id
  )
  SELECT jsonb_build_object(
    'components', jsonb_build_array(
      'ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN',
      'BRK-PADS', 'BELT-SERP', 'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK'
    ),
    'specKeys', jsonb_build_array(
      'wiper_driver_mm', 'wiper_passenger_mm', 'engine_oil_grade', 'battery_jis'
    ),
    'refreshedAt', (SELECT max(refreshed_at) FROM public.catalog_variant_demand),
    'inUseReadyPct', (
      SELECT CASE WHEN count(*) FILTER (WHERE demand > 0) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE demand > 0 AND ready) / count(*) FILTER (WHERE demand > 0), 1)
      END
      FROM base
    ),
    'allReadyPct', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE ready) / count(*), 1)
      END
      FROM base
    ),
    'variants', (
      SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'variantId', b.id,
          'make', b.make,
          'model', b.model,
          'chassisCode', b.chassis_code,
          'engineCode', b.engine_code,
          'platformId', b.platform_id,
          'engineFamilyId', b.engine_family_id,
          'yearFrom', b.production_start_year,
          'yearTo', b.production_end_year,
          'demand', b.demand,
          'fleetCount', b.fleet_count,
          'ready', b.ready,
          'cells', b.cells,
          'specCells', (
            SELECT COALESCE(jsonb_object_agg(s.spec_key, s.value), '{}'::jsonb)
            FROM public.specs_for_variant(b.id, NULL) s
            WHERE s.sourced
              AND s.spec_key IN ('wiper_driver_mm', 'wiper_passenger_mm', 'engine_oil_grade', 'battery_jis')
          )
        ) AS row_json
        FROM base b
        ORDER BY b.demand DESC, b.make, b.model
      ) s
    )
  );
$$;

ALTER TABLE public.org_part_stock
  ALTER COLUMN part_id DROP NOT NULL;

ALTER TABLE public.org_part_stock
  ADD COLUMN IF NOT EXISTS universal_part_id uuid REFERENCES public.universal_part(id) ON DELETE CASCADE;

ALTER TABLE public.org_part_stock
  DROP CONSTRAINT IF EXISTS org_part_stock_one_target;

ALTER TABLE public.org_part_stock
  ADD CONSTRAINT org_part_stock_one_target CHECK (
    (part_id IS NOT NULL AND universal_part_id IS NULL)
    OR (part_id IS NULL AND universal_part_id IS NOT NULL)
  );

DROP INDEX IF EXISTS public.org_part_stock_place;
CREATE UNIQUE INDEX IF NOT EXISTS org_part_stock_part_place
  ON public.org_part_stock (organization_id, part_id, coalesce(location, ''))
  WHERE part_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_part_stock_universal_place
  ON public.org_part_stock (organization_id, universal_part_id, coalesce(location, ''))
  WHERE universal_part_id IS NOT NULL;

ALTER TABLE public.catalog_component_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spec_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_spec_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universal_part ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_related_supply ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_component_applicability', 'spec_key', 'catalog_spec_value', 'universal_part', 'component_related_supply'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_direct', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      t || '_no_direct', t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.is_engine_level_op(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guided_fit_rows(uuid, text, integer, integer, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_guided_fit(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_guided_rules(uuid, uuid, text, integer, integer, uuid[], text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guided_category_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_guided_part(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rules_reach(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_guided_fit(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_guided_variant(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_component_applicability(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guided_part_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.variant_parts_checklist(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.specs_for_variant(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.universal_parts_for_variant(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.universal_section_for_variant(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_catalog_spec(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_universal_part(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_related_supply(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_group_fit_allowed(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_engine_level_op(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guided_fit_rows(uuid, text, integer, integer, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_guided_fit(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_guided_rules(uuid, uuid, text, integer, integer, uuid[], text, text, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.guided_category_id(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_guided_part(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.rules_reach(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_guided_fit(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_guided_variant(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_component_applicability(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guided_part_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.variant_parts_checklist(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.specs_for_variant(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.universal_parts_for_variant(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.universal_section_for_variant(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_catalog_spec(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_universal_part(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_related_supply(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_group_fit_allowed(uuid) TO service_role;
