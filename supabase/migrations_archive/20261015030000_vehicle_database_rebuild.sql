-- Vehicle database rebuild: scope ladder for schedules, variant readiness,
-- anonymous demand counts, and catalog tasks with no customer identity.

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_url text;

ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS component_id uuid REFERENCES public.maintenance_service_categories(id),
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.vehicle_platform(id),
  ADD COLUMN IF NOT EXISTS engine_family_id uuid REFERENCES public.engine_family(id);

UPDATE public.maintenance_task_templates
SET template_scope = 'variant'
WHERE template_scope = 'catalog';

UPDATE public.maintenance_task_templates t
SET component_id = c.id
FROM public.maintenance_service_categories c
WHERE t.component_id IS NULL
  AND t.task_code IS NOT NULL
  AND upper(trim(t.task_code)) = upper(trim(c.op_code));

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_scope_check;
ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_template_scope_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_template_scope_check
  CHECK (template_scope IN ('variant', 'platform', 'engine_family', 'global'));

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_scope_check
  CHECK (
    (template_scope = 'variant' AND vehicle_catalog_id IS NOT NULL AND platform_id IS NULL AND engine_family_id IS NULL)
    OR (template_scope = 'platform' AND platform_id IS NOT NULL AND vehicle_catalog_id IS NULL AND engine_family_id IS NULL)
    OR (template_scope = 'engine_family' AND engine_family_id IS NOT NULL AND vehicle_catalog_id IS NULL AND platform_id IS NULL)
    OR (template_scope = 'global' AND vehicle_catalog_id IS NULL AND platform_id IS NULL AND engine_family_id IS NULL)
  );

DROP INDEX IF EXISTS mtt_catalog_vehicle_task_unique;
DROP INDEX IF EXISTS mtt_catalog_task_code_unique;

CREATE UNIQUE INDEX IF NOT EXISTS mtt_variant_vehicle_task_unique
  ON public.maintenance_task_templates (vehicle_catalog_id, task_name)
  WHERE template_scope = 'variant' AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mtt_variant_task_code_unique
  ON public.maintenance_task_templates (vehicle_catalog_id, task_code)
  WHERE template_scope = 'variant' AND task_code IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mtt_platform_task_code_unique
  ON public.maintenance_task_templates (platform_id, task_code)
  WHERE template_scope = 'platform' AND task_code IS NOT NULL AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mtt_engine_task_code_unique
  ON public.maintenance_task_templates (engine_family_id, task_code)
  WHERE template_scope = 'engine_family' AND task_code IS NOT NULL AND archived_at IS NULL;

COMMENT ON COLUMN public.maintenance_task_templates.template_scope IS
  'variant overrides platform, then engine_family, then global.';

