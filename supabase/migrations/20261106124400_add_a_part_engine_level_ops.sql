-- AS8-06: the wizard offers "By engine" for 9 part types, but the older guard
-- (assert_group_fit_allowed → is_engine_level_op) only allowed 4, so O2 sensor,
-- water pump, alternator, starter motor and drive belt saves always failed.
-- Every part type whose default fit mode is "engine" is engine-level.

CREATE OR REPLACE FUNCTION public.is_engine_level_op(p_op text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT upper(trim(coalesce(p_op, ''))) IN (
    'ENG-OIL', 'ENG-SPARK', 'ENG-COIL', 'ENG-THERM',
    'ENG-O2', 'ENG-WPUMP', 'ELEC-ALT', 'ELEC-START', 'BELT-SERP'
  );
$$;

-- Proof: every active part type that defaults to "by engine" passes the guard.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(op_code, ', ') INTO v_bad
  FROM public.maintenance_service_categories
  WHERE is_part IS TRUE AND kind = 'component' AND part_type_status = 'active'
    AND default_fit_mode = 'engine' AND NOT public.is_engine_level_op(op_code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'By-engine part types still blocked by the engine guard: %', v_bad;
  END IF;
END $$;
