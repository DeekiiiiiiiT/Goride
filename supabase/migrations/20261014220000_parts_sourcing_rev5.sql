-- Rev 5: file the rotor and shock under the right system, and keep
-- unverified catalog numbers out of the coverage gate and out of Tier 1.

UPDATE public.maintenance_service_categories AS c
SET parent_id = 'b1000000-0000-4000-8000-000000000004'::uuid,
    icon_key = 'brakes'
WHERE c.op_code = 'BRK-ROTOR'
  AND c.kind = 'component'
  AND EXISTS (
    SELECT 1 FROM public.maintenance_service_categories s
    WHERE s.id = 'b1000000-0000-4000-8000-000000000004'::uuid
  );

UPDATE public.maintenance_service_categories AS c
SET parent_id = 'b1000000-0000-4000-8000-000000000008'::uuid,
    icon_key = 'suspension'
WHERE c.op_code = 'SUS-SHOCK'
  AND c.kind = 'component'
  AND EXISTS (
    SELECT 1 FROM public.maintenance_service_categories s
    WHERE s.id = 'b1000000-0000-4000-8000-000000000008'::uuid
  );

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS catalog_decision text NOT NULL DEFAULT 'pending';

ALTER TABLE public.part_master
  DROP CONSTRAINT IF EXISTS part_master_catalog_decision_check;

ALTER TABLE public.part_master
  ADD CONSTRAINT part_master_catalog_decision_check
  CHECK (catalog_decision IN ('pending', 'confirmed', 'rejected'));

COMMENT ON COLUMN public.part_master.catalog_decision IS
  'pending does not open the coverage gate. rejected is hidden from tiered search. confirmed counts.';

INSERT INTO public.part_category (slug, label, sort_order)
VALUES ('hvac', 'Cabin climate', 90)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_family_review (
  chassis_code text PRIMARY KEY,
  group_key text NOT NULL,
  suggested_family text NOT NULL,
  car_name text NOT NULL,
  share_body_parts boolean,
  notes text NOT NULL DEFAULT ''
);

ALTER TABLE public.platform_family_review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_family_review_no_direct_access ON public.platform_family_review;
CREATE POLICY platform_family_review_no_direct_access
  ON public.platform_family_review FOR ALL
  USING (false)
  WITH CHECK (false);

INSERT INTO public.platform_family_review (chassis_code, group_key, suggested_family, car_name, notes)
VALUES
  ('NZE141', 'nze141', 'NZE141', 'Toyota Corolla Axio', 'Leave blank until these codes share body parts.'),
  ('NZE141G', 'nze141', 'NZE141', 'Toyota Corolla Fielder', 'Do not group until share is yes.'),
  ('NKE165', 'nke165', 'NKE165', 'Toyota Corolla Axio hybrid', ''),
  ('NKE165G', 'nke165', 'NKE165', 'Toyota Corolla Fielder hybrid', ''),
  ('NZE151H', 'nze151', 'NZE151', 'Toyota Auris', ''),
  ('NZE151N', 'nze151', 'NZE151', 'Toyota Rumion', ''),
  ('CV1', 'cv1', 'CV1', 'Honda Accord', 'Stays on its own. Does not share body parts with the Delica.'),
  ('CV1W', 'cv1w', 'CV1W', 'Mitsubishi Delica D5', 'Stays on its own. Does not share body parts with the Accord.'),
  ('ZRR80G', 'r80-gas', 'R80', 'Toyota Noah gas', 'Gas Noah. Do not merge with the hybrid.'),
  ('ZRR80W', 'r80-gas', 'R80', 'Toyota Voxy gas', ''),
  ('ZWR80G', 'r80-hybrid', 'R80', 'Toyota Noah hybrid', 'Hybrid Noah. Stays separate until this row is marked yes.')
ON CONFLICT (chassis_code) DO NOTHING;

-- Confirmed OEM parts are the only ones that open the 60% gate.

