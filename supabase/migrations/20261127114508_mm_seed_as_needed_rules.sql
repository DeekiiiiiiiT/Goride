-- MER-04 data half: the 47 part types that are only done when a job calls for them.
--
-- frequency_kind = 'manual_only' IS "As needed" - no new value is added. A manual_only rule has
-- no interval, and the engine (previous migration) never makes a car schedule row from it, never
-- gives it a due date and never counts it as Overdue, Due soon or OK.
--
-- Appendix A of docs/maintenance-enterprise-rebuild-review.md lists 49 "As needed" types.
-- Two of them (valve_clearance_adjustment, wheel_alignment) move to "No schedule yet" instead,
-- so 47 rules are written here. The other 104 part types keep no rule at all.
--
-- The seeding is a function so it is idempotent and so a database that does not hold every part
-- type yet (the local copy seeds 103 of them) can be completed by running it again once the part
-- types exist. It inserts nothing twice.

CREATE OR REPLACE FUNCTION public.mm_seed_as_needed_rules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_added integer := 0;
BEGIN
  INSERT INTO public.maintenance_task_templates (
    task_name,
    task_code,
    template_scope,
    component_id,
    interval_km,
    interval_km_max,
    interval_months,
    frequency_kind,
    due_kind,
    status,
    source_type,
    confidence,
    applicable_vehicle_classes
  )
  SELECT
    c.name || ' (as needed)',
    c.code,
    'global',
    c.id,
    NULL,
    NULL,
    NULL,
    'manual_only',
    'part_schedule',
    'active',
    'roam_policy',
    'uncertain',
    ARRAY['car']::text[]
  FROM (
    VALUES
      ('ac_evaporator_cleaning'),
      ('ac_recharge'),
      ('ac_disinfection'),
      ('adblue_topup'),
      ('battery_terminal_cleaning'),
      ('carburetor_cleaning'),
      ('ev_charging_port_cleaning'),
      ('rod_bearings'),
      ('coolant_part'),
      ('crankshaft_machining'),
      ('cylinder_head_machining'),
      ('cylinder_honing'),
      ('dpf_cleaning'),
      ('egr_cleaning'),
      ('engine_bay_degreasing'),
      ('engine_oil_part'),
      ('engine_overhaul'),
      ('engine_service_labor'),
      ('exhaust_flange_gasket'),
      ('exhaust_manifold_gasket'),
      ('exhaust_inspection'),
      ('fuel_induction_service'),
      ('head_gasket'),
      ('hv_battery_fan_cleaning'),
      ('hv_battery_health_check'),
      ('hv_insulation_inspection'),
      ('inspection_diagnostic_fee'),
      ('intake_manifold_gasket'),
      ('walnut_blasting'),
      ('intercooler_cleaning'),
      ('leak_inspection'),
      ('maf_map_sensor_cleaning'),
      ('main_bearings'),
      ('oil_pan_gasket'),
      ('piston_replacement'),
      ('piston_rings'),
      ('puncture_repair'),
      ('scr_service'),
      ('throttle_body_cleaning'),
      ('throttle_body_relearn'),
      ('turbo_decoking'),
      ('valve_cover_gasket'),
      ('valve_grinding_seating'),
      ('valve_stem_seals'),
      ('washer_fluid_part'),
      ('wheel_balancing'),
      ('wheel_straightening')
  ) AS as_needed(code)
  JOIN public.maintenance_service_categories c ON c.code = as_needed.code
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.maintenance_task_templates t
    WHERE t.component_id = c.id
  );

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

COMMENT ON FUNCTION public.mm_seed_as_needed_rules() IS
  'Idempotent: writes one global manual_only (As needed) rule per Appendix A part type that exists. Returns rows added.';

SELECT public.mm_seed_as_needed_rules();

-- A part that is As needed must not keep a car row: those rows were the "OK with no interval"
-- padding MER-14 describes. Retire them with the reason the screens will print.
UPDATE public.vehicle_component_schedule vcs
SET
  schedule_status = 'retired',
  retired_reason = 'As needed: done only when a job calls for it',
  rule_id = NULL,
  rule_revision_no = NULL,
  interval_km_used = NULL,
  interval_months_used = NULL,
  interval_basis = NULL,
  next_due_km = NULL,
  next_due_km_max = NULL,
  next_due_date = NULL,
  computed_at = now(),
  updated_at = now()
WHERE vcs.schedule_status <> 'retired'
  AND public.mm_part_is_as_needed(vcs.category_id);

REVOKE ALL ON FUNCTION public.mm_seed_as_needed_rules() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
