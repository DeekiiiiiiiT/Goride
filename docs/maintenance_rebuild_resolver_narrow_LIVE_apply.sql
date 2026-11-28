-- Narrows the step-16b resolver rule (20261128005456, section 0b). A car maker's rule still waiting for a
-- document (needs_checking) now wins only over Roam's own default (an "everyone" rule). It never beats another
-- active car-maker rule, whatever its level. This keeps check TT10 (active platform beats needs_checking car)
-- and TT8 (active wins a tie), and still keeps 5179KZ (Roomy 2019) on Toyota's numbers rather than Roam's
-- 5,000 km oil. On live today nothing changes: the only needs_checking rules are the 8 Roomy 2016-2020 copies,
-- and they only compete with Roam defaults.

CREATE OR REPLACE FUNCTION public.schedule_rule_for_part(
  p_org text,
  p_vehicle_id text,
  p_component_id uuid,
  p_position text DEFAULT NULL,
  p_include_custom boolean DEFAULT true
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
  v_check public.maintenance_task_templates;
  v_sched record;
  v_rank integer;
  v_check_rank integer;
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

  IF p_include_custom THEN
    SELECT vcs.*
    INTO v_sched
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = p_org
      AND vcs.vehicle_id = p_vehicle_id
      AND vcs.category_id = p_component_id
      AND vcs.position IS NOT DISTINCT FROM p_position
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

  SELECT * INTO v_check FROM public.mm_pick_part_rule(
    p_component_id,
    v_ctx.catalog_id,
    v_ctx.platform_id,
    v_ctx.platform_family_id,
    v_ctx.engine_family_id,
    v_ctx.vehicle_class,
    v_ctx.vehicle_year,
    ARRAY['needs_checking']::text[]
  );

  IF v_check.id IS NOT NULL THEN
    IF v_rule.id IS NULL THEN
      v_rule := v_check;
    ELSE
      -- Step 16b (narrowed 28 Nov): a needs_checking car-maker rule beats only an active everyone's
      -- (Roam default) rule, and only when it is more specific. An active car-maker rule always wins.
      v_rank := public.mm_part_rule_rank(
        v_rule.template_scope, v_ctx.catalog_id, v_ctx.platform_id, v_ctx.platform_family_id,
        v_ctx.engine_family_id, v_rule.vehicle_catalog_id, v_rule.platform_id, v_rule.engine_family_id
      );
      v_check_rank := public.mm_part_rule_rank(
        v_check.template_scope, v_ctx.catalog_id, v_ctx.platform_id, v_ctx.platform_family_id,
        v_ctx.engine_family_id, v_check.vehicle_catalog_id, v_check.platform_id, v_check.engine_family_id
      );
      IF v_rule.template_scope = 'global' AND v_check_rank < v_rank THEN
        v_rule := v_check;
      END IF;
    END IF;
  END IF;

  IF v_rule.id IS NULL THEN
    RETURN;
  END IF;

  -- Belt and braces: mm_pick_part_rule already skips manual_only, and As needed is never a due.
  IF coalesce(v_rule.frequency_kind, 'recurring') = 'manual_only' THEN
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

  v_im := v_rule.interval_km;
  v_im_max := v_rule.interval_km_max;
  v_im_mo := v_rule.interval_months;
  v_basis := 'rule';

  -- MER-05: when the manual prints one figure only, a hard-use car gets that figure. The severe
  -- columns are empty on such a rule, and the tick alone must never invent a shorter interval.
  IF v_ctx.severe_duty
    AND NOT coalesce(v_rule.severe_same_as_normal, false)
    AND (
      v_rule.severe_interval_km IS NOT NULL
      OR v_rule.severe_interval_months IS NOT NULL
    )
  THEN
    v_im := coalesce(v_rule.severe_interval_km, v_rule.interval_km);
    v_im_max := coalesce(v_rule.severe_interval_km_max, v_rule.interval_km_max);
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261128025534', 'mm_needs_checking_beats_only_roam_default') ON CONFLICT (version) DO NOTHING;
