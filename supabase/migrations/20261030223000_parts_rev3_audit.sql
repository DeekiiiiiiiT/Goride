-- Rev 3 parts audit. Fixes live Roomy data and the Dominion catalog APIs.
-- Does not rewrite the applied Rev 2 migrations.

-- D3: 4WD sisters share the 1KR-FE, and the chips show drive.
UPDATE public.vehicle_catalog vc
SET engine_family_id = ef.id,
    engine_code = '1KR-FE'
FROM public.engine_family ef
WHERE upper(ef.code) = '1KR-FE'
  AND upper(coalesce(vc.chassis_code, '')) IN ('M910A', 'M910S', 'M910F')
  AND lower(vc.model) IN ('tank', 'thor', 'justy')
  AND upper(coalesce(vc.engine_code, '')) IS DISTINCT FROM '1KR-VET';

UPDATE public.vehicle_catalog
SET drivetrain = '2WD'
WHERE upper(coalesce(chassis_code, '')) IN ('M900S', 'M900F')
  AND lower(model) IN ('thor', 'justy');

UPDATE public.vehicle_catalog
SET drivetrain = '4WD'
WHERE upper(coalesce(chassis_code, '')) IN ('M910A', 'M910S', 'M910F')
  AND lower(model) IN ('tank', 'thor', 'justy');

-- D2: wipers and CVT fluid reach the sister family; oil reaches the 1KR-FE only.
DO $$
DECLARE
  v_roomy uuid;
  v_row record;
BEGIN
  SELECT id INTO v_roomy
  FROM public.vehicle_catalog
  WHERE lower(make) = 'toyota'
    AND lower(model) = 'roomy'
    AND upper(coalesce(chassis_code, '')) = 'M900A'
  ORDER BY production_start_year NULLS LAST
  LIMIT 1;
  IF v_roomy IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT spec_key, value, evidence_url, scope
    FROM (
      VALUES
        ('engine_oil_grade', '0W-20', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm', 'engine_family'),
        ('engine_oil_capacity_with_filter_l', '3.1', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm', 'engine_family'),
        ('wiper_driver_mm', '525', 'https://wiper-wiper.com/2023/07/14/roomy/', 'platform'),
        ('wiper_passenger_mm', '475', 'https://wiper-wiper.com/2023/07/14/roomy/', 'platform'),
        ('wiper_rear_mm', '350', 'https://wiper-wiper.com/2023/07/14/roomy/', 'platform'),
        ('transmission_fluid', 'CVT Fluid FE', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm', 'platform')
    ) AS seed(spec_key, value, evidence_url, scope)
  LOOP
    IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = v_row.spec_key) THEN
      PERFORM public.save_catalog_spec(jsonb_build_object(
        'variantId', v_roomy,
        'specKey', v_row.spec_key,
        'value', v_row.value,
        'scope', v_row.scope,
        'evidenceUrl', v_row.evidence_url
      ));
    END IF;
  END LOOP;

  DELETE FROM public.catalog_spec_value s
  USING public.vehicle_catalog vc
  WHERE s.vehicle_catalog_id = vc.id
    AND s.scope = 'variant'
    AND lower(vc.make) = 'toyota'
    AND lower(vc.model) = 'roomy'
    AND upper(coalesce(vc.chassis_code, '')) = 'M900A'
    AND s.spec_key IN (
      'engine_oil_grade',
      'engine_oil_capacity_with_filter_l',
      'wiper_driver_mm',
      'wiper_passenger_mm',
      'wiper_rear_mm',
      'transmission_fluid'
    );
END $$;

-- D1 and D4: drop fake OEM-spec parts, fake universals, and the Union O-104 row.
DO $$
DECLARE
  v_parts uuid[];
  v_groups uuid[];
  v_universals uuid[];
  v_fk record;
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), COALESCE(array_agg(DISTINCT interchange_group_id), ARRAY[]::uuid[])
  INTO v_parts, v_groups
  FROM public.part_master
  WHERE upper(btrim(coalesce(manufacturer, ''))) = 'OEM SPEC'
     OR (
       upper(btrim(coalesce(manufacturer, ''))) = 'UNION'
       AND upper(regexp_replace(coalesce(oem_part_number, ''), '[^A-Za-z0-9]', '', 'g')) = 'O104'
     );

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_universals
  FROM public.universal_part
  WHERE upper(btrim(coalesce(manufacturer, ''))) = 'OEM SPEC'
     OR (
       upper(btrim(coalesce(manufacturer, ''))) = 'TOYOTA'
       AND upper(btrim(coalesce(part_number, ''))) IN ('0W-20', 'CVT-FE')
     );

  IF cardinality(v_parts) > 0 THEN
    FOR v_fk IN
      SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.confrelid = 'public.part_master'::regclass
        AND c.contype = 'f'
    LOOP
      EXECUTE format('DELETE FROM %s WHERE %I = ANY ($1)', v_fk.tbl, v_fk.col) USING v_parts;
    END LOOP;
    DELETE FROM public.part_master WHERE id = ANY (v_parts);
  END IF;

  IF cardinality(v_universals) > 0 THEN
    FOR v_fk IN
      SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.confrelid = 'public.universal_part'::regclass
        AND c.contype = 'f'
    LOOP
      EXECUTE format('DELETE FROM %s WHERE %I = ANY ($1)', v_fk.tbl, v_fk.col) USING v_universals;
    END LOOP;
    DELETE FROM public.universal_part WHERE id = ANY (v_universals);
  END IF;

  DELETE FROM public.part_listing pl
  WHERE pl.interchange_group_id = ANY (v_groups)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = pl.interchange_group_id
    );
  DELETE FROM public.part_listing_exclusion ex
  WHERE ex.interchange_group_id = ANY (v_groups)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = ex.interchange_group_id
    );
  DELETE FROM public.interchange_fitment_rule r
  WHERE r.interchange_group_id = ANY (v_groups)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = r.interchange_group_id
    );
  DELETE FROM public.part_interchange_group g
  WHERE g.id = ANY (v_groups)
    AND NOT EXISTS (
      SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id
    );
