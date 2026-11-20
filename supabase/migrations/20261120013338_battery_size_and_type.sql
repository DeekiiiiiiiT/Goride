-- LC-19 (docs/log-service-parts-gaps-audit.md): batteries — right size, right type.
-- a) car spec key battery_type (Standard / EFB / AGM). EFB = the car has stop-start (Eco Idle).
-- b) battery_case_key(): "46B24L" / "55B24L" / "B24L" / "N-55" all mean the same JIS case + terminal side.
-- c) universal_parts_for_variant: battery_jis matches on the case key; the car's battery_type picks which
--    batteries fit (Standard/none -> any; EFB -> EFB or AGM; AGM -> AGM). Other sizes unchanged.
-- d) the by-size part save keeps extra.battery_type from the form (live save patched in place).

-- a) car spec key
INSERT INTO public.spec_key (key, label, value_type, unit, allowed_values, component_id)
VALUES ('battery_type', 'Battery type', 'enum', NULL, ARRAY['Standard', 'EFB', 'AGM'], NULL)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label, value_type = EXCLUDED.value_type, allowed_values = EXCLUDED.allowed_values;

-- b) one key per JIS battery case + terminal side
CREATE OR REPLACE FUNCTION public.battery_case_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH t AS (SELECT upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g')) AS v)
  SELECT CASE
    -- a JIS code anywhere: 46B24L, 55B24L, B24L, 80D23R -> B24L / D23R
    WHEN v ~ '[A-H][0-9]{2}[LR]' THEN substring(v FROM '([A-H][0-9]{2}[LR])')
    -- idling-stop codes: K-42, M-42, N-55, Q-85, S-95, T-110 (R suffix = right terminal)
    WHEN v ~ '^[KMNQST][0-9]{2,3}R?$' THEN
      (CASE left(v, 1)
         WHEN 'K' THEN 'B19' WHEN 'M' THEN 'B20' WHEN 'N' THEN 'B24'
         WHEN 'Q' THEN 'D23' WHEN 'S' THEN 'D26' WHEN 'T' THEN 'D31'
       END) || CASE WHEN right(v, 1) = 'R' THEN 'R' ELSE 'L' END
    ELSE nullif(v, '')
  END
  FROM t;
$$;

-- c) by-size match: battery case + type rule (wiper connector rule kept)
CREATE OR REPLACE FUNCTION public.universal_parts_for_variant(p_catalog_id uuid, p_vehicle_year integer DEFAULT NULL::integer)
RETURNS TABLE(spec_key text, label text, spec_value text, unit text, universal_part_id uuid, manufacturer text, part_number text, name text, extra jsonb)
LANGUAGE sql
STABLE
AS $$
  WITH specs AS (
    SELECT * FROM public.specs_for_variant(p_catalog_id, p_vehicle_year)
    WHERE sourced
  ),
  conn AS (
    SELECT value FROM specs WHERE spec_key = 'wiper_connector' LIMIT 1
  ),
  btype AS (
    SELECT lower(btrim(value)) AS value FROM specs WHERE spec_key = 'battery_type' LIMIT 1
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
   AND (
     CASE WHEN s.spec_key = 'battery_jis'
       THEN public.battery_case_key(up.spec_value) = public.battery_case_key(s.value)
       ELSE lower(btrim(up.spec_value)) = lower(btrim(s.value))
     END
   )
   AND (
     s.spec_key NOT LIKE 'wiper_%_mm'
     OR NOT EXISTS (SELECT 1 FROM conn)
     OR lower(coalesce(up.extra->>'connector', '')) = lower((SELECT value FROM conn))
   )
   AND (
     s.spec_key <> 'battery_jis'
     OR NOT EXISTS (SELECT 1 FROM btype WHERE value IN ('efb', 'agm'))
     OR (
       (SELECT value FROM btype) = 'efb' AND lower(coalesce(up.extra->>'battery_type', '')) IN ('efb', 'agm')
     )
     OR (
       (SELECT value FROM btype) = 'agm' AND lower(coalesce(up.extra->>'battery_type', '')) = 'agm'
     )
   );
$$;

-- d) the by-size save keeps the battery type (Standard / EFB / AGM) from the form
CREATE OR REPLACE FUNCTION public.universal_part_extra_from_input(p_input jsonb, p_spec_key text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_spec_key = 'battery_jis'
      AND lower(btrim(coalesce(p_input->>'batteryType', ''))) IN ('standard', 'efb', 'agm')
    THEN jsonb_build_object('battery_type',
      CASE lower(btrim(p_input->>'batteryType')) WHEN 'standard' THEN 'Standard' WHEN 'efb' THEN 'EFB' ELSE 'AGM' END)
    ELSE '{}'::jsonb
  END;
$$;

DO $patch$
DECLARE
  v_def text;
  v_old text := '''extra'', jsonb_build_object(''partId'', v_part_id, ''partTypeOpCode'', v_type.op_code)';
  v_new text := '''extra'', jsonb_build_object(''partId'', v_part_id, ''partTypeOpCode'', v_type.op_code) || public.universal_part_extra_from_input(p_input, v_spec_key)';
BEGIN
  v_def := pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb, uuid, integer, boolean)'::regprocedure);
  IF position('universal_part_extra_from_input' IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the extra line exactly once — not patched';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END;
$patch$;

-- Self-checks
DO $check$
BEGIN
  IF public.battery_case_key('46B24L') <> 'B24L' OR public.battery_case_key('B24L') <> 'B24L'
     OR public.battery_case_key('N-55') <> 'B24L' OR public.battery_case_key('N-55R') <> 'B24R'
     OR public.battery_case_key('80D23R') <> 'D23R' OR public.battery_case_key('M-42') <> 'B20L'
     OR public.battery_case_key('') IS NOT NULL THEN
    RAISE EXCEPTION 'battery_case_key wrong';
  END IF;
  IF public.universal_part_extra_from_input('{"batteryType":"efb"}'::jsonb, 'battery_jis') <> '{"battery_type":"EFB"}'::jsonb
     OR public.universal_part_extra_from_input('{"batteryType":"efb"}'::jsonb, 'tire_size') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'universal_part_extra_from_input wrong';
  END IF;
  IF position('universal_part_extra_from_input' IN
       pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb, uuid, integer, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch not patched';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spec_key WHERE key = 'battery_type' AND value_type = 'enum') THEN
    RAISE EXCEPTION 'battery_type spec key missing';
  END IF;
END;
$check$;
