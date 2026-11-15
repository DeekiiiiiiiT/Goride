-- Service items S1: variant_parts_checklist without supplies; drop legacy related-supply table.

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
  v_vehicle jsonb;
  v_other jsonb;
  v_reach jsonb;
BEGIN
  WITH hits AS (
    SELECT * FROM public.parts_for_vehicle(p_catalog_id, NULL, NULL)
  ),
  na AS (
    SELECT DISTINCT ON (c.op_code)
      c.op_code, a.applicable, a.reason
    FROM public.catalog_component_applicability a
    JOIN public.maintenance_service_categories c ON c.id = a.component_id
    JOIN public.vehicle_catalog vc ON vc.id = p_catalog_id
    WHERE (
      (a.scope = 'variant' AND a.vehicle_catalog_id = vc.id)
      OR (a.scope = 'platform' AND a.platform_id = vc.platform_id)
      OR (a.scope = 'platform' AND a.platform_id = (SELECT parent_id FROM public.vehicle_platform WHERE id = vc.platform_id))
      OR (a.scope = 'engine_family' AND a.engine_family_id = vc.engine_family_id)
    )
    ORDER BY c.op_code, CASE a.scope WHEN 'variant' THEN 1 WHEN 'platform' THEN 2 ELSE 3 END
  ),
  job_hits AS (
    SELECT j.section, j.op_code, j.label, j."position", j.sort_order,
      h.tier, h.part_id, h.part_name, h.oem_part_number, h.manufacturer, h.part_kind,
      h.interchange_group_id, pm.catalog_decision, pm.evidence_url
    FROM public.guided_part_jobs() j
    LEFT JOIN public.maintenance_service_categories c ON c.op_code = j.op_code
    LEFT JOIN hits h ON h.maintenance_component_id = c.id
      AND (j."position" IS NULL OR h."position" IS NULL OR lower(h."position") = lower(j."position"))
    LEFT JOIN public.part_master pm ON pm.id = h.part_id
  ),
  rolled AS (
    SELECT section, op_code, label, "position", sort_order,
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
        'id', part_id, 'manufacturer', manufacturer, 'partNumber', oem_part_number, 'name', part_name, 'kind', part_kind
      )) FILTER (WHERE part_id IS NOT NULL), '[]'::jsonb) AS parts
    FROM job_hits
    GROUP BY section, op_code, label, "position", sort_order
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'section', section, 'opCode', op_code, 'label', label, 'position', "position",
    'status', status, 'reason', na_reason, 'groupId', group_id, 'evidenceUrl', evidence_url, 'parts', parts
  ) ORDER BY sort_order), '[]'::jsonb)
  INTO v_jobs
  FROM rolled;

  SELECT jsonb_build_object(
    'make', vc.make,
    'model', vc.model,
    'chassis', vc.chassis_code,
    'engine', ef.code,
    'engineCode', vc.engine_code,
    'years', trim(both ' ' FROM concat_ws('–', vc.production_start_year::text, vc.production_end_year::text)),
    'drive', vc.drivetrain,
    'sisterNames', (
      SELECT COALESCE(jsonb_agg(DISTINCT (sib.make || ' ' || sib.model)), '[]'::jsonb)
      FROM public.vehicle_catalog sib
      JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
      JOIN public.vehicle_platform sib_plat ON sib_plat.id = sib.platform_id
      WHERE sib.id <> vc.id
        AND mine.parent_id IS NOT NULL
        AND sib_plat.parent_id = mine.parent_id
    )
  )
  INTO v_vehicle
  FROM public.vehicle_catalog vc
  LEFT JOIN public.engine_family ef ON ef.id = vc.engine_family_id
  WHERE vc.id = p_catalog_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', category, 'parts', parts
  ) ORDER BY category), '[]'::jsonb)
  INTO v_other
  FROM (
    SELECT pc.label AS category,
      jsonb_agg(jsonb_build_object(
        'partId', pm.id,
        'name', pm.name,
        'manufacturer', pm.manufacturer,
        'partNumber', pm.oem_part_number,
        'position', pl.position,
        'groupId', pl.interchange_group_id,
        'source', pl.evidence_url
      ) ORDER BY pm.name) AS parts
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    JOIN public.part_category pc ON pc.id = pm.category_id
    WHERE pl.vehicle_catalog_id = p_catalog_id
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (
        pm.maintenance_component_id IS NULL
        OR pm.maintenance_component_id NOT IN (
          SELECT c.id FROM public.maintenance_service_categories c
          WHERE c.op_code IN (SELECT op_code FROM public.guided_part_jobs())
        )
      )
    GROUP BY pc.label
  ) grouped;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'specKey', sk.key,
    'label', sk.label,
    'unit', sk.unit,
    'value', spec.value,
    'reach', spec.scope,
    'source', spec.evidence_url
  ) ORDER BY sk.label), '[]'::jsonb)
  INTO v_specs
  FROM public.spec_key sk
  LEFT JOIN LATERAL (
    SELECT s.value, s.scope, s.evidence_url
    FROM public.specs_for_variant(p_catalog_id, NULL) s
    WHERE s.spec_key = sk.key
    LIMIT 1
  ) spec ON true;

  SELECT jsonb_build_object(
    'sisters', COALESCE(v_vehicle->'sisterNames', '[]'::jsonb),
    'engineCars', COALESCE((
      SELECT jsonb_agg(DISTINCT (other.make || ' ' || other.model || ' ' || coalesce(other.chassis_code, '')))
      FROM public.part_listing mine
      JOIN public.part_interchange_group g ON g.id = mine.interchange_group_id
      JOIN public.part_listing other_listing ON other_listing.interchange_group_id = mine.interchange_group_id
      JOIN public.vehicle_catalog other ON other.id = other_listing.vehicle_catalog_id
      JOIN public.vehicle_catalog vc ON vc.id = p_catalog_id
      WHERE mine.vehicle_catalog_id = p_catalog_id
        AND g.fit_scope = 'powertrain'
        AND other.engine_family_id = vc.engine_family_id
        AND other.id <> vc.id
    ), '[]'::jsonb)
  )
  INTO v_reach;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'specs', COALESCE(v_specs, '[]'::jsonb),
    'vehicle', COALESCE(v_vehicle, '{}'::jsonb),
    'otherParts', COALESCE(v_other, '[]'::jsonb),
    'reach', COALESCE(v_reach, '{}'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_related_supply(jsonb);
DROP TABLE IF EXISTS public.component_related_supply;

-- Exclude May-need catalog links from "used" set (setup, not real service logs).
CREATE OR REPLACE FUNCTION public.maintenance_job_used_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      ns.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey) AND a.attnum = con.conkey[1]
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'maintenance_service_categories'
      AND NOT (
        c.relname = 'maintenance_service_categories' AND a.attname = 'parent_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_section_members' AND a.attname = 'category_id'
      )
      AND NOT (
        c.relname = 'maintenance_job_relations'
        AND a.attname IN ('from_category_id', 'to_category_id')
      )
      AND NOT (
        c.relname = 'maintenance_job_item'
        AND a.attname IN ('job_id', 'part_type_id')
      )
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT %I::uuid FROM %I.%I WHERE %I IS NOT NULL',
      r.column_name,
      r.schema_name,
      r.table_name,
      r.column_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_job_used_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_job_used_ids() TO service_role;

NOTIFY pgrst, 'reload schema';