END $$;

ALTER TABLE public.part_master DROP CONSTRAINT IF EXISTS part_master_no_oem_spec;
ALTER TABLE public.part_master
  ADD CONSTRAINT part_master_no_oem_spec
  CHECK (upper(btrim(coalesce(manufacturer, ''))) <> 'OEM SPEC');

ALTER TABLE public.universal_part DROP CONSTRAINT IF EXISTS universal_part_no_oem_spec;
ALTER TABLE public.universal_part
  ADD CONSTRAINT universal_part_no_oem_spec
  CHECK (upper(btrim(coalesce(manufacturer, ''))) <> 'OEM SPEC');


DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness;
DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);

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
  evidence_url text
)
LANGUAGE sql
STABLE
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
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE (pl.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= pl.year_from)
      AND (pl.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= pl.year_to)
      AND NOT EXISTS (
        SELECT 1
        FROM public.part_listing_exclusion ex
        WHERE ex.interchange_group_id = pl.interchange_group_id
          AND ex.vehicle_catalog_id = cat.id
      )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          ) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          ) THEN 2
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
    SELECT DISTINCT ON (group_id, position)
      group_id,
      listing_tier,
      position,
      fit_scope,
      listed_label,
      evidence_url
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, listing_tier ASC, listed_id
  ),
  hits AS (
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
      bg.evidence_url
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
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
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
    h.evidence_url
  FROM hits h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id;
$$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

CREATE MATERIALIZED VIEW public.variant_parts_readiness AS
 WITH core AS (
         SELECT v.op_code
           FROM ( VALUES ('ENG-OIL'::text), ('ENG-SPARK'::text), ('ENG-THERM'::text), ('FILT-AIR'::text), ('HVAC-CABIN'::text), ('BRK-PADS'::text), ('BELT-SERP'::text), ('LGT-WIPER'::text), ('BRK-ROTOR'::text), ('SUS-SHOCK'::text)) v(op_code)
        ), comp AS (
         SELECT c.id,
            c.op_code
           FROM public.maintenance_service_categories c
             JOIN core ON core.op_code = c.op_code
        ), na AS (
         SELECT DISTINCT ON (vc.id, comp.op_code) vc.id AS variant_id,
            comp.op_code,
            a.applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             JOIN public.catalog_component_applicability a ON a.component_id = comp.id
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE a.scope = 'variant'::text AND a.vehicle_catalog_id = vc.id OR a.scope = 'platform'::text AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id) OR a.scope = 'engine_family'::text AND a.engine_family_id = vc.engine_family_id
          ORDER BY vc.id, comp.op_code, (
                CASE a.scope
                    WHEN 'variant'::text THEN 1
                    WHEN 'platform'::text THEN 2
                    ELSE 3
                END)
        ), spec_hit AS (
         SELECT DISTINCT vc.id AS variant_id,
            c.op_code
           FROM public.vehicle_catalog vc
             JOIN public.catalog_spec_value sv ON true
             JOIN public.spec_key sk ON sk.key = sv.spec_key
             JOIN public.maintenance_service_categories c ON c.id = sk.component_id
             JOIN core ON core.op_code = c.op_code
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE COALESCE(btrim(sv.evidence_url), ''::text) <> ''::text AND COALESCE(btrim(sv.value), ''::text) <> ''::text AND (sv.scope = 'variant'::text AND sv.vehicle_catalog_id = vc.id OR sv.scope = 'platform'::text AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id) OR sv.scope = 'engine_family'::text AND sv.engine_family_id = vc.engine_family_id)
        ), hits AS (
         SELECT vc.id AS variant_id,
            comp.op_code,
            bool_or(pm.catalog_decision = 'confirmed'::text AND p.tier >= 1 AND p.tier <= 3) OR bool_or(sh.op_code IS NOT NULL) AS verified,
            bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected'::text AND p.tier >= 1 AND p.tier <= 3) AS any_part,
            bool_or(na.applicable = false) AS not_applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL::integer) p(tier, part_id, part_name, oem_part_number, manufacturer, part_kind, fit_scope, rule_source, "position", interchange_group_id, maintenance_component_id, category_id, sister_names, source_make, reference_oem, reference_manufacturer, also_known_as, confirmed_installs, description, evidence_url) ON true
             LEFT JOIN public.part_master pm ON pm.id = p.part_id
             LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
             LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
          GROUP BY vc.id, comp.op_code
        ), rolled AS (
         SELECT hits.variant_id,
            count(*) FILTER (WHERE hits.verified OR hits.not_applicable)::integer AS components_ready,
            jsonb_object_agg(hits.op_code,
                CASE
                    WHEN hits.verified THEN 'verified'::text
                    WHEN hits.not_applicable THEN 'not_applicable'::text
                    WHEN hits.any_part THEN 'unverified'::text
                    ELSE 'missing'::text
                END) AS cells
           FROM hits
          GROUP BY hits.variant_id
        )
 SELECT variant_id,
    components_ready,
    components_ready = (( SELECT count(*) AS count
           FROM core)) AS ready,
    cells
   FROM rolled;

