-- §3.2 vehicle_component_schedule governance columns (miles column names unchanged).

ALTER TABLE public.vehicle_component_schedule
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.maintenance_task_templates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_revision_no integer,
  ADD COLUMN IF NOT EXISTS interval_km_used integer,
  ADD COLUMN IF NOT EXISTS interval_months_used integer,
  ADD COLUMN IF NOT EXISTS interval_basis text,
  ADD COLUMN IF NOT EXISTS last_performed_source text,
  ADD COLUMN IF NOT EXISTS custom_interval_km integer,
  ADD COLUMN IF NOT EXISTS custom_interval_months integer,
  ADD COLUMN IF NOT EXISTS custom_reason text,
  ADD COLUMN IF NOT EXISTS custom_set_by uuid,
  ADD COLUMN IF NOT EXISTS custom_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS computed_at timestamptz;

ALTER TABLE public.vehicle_component_schedule
  DROP CONSTRAINT IF EXISTS vehicle_component_schedule_interval_basis_check;

ALTER TABLE public.vehicle_component_schedule
  ADD CONSTRAINT vehicle_component_schedule_interval_basis_check
  CHECK (interval_basis IS NULL OR interval_basis IN ('rule', 'severe', 'custom'));

ALTER TABLE public.vehicle_component_schedule
  DROP CONSTRAINT IF EXISTS vehicle_component_schedule_last_performed_source_check;

ALTER TABLE public.vehicle_component_schedule
  ADD CONSTRAINT vehicle_component_schedule_last_performed_source_check
  CHECK (
    last_performed_source IS NULL
    OR last_performed_source IN ('work_order', 'service_log', 'manual')
  );

ALTER TABLE public.vehicle_component_schedule
  DROP CONSTRAINT IF EXISTS vehicle_component_schedule_schedule_status_check;

ALTER TABLE public.vehicle_component_schedule
  ADD CONSTRAINT vehicle_component_schedule_schedule_status_check
  CHECK (
    schedule_status IN (
      'active',
      'fulfilled',
      'odometer_needed',
      'no_rule',
      'manual_override',
      'retired'
    )
  );

CREATE INDEX IF NOT EXISTS idx_vcs_rule_id
  ON public.vehicle_component_schedule (rule_id)
  WHERE rule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.schedule_rule_for_part(
  p_org text,
  p_vehicle_id text,
  p_component_id uuid
)
RETURNS TABLE (
  rule_id uuid,
  rank integer,
  interval_km integer,
  interval_km_max integer,
  interval_months integer,
  interval_basis text,
  rule_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ctx record;
  v_rule public.maintenance_task_templates;
  v_sched record;
  v_rank integer;
  v_im int;
  v_im_max int;
  v_im_mo int;
  v_basis text;
BEGIN
  SELECT * INTO v_ctx
  FROM public.mm_vehicle_catalog_for_fleet(p_org, p_vehicle_id);

  IF v_ctx.catalog_id IS NULL THEN
    RETURN;
  END IF;

  SELECT vcs.*
  INTO v_sched
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = p_org
    AND vcs.vehicle_id = p_vehicle_id
    AND vcs.category_id = p_component_id
  ORDER BY vcs.position NULLS FIRST
  LIMIT 1;

  IF FOUND
    AND v_sched.schedule_status = 'manual_override'
    AND (
      v_sched.custom_interval_km IS NOT NULL
      OR v_sched.custom_interval_months IS NOT NULL
    )
  THEN
    rule_id := v_sched.rule_id;
    rank := NULL;
    interval_km := v_sched.custom_interval_km;
    interval_km_max := NULL;
    interval_months := v_sched.custom_interval_months;
    interval_basis := 'custom';
    rule_status := 'active';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_rule FROM public.mm_pick_part_rule(
    p_component_id,
    v_ctx.catalog_id,
    v_ctx.platform_id,
    v_ctx.platform_family_id,
    v_ctx.engine_family_id,
    v_ctx.vehicle_class,
    v_ctx.vehicle_year,
    ARRAY['active']::text[]
  );

  IF v_rule.id IS NULL THEN
    SELECT * INTO v_rule FROM public.mm_pick_part_rule(
      p_component_id,
      v_ctx.catalog_id,
      v_ctx.platform_id,
      v_ctx.platform_family_id,
      v_ctx.engine_family_id,
      v_ctx.vehicle_class,
      v_ctx.vehicle_year,
      ARRAY['needs_checking']::text[]
    );
  END IF;

  IF v_rule.id IS NULL THEN
    RETURN;
  END IF;

  v_rank := public.mm_part_rule_rank(
    v_rule.template_scope,
    v_ctx.catalog_id,
    v_ctx.platform_id,
    v_ctx.platform_family_id,
    v_ctx.engine_family_id,
    v_rule.vehicle_catalog_id,
    v_rule.platform_id,
    v_rule.engine_family_id
  );

  v_im := v_rule.interval_miles;
  v_im_max := v_rule.interval_miles_max;
  v_im_mo := v_rule.interval_months;
  v_basis := 'rule';

  IF v_ctx.severe_duty
    AND (
      v_rule.severe_interval_miles IS NOT NULL
      OR v_rule.severe_interval_months IS NOT NULL
    )
  THEN
    v_im := coalesce(v_rule.severe_interval_miles, v_rule.interval_miles);
    v_im_max := coalesce(v_rule.severe_interval_miles_max, v_rule.interval_miles_max);
    v_im_mo := coalesce(v_rule.severe_interval_months, v_rule.interval_months);
    v_basis := 'severe';
  END IF;

  rule_id := v_rule.id;
  rank := v_rank;
  interval_km := v_im;
  interval_km_max := v_im_max;
  interval_months := v_im_mo;
  interval_basis := v_basis;
  rule_status := v_rule.status;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_rule_for_part(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_rule_for_part(text, text, uuid) TO service_role;
