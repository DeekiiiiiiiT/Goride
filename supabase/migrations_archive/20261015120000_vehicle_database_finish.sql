-- Vehicle database finish: seed source, class-aware schedules, stored readiness,
-- two-fleet signals with no customer wording, and a nightly refresh.

ALTER TABLE public.interchange_fitment_rule
  DROP CONSTRAINT IF EXISTS interchange_fitment_rule_source_check;

ALTER TABLE public.interchange_fitment_rule
  ADD CONSTRAINT interchange_fitment_rule_source_check
  CHECK (source IN ('manual', 'oem_catalog', 'supplier', 'install_confirmed', 'import', 'seed_in_use'));

-- p_vehicle_year stays so existing callers keep working. Schedules have no year range.
CREATE OR REPLACE FUNCTION public.schedule_for_variant(
  p_catalog_id uuid,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  template_id uuid,
  task_code text,
  task_name text,
  template_scope text,
  component_id uuid,
  component_op_code text,
  interval_miles numeric,
  interval_months integer,
  platform_id uuid,
  engine_family_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cat AS (
    SELECT
      id,
      platform_id,
      engine_family_id,
      lower(trim(coalesce(vehicle_class, 'car'))) AS vehicle_class
    FROM public.vehicle_catalog
    WHERE id = p_catalog_id
  ),
  mine AS (
    SELECT p.parent_id
    FROM public.vehicle_platform p
    JOIN cat ON p.id = cat.platform_id
  ),
  candidates AS (
    SELECT
      t.id,
      t.task_code,
      t.task_name,
      t.template_scope,
      t.component_id,
      t.interval_miles,
      t.interval_months,
      t.platform_id,
      t.engine_family_id,
      CASE t.template_scope
        WHEN 'variant' THEN 1
        WHEN 'platform' THEN 2
        WHEN 'engine_family' THEN 3
        ELSE 4
      END AS scope_rank
    FROM public.maintenance_task_templates t
    CROSS JOIN cat
    LEFT JOIN mine ON true
    WHERE t.archived_at IS NULL
      AND (
        cardinality(coalesce(t.applicable_vehicle_classes, ARRAY['car']::text[])) = 0
        OR cat.vehicle_class = ANY (
          SELECT lower(trim(cls))
          FROM unnest(coalesce(t.applicable_vehicle_classes, ARRAY['car']::text[])) AS cls
        )
      )
      AND (
        (t.template_scope = 'variant' AND t.vehicle_catalog_id = cat.id)
        OR (
          t.template_scope = 'platform'
          AND (t.platform_id = cat.platform_id OR t.platform_id = mine.parent_id)
        )
        OR (t.template_scope = 'engine_family' AND t.engine_family_id = cat.engine_family_id)
        OR t.template_scope = 'global'
      )
  ),
  best AS (
    SELECT DISTINCT ON (COALESCE(NULLIF(trim(task_code), ''), lower(task_name))) *
    FROM candidates
    ORDER BY COALESCE(NULLIF(trim(task_code), ''), lower(task_name)), scope_rank ASC
  )
  SELECT
    b.id,
    b.task_code,
    b.task_name,
    b.template_scope,
    b.component_id,
    c.op_code,
    b.interval_miles,
    b.interval_months,
    b.platform_id,
    b.engine_family_id
  FROM best b
  LEFT JOIN public.maintenance_service_categories c ON c.id = b.component_id;
$$;

REVOKE ALL ON FUNCTION public.schedule_for_variant(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_for_variant(uuid, integer) TO service_role;

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
  JOIN public.interchange_fitment_rule existing ON existing.interchange_group_id = g.id
  JOIN public.catalog_variant_demand d ON COALESCE(d.vehicle_count, 0) > 0
  JOIN public.vehicle_catalog iu
    ON iu.id = d.variant_id
   AND iu.engine_family_id IS NOT NULL
  WHERE pm.catalog_decision = 'confirmed'
    AND pm.part_kind = 'oem'
    AND g.fit_scope IN ('powertrain', 'universal')
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

REVOKE ALL ON FUNCTION public.seed_in_use_engine_parts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_in_use_engine_parts() TO service_role;

DROP FUNCTION IF EXISTS public.catalog_coverage_matrix();

-- Already applied once, so this may be a stored list rather than a plain view.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'variant_parts_readiness'
      AND c.relkind = 'm'
  ) THEN
    DROP MATERIALIZED VIEW public.variant_parts_readiness;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'variant_parts_readiness'
      AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.variant_parts_readiness;
  END IF;
END $$;

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
hits AS (
  SELECT
    vc.id AS variant_id,
    comp.op_code,
    bool_or(pm.catalog_decision = 'confirmed' AND p.tier BETWEEN 1 AND 3) AS verified,
    bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected' AND p.tier BETWEEN 1 AND 3) AS any_part
  FROM public.vehicle_catalog vc
  CROSS JOIN comp
  LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL) p ON true
  LEFT JOIN public.part_master pm ON pm.id = p.part_id
  GROUP BY vc.id, comp.op_code
),
rolled AS (
  SELECT
    variant_id,
    count(*) FILTER (WHERE verified)::int AS components_ready,
    jsonb_object_agg(
      op_code,
      CASE
        WHEN verified THEN 'verified'
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

CREATE OR REPLACE FUNCTION public.refresh_variant_parts_readiness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Not concurrent: a concurrent refresh cannot run inside this function.
  REFRESH MATERIALIZED VIEW public.variant_parts_readiness;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_variant_parts_readiness() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_variant_parts_readiness() TO service_role;

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
          'variantId', id,
          'make', make,
          'model', model,
          'chassisCode', chassis_code,
          'engineCode', engine_code,
          'platformId', platform_id,
          'engineFamilyId', engine_family_id,
          'demand', demand,
          'fleetCount', fleet_count,
          'ready', ready,
          'cells', cells
        ) AS row_json
        FROM base
        ORDER BY demand DESC, make, model
      ) s
    )
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_coverage_matrix() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_coverage_matrix() TO service_role;