CREATE UNIQUE INDEX variant_parts_readiness_variant_id ON public.variant_parts_readiness USING btree (variant_id);

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_note text := NULLIF(btrim(coalesce(p_input->>'note', '')), '');
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
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
  v_listed uuid;
BEGIN
  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'Choose a vehicle';
  END IF;
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A verified part needs a source link';
  END IF;
  IF v_op <> '' THEN
    SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
    IF v_component IS NULL THEN
      RAISE EXCEPTION 'That job is not in the catalog';
    END IF;
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part number';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;

  v_category := NULLIF(p_input->>'categoryId', '')::uuid;
  IF v_category IS NULL AND v_op <> '' THEN
    v_category := public.guided_category_id(v_op);
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Choose a job or a category';
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
    IF upper(v_mfr) = 'OEM SPEC' THEN
      RAISE EXCEPTION 'OEM spec is not a brand. Enter a real brand and part number';
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
    END IF;
  END LOOP;

  IF v_group IS NULL THEN
    v_scope := CASE WHEN v_op <> '' AND public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'body' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES (
      'GD-' || COALESCE(NULLIF(v_op, ''), 'PART') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      COALESCE(NULLIF(v_op, ''), 'PART'),
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
          manufacturer = v_mfr,
          interchange_group_id = v_group,
          maintenance_component_id = COALESCE(v_component, maintenance_component_id),
          category_id = v_category,
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

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by
  ) VALUES (
    v_group, v_variant, v_position, v_from, v_to, v_evidence, v_note, v_actor
  )
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
  DO UPDATE SET
    year_from = COALESCE(EXCLUDED.year_from, part_listing.year_from),
    year_to = COALESCE(EXCLUDED.year_to, part_listing.year_to),
    evidence_url = EXCLUDED.evidence_url,
    note = EXCLUDED.note,
    verified_by = EXCLUDED.verified_by,
    verified_at = now();

  IF v_ticked IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_ticked) AS picked(id)
      JOIN public.vehicle_catalog other ON other.id = picked.id
      JOIN public.vehicle_catalog mine ON mine.id = v_variant
      WHERE lower(coalesce(other.make, '')) IS DISTINCT FROM lower(coalesce(mine.make, ''))
         OR lower(coalesce(other.model, '')) IS DISTINCT FROM lower(coalesce(mine.model, ''))
    ) THEN
      RAISE EXCEPTION 'Also listed for must be the same make and model';
    END IF;
    FOREACH v_listed IN ARRAY v_ticked
    LOOP
      IF v_listed IS DISTINCT FROM v_variant THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by
        ) VALUES (
          v_group, v_listed, v_position, v_from, v_to, v_evidence, v_note, v_actor
        )
        ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
        DO UPDATE SET
          year_from = COALESCE(EXCLUDED.year_from, part_listing.year_from),
          year_to = COALESCE(EXCLUDED.year_to, part_listing.year_to),
          evidence_url = EXCLUDED.evidence_url,
          note = EXCLUDED.note,
          verified_by = EXCLUDED.verified_by,
          verified_at = now();
      END IF;
    END LOOP;
  END IF;

  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
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
  IF v_scope = 'engine_family' AND v_key NOT LIKE 'engine_oil_%' THEN
    RAISE EXCEPTION 'Engine reach is only for oil specs';
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
        year_from = COALESCE(NULLIF(p_input->>'yearFrom', '')::integer, year_from),
        year_to = COALESCE(NULLIF(p_input->>'yearTo', '')::integer, year_to),
        evidence_url = v_evidence,
        verified_by = COALESCE(NULLIF(p_input->>'verifiedBy', '')::uuid, verified_by),
        verified_at = now()
    WHERE id = v_id;
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_catalog_spec(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_catalog_spec(jsonb) TO service_role;

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
  IF upper(btrim(coalesce(p_input->>'manufacturer', ''))) = 'OEM SPEC' THEN
    RAISE EXCEPTION 'OEM spec is not a brand. Enter a real brand and part number';
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

REVOKE ALL ON FUNCTION public.save_universal_part(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_universal_part(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_body_families()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'families', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', parent.id,
        'code', parent.code,
        'label', COALESCE(parent.label, parent.code),
        'maker', parent.maker,
        'evidenceUrl', parent.family_evidence_url,
        'members', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', child.id,
            'code', child.code,
            'maker', child.maker,
            'label', child.label,
            'cars', (
              SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', vc.id,
                'make', vc.make,
                'model', vc.model,
                'chassis', vc.chassis_code,
                'drive', vc.drivetrain,
                'engine', vc.engine_code,
                'years', trim(both ' ' FROM concat_ws('–', vc.production_start_year::text, vc.production_end_year::text)),
                'platformId', child.id
              ) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb)
              FROM public.vehicle_catalog vc
              WHERE vc.platform_id = child.id
            )
          ) ORDER BY child.maker, child.code), '[]'::jsonb)
          FROM public.vehicle_platform child
          WHERE child.parent_id = parent.id
        )
      ) ORDER BY parent.label)
      FROM public.vehicle_platform parent
      WHERE parent.parent_id IS NULL
        AND EXISTS (SELECT 1 FROM public.vehicle_platform c WHERE c.parent_id = parent.id)
    ), '[]'::jsonb),
    'unassigned', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vp.id,
        'code', vp.code,
        'maker', vp.maker,
        'label', vp.label,
        'cars', (
          SELECT count(*) FROM public.vehicle_catalog vc WHERE vc.platform_id = vp.id
        )
      ) ORDER BY vp.maker, vp.code)
      FROM public.vehicle_platform vp
      WHERE vp.parent_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.vehicle_platform c WHERE c.parent_id = vp.id)
    ), '[]'::jsonb),
    'engines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ef.id,
        'code', ef.code,
        'displacementCc', ef.displacement_cc,
        'fuel', ef.fuel_type,
        'cars', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', vc.id,
            'make', vc.make,
            'model', vc.model,
            'chassis', vc.chassis_code
          ) ORDER BY vc.make, vc.model), '[]'::jsonb)
          FROM public.vehicle_catalog vc
          WHERE vc.engine_family_id = ef.id
        )
      ) ORDER BY ef.code)
      FROM public.engine_family ef
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_save_body_family(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := NULLIF(btrim(coalesce(p_input->>'label', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_reason text := NULLIF(btrim(coalesce(p_input->>'reason', '')), '');
  v_family uuid := NULLIF(p_input->>'familyId', '')::uuid;
  v_action text := COALESCE(NULLIF(lower(btrim(coalesce(p_input->>'action', ''))), ''), 'add');
  v_dry boolean := COALESCE((p_input->>'dryRun')::boolean, false);
  v_move boolean := COALESCE((p_input->>'move')::boolean, false);
  v_leave text;
  v_platform uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A sister family needs a source link';
  END IF;
  IF v_action NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Choose add or remove';
  END IF;
  IF v_label IS NULL AND v_family IS NULL AND v_action = 'add' THEN
    RAISE EXCEPTION 'Name the sister family';
  END IF;
  IF v_family IS NULL AND v_action = 'remove' THEN
    RAISE EXCEPTION 'Choose the sister family';
  END IF;

  SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
  INTO v_ids
  FROM jsonb_array_elements_text(COALESCE(p_input->'platformIds', '[]'::jsonb)) AS value;

  IF EXISTS (
    SELECT 1
    FROM public.vehicle_platform vp
    WHERE vp.id = ANY(v_ids)
      AND (
        vp.maker = 'family'
        OR EXISTS (SELECT 1 FROM public.vehicle_platform child WHERE child.parent_id = vp.id)
      )
  ) THEN
    RAISE EXCEPTION 'A family cannot be a member of a family';
  END IF;

  IF v_action = 'add' AND NOT v_move THEN
    SELECT string_agg(DISTINCT COALESCE(fam.label, fam.code), ', ')
    INTO v_leave
    FROM public.vehicle_platform vp
    JOIN public.vehicle_platform fam ON fam.id = vp.parent_id
    WHERE vp.id = ANY(v_ids)
      AND vp.parent_id IS NOT NULL
      AND (v_family IS NULL OR vp.parent_id IS DISTINCT FROM v_family);
    IF v_leave IS NOT NULL THEN
      RAISE EXCEPTION 'That body leaves %', v_leave;
    END IF;
  END IF;

  IF v_family IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code
    ) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb)
    INTO v_before
    FROM public.vehicle_catalog vc
    JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
    WHERE vp.id = v_family OR vp.parent_id = v_family;
  ELSE
    v_before := '[]'::jsonb;
  END IF;

  IF v_dry THEN
    IF v_action = 'remove' THEN
      SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'make', row_data->>'model', row_data->>'chassis'), '[]'::jsonb)
      INTO v_after
      FROM (
        SELECT jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) AS row_data
        FROM public.vehicle_catalog vc
        JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
        WHERE (vp.id = v_family OR vp.parent_id = v_family)
          AND NOT (vp.id = ANY(v_ids))
      ) listed;
    ELSE
      SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'make', row_data->>'model', row_data->>'chassis'), '[]'::jsonb)
      INTO v_after
      FROM (
        SELECT DISTINCT jsonb_build_object('make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code) AS row_data
        FROM public.vehicle_catalog vc
        JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
        WHERE vp.parent_id = v_family
           OR vp.id = ANY(v_ids)
           OR (v_family IS NOT NULL AND vp.id = v_family)
      ) listed;
    END IF;
    RETURN jsonb_build_object(
      'familyId', v_family,
      'dryRun', true,
      'before', jsonb_array_length(v_before),
      'after', jsonb_array_length(v_after),
      'beforeCars', v_before,
      'afterCars', v_after
    );
  END IF;

  IF v_family IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label, maker, notes, family_evidence_url)
    VALUES (
      left(regexp_replace(upper(v_label), '[^A-Z0-9]+', '-', 'g'), 40) || '-FAMILY',
      v_label,
      'family',
      COALESCE(v_reason, 'Sister family'),
      v_evidence
    )
    RETURNING id INTO v_family;
  ELSIF v_reason IS NOT NULL THEN
    UPDATE public.vehicle_platform SET notes = v_reason WHERE id = v_family;
  END IF;

  FOREACH v_platform IN ARRAY v_ids
  LOOP
    IF v_action = 'remove' THEN
      UPDATE public.vehicle_platform
      SET parent_id = NULL,
          family_evidence_url = NULL
      WHERE id = v_platform
        AND parent_id = v_family;
    ELSE
      UPDATE public.vehicle_platform
      SET parent_id = v_family,
          family_evidence_url = v_evidence
      WHERE id = v_platform
        AND id <> v_family;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'make', vc.make, 'model', vc.model, 'chassis', vc.chassis_code
  ) ORDER BY vc.make, vc.model, vc.chassis_code), '[]'::jsonb)
  INTO v_after
  FROM public.vehicle_catalog vc
  JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
  WHERE vp.id = v_family OR vp.parent_id = v_family;

  RETURN jsonb_build_object(
    'familyId', v_family,
    'dryRun', false,
    'before', jsonb_array_length(v_before),
    'after', jsonb_array_length(v_after),
    'beforeCars', v_before,
    'afterCars', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.listing_reach_preview(
  p_variant uuid,
  p_scope text,
  p_ticked uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH listed AS (
    SELECT vc.id, vc.make, vc.model, vc.chassis_code, vc.engine_family_id, vc.platform_id
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_variant
       OR vc.id = ANY (COALESCE(p_ticked, ARRAY[]::uuid[]))
  ),
  family AS (
    SELECT cat.id AS cat_id, p.id AS platform_id
    FROM public.vehicle_catalog cat
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    JOIN public.vehicle_platform p ON p.id = cat.platform_id
      OR p.id = mine.parent_id
      OR p.parent_id = cat.platform_id
      OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  scored AS (
    SELECT
      cat.id,
      trim(both ' ' FROM concat_ws(' ', cat.make, cat.model, cat.chassis_code)) AS label,
      MIN(
        CASE
          WHEN listed.id = cat.id THEN 1
          WHEN lower(listed.make) = lower(cat.make)
            AND lower(listed.model) = lower(cat.model)
            AND upper(trim(coalesce(listed.chassis_code, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
            AND (
              coalesce(p_scope, 'body') IS DISTINCT FROM 'powertrain'
              OR listed.engine_family_id IS NOT DISTINCT FROM cat.engine_family_id
            ) THEN 1
          WHEN EXISTS (
            SELECT 1 FROM family f
            WHERE f.cat_id = cat.id AND f.platform_id = listed.platform_id
          )
            AND (
              coalesce(p_scope, 'body') IS DISTINCT FROM 'powertrain'
              OR listed.engine_family_id IS NOT DISTINCT FROM cat.engine_family_id
            ) THEN 2
          WHEN coalesce(p_scope, '') = 'powertrain'
            AND listed.engine_family_id IS NOT NULL
            AND listed.engine_family_id = cat.engine_family_id
            AND NOT EXISTS (
              SELECT 1 FROM family f
              WHERE f.cat_id = cat.id AND f.platform_id = listed.platform_id
            ) THEN 3
          ELSE NULL
        END
      ) AS tier
    FROM public.vehicle_catalog cat
    JOIN listed ON true
    GROUP BY cat.id, cat.make, cat.model, cat.chassis_code
  )
  SELECT jsonb_build_object(
    'sister', COALESCE((
      SELECT jsonb_agg(label ORDER BY label) FROM scored WHERE tier = 2
    ), '[]'::jsonb),
    'engine', COALESCE((
      SELECT jsonb_agg(label ORDER BY label) FROM scored WHERE tier = 3
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.listing_reach_preview(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_reach_preview(uuid, text, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.guided_part_group(p_group uuid, p_variant uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'groupId', p_group,
    'componentOpCode', (
      SELECT c.op_code
      FROM public.part_master pm
      JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
      WHERE pm.interchange_group_id = p_group
      LIMIT 1
    ),
    'categoryId', (
      SELECT pm.category_id FROM public.part_master pm WHERE pm.interchange_group_id = p_group LIMIT 1
    ),
    'position', pl.position,
    'yearFrom', pl.year_from,
    'yearTo', pl.year_to,
    'evidenceUrl', pl.evidence_url,
    'note', pl.note,
    'productionStartYear', vc.production_start_year,
    'productionEndYear', vc.production_end_year,
    'brands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'manufacturer', pm.manufacturer,
        'partNumber', pm.oem_part_number,
        'name', pm.name,
        'kind', CASE pm.part_kind
          WHEN 'oem' THEN 'factory'
          WHEN 'oe_supplier' THEN 'supplier'
          ELSE 'other'
        END
      ) ORDER BY pm.manufacturer)
      FROM public.part_master pm
      WHERE pm.interchange_group_id = p_group
        AND pm.catalog_decision IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb),
    'listedVariantIds', COALESCE((
      SELECT jsonb_agg(l.vehicle_catalog_id)
      FROM public.part_listing l
      WHERE l.interchange_group_id = p_group
    ), '[]'::jsonb)
  )
  FROM public.vehicle_catalog vc
  LEFT JOIN public.part_listing pl
    ON pl.interchange_group_id = p_group
   AND pl.vehicle_catalog_id = vc.id
  WHERE vc.id = p_variant;
$$;

REVOKE ALL ON FUNCTION public.guided_part_group(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guided_part_group(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_recent_import_batches()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.imported_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      pl.import_batch_id,
      count(*)::integer AS row_count,
      max(pl.verified_at) AS imported_at
    FROM public.part_listing pl
    WHERE pl.import_batch_id IS NOT NULL
    GROUP BY pl.import_batch_id
    ORDER BY max(pl.verified_at) DESC
    LIMIT 5
  ) s;
$$;

REVOKE ALL ON FUNCTION public.admin_recent_import_batches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_import_batches() TO service_role;

REVOKE ALL ON FUNCTION public.admin_body_families() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_save_body_family(jsonb) FROM PUBLIC, anon, authenticated;