CREATE OR REPLACE FUNCTION public.parts_fleet_coverage(p_vehicles jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH req AS (
    SELECT unnest(ARRAY[
      'ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN',
      'BRK-PADS', 'BELT-SERP', 'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK'
    ]) AS op_code
  ),
  needed AS (
    SELECT count(*)::int AS n FROM req
  ),
  vehicles AS (
    SELECT
      t.ordinality::int AS n,
      NULLIF(t.elem->>'organizationId', '') AS organization_id,
      CASE
        WHEN (t.elem->>'catalogId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (t.elem->>'catalogId')::uuid
        ELSE NULL
      END AS catalog_id,
      NULLIF(t.elem->>'year', '')::int AS vehicle_year
    FROM jsonb_array_elements(COALESCE(p_vehicles, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ordinality)
  ),
  cat AS (
    SELECT v.n, v.organization_id, v.vehicle_year, vc.id, vc.platform_id, vc.engine_family_id, vc.production_start_year
    FROM vehicles v
    JOIN public.vehicle_catalog vc ON vc.id = v.catalog_id
  ),
  hits AS (
    SELECT DISTINCT cat.n, c.op_code
    FROM cat
    JOIN public.maintenance_service_categories c ON c.op_code IN (SELECT op_code FROM req)
    JOIN public.part_master pm ON pm.maintenance_component_id = c.id AND pm.part_kind = 'oem'
    AND pm.catalog_decision = 'confirmed'
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    JOIN public.interchange_fitment_rule r ON r.interchange_group_id = g.id
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE (
      (r.target_kind = 'catalog_variant' AND r.vehicle_catalog_id = cat.id)
      OR (r.target_kind = 'platform' AND (r.platform_id = cat.platform_id OR r.platform_id = mine.parent_id))
      OR (
        r.target_kind = 'engine_family'
        AND r.engine_family_id = cat.engine_family_id
        AND g.fit_scope IN ('powertrain', 'universal')
      )
    )
    AND (r.year_from IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) >= r.year_from)
    AND (r.year_to IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) IS NULL OR COALESCE(cat.vehicle_year, cat.production_start_year) <= r.year_to)
  ),
  scored AS (
    SELECT v.n, v.organization_id, count(DISTINCT h.op_code)::int AS matched
    FROM vehicles v
    LEFT JOIN hits h ON h.n = v.n
    GROUP BY v.n, v.organization_id
  ),
  comp_score AS (
    SELECT
      r.op_code,
      COALESCE(MIN(c.name), r.op_code) AS name,
      (SELECT count(DISTINCT h.n)::int FROM hits h WHERE h.op_code = r.op_code) AS matched_vehicles
    FROM req r
    LEFT JOIN public.maintenance_service_categories c ON c.op_code = r.op_code
    GROUP BY r.op_code
  ),
  fleet_orgs AS (
    SELECT DISTINCT organization_id FROM vehicles WHERE organization_id IS NOT NULL
  ),
  org_gaps AS (
    SELECT o.organization_id, r.op_code
    FROM fleet_orgs o
    CROSS JOIN req r
    WHERE NOT EXISTS (
      SELECT 1
      FROM hits h
      JOIN vehicles hv ON hv.n = h.n
      WHERE hv.organization_id = o.organization_id
        AND h.op_code = r.op_code
    )
  ),
  totals AS (
    SELECT
      count(*)::int AS vehicle_count,
      count(*) FILTER (WHERE matched = (SELECT n FROM needed))::int AS covered_count
    FROM scored
  ),
  by_org AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'organizationId', organization_id,
      'vehicleCount', vehicle_count,
      'coveredCount', covered_count,
      'coveragePct', CASE WHEN vehicle_count = 0 THEN 0 ELSE round((covered_count::numeric / vehicle_count) * 100, 1) END,
      'missingOpCodes', missing_op_codes
    ) ORDER BY organization_id), '[]'::jsonb) AS items
    FROM (
      SELECT
        organization_id,
        count(*)::int AS vehicle_count,
        count(*) FILTER (WHERE matched = (SELECT n FROM needed))::int AS covered_count,
        (
          SELECT COALESCE(jsonb_agg(g.op_code ORDER BY g.op_code), '[]'::jsonb)
          FROM org_gaps g
          WHERE g.organization_id = scored.organization_id
        ) AS missing_op_codes
      FROM scored
      WHERE organization_id IS NOT NULL
      GROUP BY organization_id
    ) o
  )
  SELECT jsonb_build_object(
    'coveragePct', CASE WHEN t.vehicle_count = 0 THEN 0 ELSE round((t.covered_count::numeric / t.vehicle_count) * 100, 1) END,
    'vehicleCount', t.vehicle_count,
    'coveredCount', t.covered_count,
    'componentsRequired', (SELECT n FROM needed),
    'components', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'opCode', op_code,
        'name', name,
        'matchedVehicles', matched_vehicles
      ) ORDER BY op_code), '[]'::jsonb)
      FROM comp_score
    ),
    'missing', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'opCode', op_code,
        'name', name
      ) ORDER BY op_code), '[]'::jsonb)
      FROM comp_score
      WHERE matched_vehicles = 0
    ),
    'byOrg', b.items
  )
  FROM totals t
  CROSS JOIN by_org b;
$$;