CREATE OR REPLACE VIEW public.catalog_signal_fit AS
SELECT
  part_id,
  vehicle_catalog_id AS variant_id,
  count(*) FILTER (WHERE outcome = 'fit')::int AS fit_count,
  count(*) FILTER (WHERE outcome = 'no_fit')::int AS no_fit_count,
  count(*) FILTER (WHERE outcome = 'modified')::int AS modified_count
FROM public.part_fit_feedback
WHERE vehicle_catalog_id IS NOT NULL
GROUP BY part_id, vehicle_catalog_id
HAVING count(DISTINCT organization_id) >= 2;

DROP VIEW IF EXISTS public.catalog_signal_part_demand;

CREATE VIEW public.catalog_signal_part_demand AS
SELECT
  vc.id AS variant_id,
  r.maintenance_component_id AS component_id,
  count(*)::int AS open_count,
  count(DISTINCT r.organization_id)::int AS fleet_count
FROM public.parts_sourcing_requests r
JOIN fleet.vehicles v ON v.legacy_kv_id = ('vehicle:' || r.vehicle_id) OR v.legacy_kv_id = r.vehicle_id OR v.id = r.vehicle_id
JOIN public.vehicle_catalog vc ON vc.id::text = v.vehicle_catalog_id
WHERE r.status IN ('open', 'in_progress')
GROUP BY vc.id, r.maintenance_component_id
HAVING count(DISTINCT r.organization_id) >= 2;

REVOKE ALL ON public.catalog_signal_fit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalog_signal_part_demand FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_signal_fit TO service_role;
GRANT SELECT ON public.catalog_signal_part_demand TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_catalog_demand_and_readiness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_catalog_variant_demand();
  PERFORM public.refresh_variant_parts_readiness();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_demand_and_readiness() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_demand_and_readiness() TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('catalog-demand-readiness');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM cron.schedule(
      'catalog-demand-readiness',
      '30 3 * * *',
      $job$SELECT public.refresh_catalog_demand_and_readiness();$job$
    );
  END IF;
END;
$cron$;