CREATE TABLE IF NOT EXISTS public.catalog_variant_demand (
  variant_id uuid PRIMARY KEY REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  vehicle_count integer NOT NULL DEFAULT 0 CHECK (vehicle_count >= 0),
  fleet_count integer NOT NULL DEFAULT 0 CHECK (fleet_count >= 0),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalog_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog(id),
  component_id uuid REFERENCES public.maintenance_service_categories(id),
  kind text NOT NULL CHECK (kind IN ('add_part', 'verify_part', 'add_variant', 'fix_variant')),
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_variant_demand ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catalog_task FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalog_variant_demand FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_task TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_variant_demand TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_catalog_variant_demand()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, fleet
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.catalog_variant_demand;
  INSERT INTO public.catalog_variant_demand (variant_id, vehicle_count, fleet_count, refreshed_at)
  SELECT vc.id,
    count(*)::int,
    count(DISTINCT v.organization_id)::int,
    now()
  FROM fleet.vehicles v
  JOIN public.vehicle_catalog vc
    ON vc.id::text = v.vehicle_catalog_id
  WHERE v.vehicle_catalog_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND lower(coalesce(v.status, 'active')) NOT IN ('retired', 'sold', 'inactive', 'archived')
  GROUP BY vc.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_variant_demand() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_variant_demand() TO service_role;

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
    SELECT id, platform_id, engine_family_id
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

CREATE OR REPLACE FUNCTION public.catalog_blast_radius(p_kind text, p_id uuid)
RETURNS TABLE (variant_count integer, make_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::int,
    count(DISTINCT lower(trim(vc.make)))::int
  FROM public.vehicle_catalog vc
  LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
  WHERE (
    p_kind = 'variant' AND vc.id = p_id
  ) OR (
    p_kind = 'platform' AND (vc.platform_id = p_id OR mine.parent_id = p_id OR vc.platform_id IN (
      SELECT child.id FROM public.vehicle_platform child WHERE child.parent_id = p_id
    ))
  ) OR (
    p_kind = 'engine_family' AND vc.engine_family_id = p_id
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_blast_radius(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_blast_radius(text, uuid) TO service_role;

CREATE OR REPLACE VIEW public.variant_parts_readiness AS
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

REVOKE ALL ON public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.variant_parts_readiness TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_coverage_matrix()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'components', jsonb_build_array(
      'ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN',
      'BRK-PADS', 'BELT-SERP', 'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK'
    ),
    'refreshedAt', (SELECT max(refreshed_at) FROM public.catalog_variant_demand),
    'inUseReadyPct', (
      SELECT CASE WHEN count(*) FILTER (WHERE COALESCE(d.vehicle_count, 0) > 0) = 0 THEN 0
        ELSE round(
          100.0 * count(*) FILTER (WHERE COALESCE(d.vehicle_count, 0) > 0 AND COALESCE(r.ready, false))
          / count(*) FILTER (WHERE COALESCE(d.vehicle_count, 0) > 0),
          1
        )
      END
      FROM public.vehicle_catalog vc
      LEFT JOIN public.catalog_variant_demand d ON d.variant_id = vc.id
      LEFT JOIN public.variant_parts_readiness r ON r.variant_id = vc.id
    ),
    'allReadyPct', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE COALESCE(r.ready, false)) / count(*), 1)
      END
      FROM public.vehicle_catalog vc
      LEFT JOIN public.variant_parts_readiness r ON r.variant_id = vc.id
    ),
    'variants', (
      SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'variantId', vc.id,
          'make', vc.make,
          'model', vc.model,
          'chassisCode', vc.chassis_code,
          'engineCode', vc.engine_code,
          'platformId', vc.platform_id,
          'engineFamilyId', vc.engine_family_id,
          'demand', COALESCE(d.vehicle_count, 0),
          'fleetCount', COALESCE(d.fleet_count, 0),
          'ready', COALESCE(r.ready, false),
          'cells', COALESCE(r.cells, '{}'::jsonb)
        ) AS row_json
        FROM public.vehicle_catalog vc
        LEFT JOIN public.catalog_variant_demand d ON d.variant_id = vc.id
        LEFT JOIN public.variant_parts_readiness r ON r.variant_id = vc.id
        ORDER BY COALESCE(d.vehicle_count, 0) DESC, vc.make, vc.model
      ) s
    )
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_coverage_matrix() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_coverage_matrix() TO service_role;

CREATE OR REPLACE VIEW public.catalog_signal_variant_demand AS
SELECT variant_id, vehicle_count, fleet_count, refreshed_at
FROM public.catalog_variant_demand
WHERE vehicle_count >= 1;

CREATE OR REPLACE VIEW public.catalog_signal_fit AS
SELECT
  part_id,
  vehicle_catalog_id AS variant_id,
  count(*) FILTER (WHERE outcome = 'fit')::int AS fit_count,
  count(*) FILTER (WHERE outcome = 'no_fit')::int AS no_fit_count,
  count(*) FILTER (WHERE outcome = 'modified')::int AS modified_count
FROM public.part_fit_feedback
WHERE vehicle_catalog_id IS NOT NULL
GROUP BY part_id, vehicle_catalog_id;

CREATE OR REPLACE VIEW public.catalog_signal_unmatched_numbers AS
SELECT
  upper(regexp_replace(r.part_number, '[^A-Za-z0-9]', '', 'g')) AS part_number,
  l.component_id,
  vc.id AS variant_id,
  count(*)::int AS occurrences
FROM public.part_number_link_review r
JOIN public.maintenance_work_order_lines l ON l.id = r.work_order_line_id
JOIN public.maintenance_work_orders w ON w.id = l.work_order_id
JOIN fleet.vehicles v ON v.legacy_kv_id = ('vehicle:' || w.vehicle_id) OR v.legacy_kv_id = w.vehicle_id OR v.id = w.vehicle_id
JOIN public.vehicle_catalog vc ON vc.id::text = v.vehicle_catalog_id
WHERE r.status = 'open'
GROUP BY 1, 2, 3
HAVING count(DISTINCT r.organization_id) >= 2;