-- Rejected catalog numbers stay out of tiered search.
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
  description text
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
      vc.production_start_year AS catalog_year,
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
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ' / ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  engine_source AS (
    SELECT min(vc.make || ' ' || vc.model) AS make
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.engine_family_id = cat.engine_family_id
    WHERE vc.engine_family_id IS NOT NULL
      AND lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  rules AS (
    SELECT r.target_kind, r.source, r."position", r.year_from, r.year_to,
           g.fit_scope, g.id AS group_id
    FROM public.interchange_fitment_rule r
    JOIN public.part_interchange_group g ON g.id = r.interchange_group_id
    CROSS JOIN cat
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE (
      (r.target_kind = 'catalog_variant' AND r.vehicle_catalog_id = cat.id)
      OR (
        r.target_kind = 'platform'
        AND (r.platform_id = cat.platform_id OR r.platform_id = mine.parent_id)
      )
      OR (
        r.target_kind = 'engine_family'
        AND r.engine_family_id = cat.engine_family_id
        AND g.fit_scope IN ('powertrain', 'universal')
      )
    )
    AND (r.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= r.year_from)
    AND (r.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= r.year_to)
  ),
  hits AS (
    SELECT pm.id AS part_id, rules.target_kind, rules.source, rules."position", rules.fit_scope, rules.group_id
    FROM rules
    JOIN public.part_master pm ON pm.interchange_group_id = rules.group_id
    UNION ALL
    SELECT pm.id, 'catalog_variant', 'legacy_fitment', NULL::text,
           COALESCE(g.fit_scope, 'chassis'), pm.interchange_group_id
    FROM public.part_fitment pf
    JOIN public.part_master pm ON pm.id = pf.part_id
    LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    CROSS JOIN cat
    WHERE pf.vehicle_catalog_id = cat.id
      AND (pf.chassis_code IS NULL OR upper(trim(pf.chassis_code)) = upper(trim(cat.chassis_code)))
      AND (pf.engine_code IS NULL OR upper(trim(pf.engine_code)) = upper(trim(cat.engine_code)))
      AND (pf.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= pf.year_from)
      AND (pf.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= pf.year_to)
  ),
  classified AS (
    SELECT
      h.part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      h.fit_scope,
      h.source AS rule_source,
      h."position",
      COALESCE(h.group_id, pm.interchange_group_id) AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        WHEN pm.part_kind = 'oem' AND (
          h.target_kind = 'catalog_variant'
          OR (
            h.target_kind IN ('platform', 'engine_family')
            AND lower(coalesce(pm.manufacturer, '')) = lower(cat.make)
          )
        ) THEN 1
        WHEN h.target_kind = 'platform' THEN 2
        WHEN h.target_kind = 'engine_family' THEN 3
        ELSE 2
      END AS tier
    FROM hits h
    JOIN public.part_master pm ON pm.id = h.part_id
    CROSS JOIN cat
    WHERE (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
  ),
  best AS (
    SELECT DISTINCT ON (part_id) *
    FROM classified
    ORDER BY part_id, tier ASC
  ),
  oem_ref AS (
    SELECT DISTINCT ON (b.interchange_group_id)
      b.interchange_group_id,
      b.oem_part_number AS reference_oem,
      b.manufacturer AS reference_manufacturer
    FROM best b
    WHERE b.part_kind = 'oem' AND b.interchange_group_id IS NOT NULL
    ORDER BY b.interchange_group_id, b.tier ASC
  )
  SELECT
    b.tier,
    b.part_id,
    b.part_name,
    b.oem_part_number,
    b.manufacturer,
    b.part_kind,
    b.fit_scope,
    b.rule_source,
    b."position",
    b.interchange_group_id,
    b.maintenance_component_id,
    b.category_id,
    sister.names AS sister_names,
    engine_source.make AS source_make,
    COALESCE(oem_ref.reference_oem, b.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, b.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = b.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      JOIN public.vehicle_catalog fv ON fv.id = f.vehicle_catalog_id
      WHERE f.part_id = b.part_id
        AND f.outcome = 'fit'
        AND (
          f.vehicle_catalog_id = cat.id
          OR (
            b.fit_scope IN ('powertrain', 'universal')
            AND fv.engine_family_id IS NOT NULL
            AND fv.engine_family_id = cat.engine_family_id
          )
          OR (
            COALESCE(b.fit_scope, '') NOT IN ('powertrain', 'universal')
            AND fv.platform_id IS NOT NULL
            AND fv.platform_id = cat.platform_id
          )
        )
    ), 0) AS confirmed_installs,
    b.description
  FROM best b
  CROSS JOIN cat
  LEFT JOIN sister ON true
  LEFT JOIN engine_source ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = b.interchange_group_id;
$$;