CREATE OR REPLACE VIEW public.catalog_signal_part_demand AS
SELECT
  vc.id AS variant_id,
  r.maintenance_component_id AS component_id,
  count(*)::int AS open_count,
  count(DISTINCT r.organization_id)::int AS fleet_count,
  CASE
    WHEN count(DISTINCT r.organization_id) >= 2 THEN max(r.need_text)
    ELSE NULL
  END AS latest_need_text
FROM public.parts_sourcing_requests r
JOIN fleet.vehicles v ON v.legacy_kv_id = ('vehicle:' || r.vehicle_id) OR v.legacy_kv_id = r.vehicle_id OR v.id = r.vehicle_id
JOIN public.vehicle_catalog vc ON vc.id::text = v.vehicle_catalog_id
WHERE r.status IN ('open', 'in_progress')
GROUP BY vc.id, r.maintenance_component_id;

-- Live GoRide still stores a single proposed_year. A fresh replay already
-- renamed that to a production span. The view exposes the same columns either way.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_catalog_pending_requests'
      AND column_name = 'proposed_production_start_year'
  ) THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.catalog_intake_pending AS
      SELECT
        proposed_make,
        proposed_model,
        proposed_production_start_year,
        proposed_production_end_year,
        proposed_engine_code,
        proposed_trim_series,
        status,
        count(*)::int AS request_count,
        count(DISTINCT organization_id)::int AS fleet_count,
        min(created_at) AS first_seen,
        max(created_at) AS last_seen
      FROM public.vehicle_catalog_pending_requests
      WHERE status IN ('pending', 'needs_info')
      GROUP BY
        proposed_make,
        proposed_model,
        proposed_production_start_year,
        proposed_production_end_year,
        proposed_engine_code,
        proposed_trim_series,
        status
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.catalog_intake_pending AS
      SELECT
        proposed_make,
        proposed_model,
        proposed_year AS proposed_production_start_year,
        proposed_year AS proposed_production_end_year,
        NULL::text AS proposed_engine_code,
        proposed_trim_series,
        status,
        count(*)::int AS request_count,
        count(DISTINCT organization_id)::int AS fleet_count,
        min(created_at) AS first_seen,
        max(created_at) AS last_seen
      FROM public.vehicle_catalog_pending_requests
      WHERE status IN ('pending', 'needs_info')
      GROUP BY
        proposed_make,
        proposed_model,
        proposed_year,
        proposed_trim_series,
        status
    $view$;
  END IF;
END $$;

REVOKE ALL ON public.catalog_signal_variant_demand FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalog_signal_fit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalog_signal_unmatched_numbers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalog_signal_part_demand FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalog_intake_pending FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_signal_variant_demand TO service_role;
GRANT SELECT ON public.catalog_signal_fit TO service_role;
GRANT SELECT ON public.catalog_signal_unmatched_numbers TO service_role;
GRANT SELECT ON public.catalog_signal_part_demand TO service_role;
GRANT SELECT ON public.catalog_intake_pending TO service_role;

CREATE OR REPLACE FUNCTION public.seed_in_use_engine_parts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  inserted integer;
BEGIN
  PERFORM public.refresh_catalog_variant_demand();
  INSERT INTO public.interchange_fitment_rule (
    interchange_group_id, target_kind, engine_family_id, source
  )
  SELECT DISTINCT g.id, 'engine_family', e.id, 'seed_in_use'
  FROM public.part_master pm
  JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  JOIN public.engine_family e ON upper(g.code) LIKE '%-' || e.code OR upper(g.code) = e.code
  WHERE pm.catalog_decision = 'confirmed'
    AND pm.part_kind = 'oem'
    AND g.fit_scope IN ('powertrain', 'universal')
    AND NOT EXISTS (
      SELECT 1 FROM public.interchange_fitment_rule r
      WHERE r.interchange_group_id = g.id
        AND r.target_kind = 'engine_family'
        AND r.engine_family_id = e.id
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  n := n + inserted;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_in_use_engine_parts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_in_use_engine_parts() TO service_role;
