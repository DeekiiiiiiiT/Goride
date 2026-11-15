-- Powertrain job fit — Round D1 live SQL (paste entire file into Supabase SQL editor, live project).
-- RUN D1-powertrain_job_fit-DRYRUN.sql FIRST; only run this file after "DRY RUN OK".
-- Re-run caveat (3c): a re-run restores rule-derived values on any derived row edited by hand since
-- the first run. To keep a hand-set value, confirm the model (confirmed rows are never re-derived).
-- Future-proofing (6b): any column added to vehicle_catalog or maintenance_service_categories after D1
-- must be added to this file's snapshot exclusion lists before that file is re-run.
-- GENERATED DRYRUN: docs/powertrain-build/live/README-dryrun.md (never edit *-DRYRUN.sql by hand).

BEGIN;

SET LOCAL powertrain.d1.require_all_codes = 'on';

CREATE TEMP TABLE pt_d1_counts (
  what text PRIMARY KEY,
  n int NOT NULL
);

-- 6b snapshots (before any change)
CREATE TEMP TABLE pt_snap_vc AS
SELECT
  c.id,
  md5(
    (to_jsonb(c.*) - ARRAY[
      'powertrain',
      'fuel',
      'powertrain_status',
      'powertrain_note',
      'powertrain_last_confirmed_by',
      'powertrain_last_confirmed_at'
    ])::text
  ) AS h
FROM public.vehicle_catalog c;

CREATE TEMP TABLE pt_snap_msc AS
SELECT
  m.id,
  md5(
    (to_jsonb(m.*) - ARRAY['fits_powertrains', 'fits_fuels', 'is_high_voltage', 'description'])::text
  ) AS h
FROM public.maintenance_service_categories m;

CREATE TEMP TABLE pt_snap_msc_desc AS
SELECT m.id, m.code, coalesce(m.description, '') AS d
FROM public.maintenance_service_categories m
WHERE m.code IN ('ev_charging_port_cleaning', 'electric_ac_compressor');

CREATE TEMP TABLE pt_snap_misc (
  what text PRIMARY KEY,
  n bigint NOT NULL,
  h text NOT NULL
);

INSERT INTO pt_snap_misc (what, n, h) VALUES
  (
    'vehicle_component_schedule',
    (SELECT count(*) FROM public.vehicle_component_schedule),
    (SELECT md5(coalesce(string_agg((to_jsonb(s) - 'retired_reason')::text, '' ORDER BY s.id), ''))
     FROM public.vehicle_component_schedule s)
  ),
  (
    'maintenance_work_order_lines',
    (SELECT count(*) FROM public.maintenance_work_order_lines),
    (SELECT md5(coalesce(string_agg((to_jsonb(l.*) - 'fit_at_log')::text, '' ORDER BY l.id), ''))
     FROM public.maintenance_work_order_lines l)
  ),
  (
    'catalog_component_applicability',
    (SELECT count(*) FROM public.catalog_component_applicability),
    (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '' ORDER BY a.id), ''))
     FROM public.catalog_component_applicability a)
  ),
  (
    'maintenance_task_templates',
    (SELECT count(*) FROM public.maintenance_task_templates),
    (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY t.id), ''))
     FROM public.maintenance_task_templates t)
  ),
  (
    'maintenance_work_order_line_item',
    (SELECT count(*) FROM public.maintenance_work_order_line_item),
    (SELECT md5(coalesce(string_agg(to_jsonb(i)::text, '' ORDER BY i.id), ''))
     FROM public.maintenance_work_order_line_item i)
  );

CREATE TEMP TABLE pt_snap_pr_rev (n bigint NOT NULL);
INSERT INTO pt_snap_pr_rev SELECT count(*) FROM public.platform_revision;

-- Powertrain job fit — Round D1 (database).
-- Re-run caveat (3c): a re-run restores rule-derived values on any derived row edited by hand since
-- the first run. To keep a hand-set value, confirm the model (confirmed rows are never re-derived).
-- Future-proofing (6b): any column added to vehicle_catalog or maintenance_service_categories after D1
-- must be added to the live D1 file snapshot exclusion lists before that file is re-run.

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS powertrain text,
  ADD COLUMN IF NOT EXISTS fuel text,
  ADD COLUMN IF NOT EXISTS powertrain_status text,
  ADD COLUMN IF NOT EXISTS powertrain_note text,
  ADD COLUMN IF NOT EXISTS powertrain_last_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS powertrain_last_confirmed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.vehicle_catalog
    ADD CONSTRAINT vehicle_catalog_powertrain_check
      CHECK (powertrain IS NULL OR powertrain = ANY (ARRAY['ice','mhev','hev','phev','erev','bev','fcev']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicle_catalog
    ADD CONSTRAINT vehicle_catalog_fuel_check
      CHECK (fuel IS NULL OR fuel = ANY (ARRAY['petrol','diesel','cng','hydrogen','electric']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicle_catalog
    ADD CONSTRAINT vehicle_catalog_powertrain_status_check
      CHECK (powertrain_status IS NULL OR powertrain_status = ANY (ARRAY['derived','confirmed','needs_check']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicle_catalog
    ADD CONSTRAINT vehicle_catalog_powertrain_confirmed_values_check
      CHECK (
        powertrain_status NOT IN ('derived', 'confirmed')
        OR (powertrain IS NOT NULL AND fuel IS NOT NULL)
      );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.vehicle_catalog.powertrain IS
  'Controlled powertrain family: ice, mhev, hev, phev, erev, bev, fcev.';
COMMENT ON COLUMN public.vehicle_catalog.fuel IS
  'What the car runs on: petrol, diesel, cng, hydrogen, electric.';
COMMENT ON COLUMN public.vehicle_catalog.powertrain_status IS
  'derived = rule-filled; confirmed = owner set; needs_check = Dominion list.';
COMMENT ON COLUMN public.vehicle_catalog.powertrain_note IS
  'Owner or trigger note (e.g. text changed after confirmation).';
COMMENT ON COLUMN public.vehicle_catalog.powertrain_last_confirmed_by IS
  'Last time the owner confirmed this model''s powertrain. On needs_check this is history, not current state.';
COMMENT ON COLUMN public.vehicle_catalog.powertrain_last_confirmed_at IS
  'Last time the owner confirmed this model''s powertrain. On needs_check this is history, not current state.';

CREATE OR REPLACE FUNCTION public.vehicle_catalog_derive_powertrain(
  p_fuel_type text,
  p_engine_type text,
  p_fuel_category text
)
RETURNS TABLE (powertrain text, fuel text, status text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    r.powertrain,
    r.fuel,
    r.status
  FROM (
    SELECT
      CASE
        WHEN nullif(btrim(coalesce(p_fuel_type, '')), '') IS NULL
          OR p_fuel_type = 'Electric/Hybrid'
          THEN NULL::text
        WHEN p_fuel_type = 'Hybrid(petrol)' AND p_fuel_category = 'Gas'
          THEN NULL::text
        WHEN coalesce(p_engine_type, '') ILIKE '%mild%'
          THEN 'mhev'
        WHEN p_fuel_type = 'Electric'
          THEN 'bev'
        WHEN p_fuel_type = 'Hydrogen' AND coalesce(p_engine_type, '') ILIKE '%fuel cell%'
          THEN 'fcev'
        WHEN p_fuel_type = 'Hydrogen'
          THEN NULL::text
        WHEN p_fuel_type IN ('Hybrid(petrol)', 'Petrol/Electric')
          AND (
            coalesce(p_engine_type, '') ILIKE '%phev%'
            OR coalesce(p_engine_type, '') ILIKE '%plug-in%'
          )
          THEN 'phev'
        WHEN p_fuel_type IN ('Hybrid(petrol)', 'Petrol/Electric')
          AND (
            coalesce(p_engine_type, '') ILIKE '%erev%'
            OR coalesce(p_engine_type, '') ILIKE '%reev%'
            OR coalesce(p_engine_type, '') ILIKE '%range extender%'
          )
          THEN 'erev'
        WHEN p_fuel_type IN ('Hybrid(petrol)', 'Petrol/Electric')
          THEN 'hev'
        WHEN p_fuel_type = 'Hybrid(diesel)'
          THEN 'hev'
        WHEN p_fuel_type = 'Petrol'
          THEN 'ice'
        WHEN p_fuel_type = 'Diesel'
          THEN 'ice'
        WHEN p_fuel_type IN ('CNG', 'CNG/LNG')
          THEN 'ice'
        ELSE NULL::text
      END AS powertrain,
      CASE
        WHEN nullif(btrim(coalesce(p_fuel_type, '')), '') IS NULL
          OR p_fuel_type = 'Electric/Hybrid'
          THEN NULL::text
        WHEN p_fuel_type = 'Hybrid(petrol)' AND p_fuel_category = 'Gas'
          THEN 'petrol'::text
        WHEN coalesce(p_engine_type, '') ILIKE '%mild%'
          THEN CASE WHEN p_fuel_type ILIKE '%diesel%' THEN 'diesel' ELSE 'petrol' END
        WHEN p_fuel_type = 'Electric'
          THEN 'electric'::text
        WHEN p_fuel_type = 'Hydrogen' AND coalesce(p_engine_type, '') ILIKE '%fuel cell%'
          THEN 'hydrogen'::text
        WHEN p_fuel_type = 'Hydrogen'
          THEN 'hydrogen'::text
        WHEN p_fuel_type IN ('Hybrid(petrol)', 'Petrol/Electric', 'Petrol')
          THEN 'petrol'::text
        WHEN p_fuel_type = 'Hybrid(diesel)' OR p_fuel_type = 'Diesel'
          THEN 'diesel'::text
        WHEN p_fuel_type IN ('CNG', 'CNG/LNG')
          THEN 'cng'::text
        ELSE NULL::text
      END AS fuel,
      CASE
        WHEN nullif(btrim(coalesce(p_fuel_type, '')), '') IS NULL
          OR p_fuel_type = 'Electric/Hybrid'
          THEN 'needs_check'::text
        WHEN p_fuel_type = 'Hybrid(petrol)' AND p_fuel_category = 'Gas'
          THEN 'needs_check'::text
        WHEN coalesce(p_engine_type, '') ILIKE '%mild%'
          THEN 'derived'::text
        WHEN p_fuel_type = 'Electric'
          THEN 'derived'::text
        WHEN p_fuel_type = 'Hydrogen' AND coalesce(p_engine_type, '') ILIKE '%fuel cell%'
          THEN 'derived'::text
        WHEN p_fuel_type = 'Hydrogen'
          THEN 'needs_check'::text
        WHEN p_fuel_type IN ('Hybrid(petrol)', 'Petrol/Electric', 'Hybrid(diesel)', 'Petrol', 'Diesel', 'CNG', 'CNG/LNG')
          THEN 'derived'::text
        ELSE 'needs_check'::text
      END AS status
  ) r;
$$;

DROP TRIGGER IF EXISTS vehicle_catalog_derive_powertrain_trg ON public.vehicle_catalog;

CREATE OR REPLACE FUNCTION public.vehicle_catalog_trg_derive_powertrain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      NEW.fuel_type IS DISTINCT FROM OLD.fuel_type
      OR NEW.engine_type IS DISTINCT FROM OLD.engine_type
      OR NEW.fuel_category IS DISTINCT FROM OLD.fuel_category
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.powertrain_status = 'confirmed'
     AND NEW.powertrain IS NOT NULL
     AND NEW.fuel IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_r
  FROM public.vehicle_catalog_derive_powertrain(NEW.fuel_type, NEW.engine_type, NEW.fuel_category);

  IF TG_OP = 'UPDATE' AND OLD.powertrain_status = 'confirmed' THEN
    IF v_r.status = 'derived'
       AND OLD.powertrain IS NOT DISTINCT FROM v_r.powertrain
       AND OLD.fuel IS NOT DISTINCT FROM v_r.fuel THEN
      NEW.powertrain := OLD.powertrain;
      NEW.fuel := OLD.fuel;
      NEW.powertrain_status := 'confirmed';
      NEW.powertrain_note := NULL;
      RETURN NEW;
    END IF;
    NEW.powertrain_status := 'needs_check';
    NEW.powertrain_note := 'Text changed after confirmation: please re-confirm';
    RETURN NEW;
  END IF;

  NEW.powertrain := v_r.powertrain;
  NEW.fuel := v_r.fuel;
  NEW.powertrain_status := v_r.status;
  IF NEW.powertrain_status = 'needs_check' AND v_r.fuel IS NULL THEN
    NEW.fuel := NULL;
  END IF;
  IF NEW.powertrain_status = 'derived' THEN
    NEW.powertrain_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.vehicle_catalog_trg_derive_powertrain() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_catalog_trg_derive_powertrain() TO service_role;

CREATE TEMP TABLE IF NOT EXISTS pt_d1_counts (
  what text PRIMARY KEY,
  n int NOT NULL
);

DO $backfill$
DECLARE
  v_n int;
BEGIN
  PERFORM set_config('part_match.busy', 'on', true);

  UPDATE public.vehicle_catalog vc
  SET
    powertrain = r.powertrain,
    fuel = r.fuel,
    powertrain_status = r.status
  FROM (
    SELECT
      c.id,
      d.powertrain,
      d.fuel,
      d.status
    FROM public.vehicle_catalog c
    CROSS JOIN LATERAL public.vehicle_catalog_derive_powertrain(
      c.fuel_type, c.engine_type, c.fuel_category
    ) d
  ) r
  WHERE r.id = vc.id
    AND vc.powertrain_status IS DISTINCT FROM 'confirmed'
    AND (vc.powertrain, vc.fuel, vc.powertrain_status)
      IS DISTINCT FROM (r.powertrain, r.fuel, r.status);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'powertrain D1: car rows changed = %', v_n;
  INSERT INTO pt_d1_counts (what, n) VALUES ('car rows changed', v_n)
  ON CONFLICT (what) DO UPDATE SET n = EXCLUDED.n;
END;
$backfill$;

ALTER TABLE public.vehicle_catalog
  ALTER COLUMN powertrain_status SET NOT NULL;

DROP TRIGGER IF EXISTS vehicle_catalog_derive_powertrain_trg ON public.vehicle_catalog;
CREATE TRIGGER vehicle_catalog_derive_powertrain_trg
  BEFORE INSERT OR UPDATE OF fuel_type, engine_type, fuel_category
  ON public.vehicle_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.vehicle_catalog_trg_derive_powertrain();

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS fits_powertrains text[],
  ADD COLUMN IF NOT EXISTS fits_fuels text[],
  -- NOT NULL DEFAULT in one step: no row is updated, so no platform_revision rows (6b assertion 11).
  ADD COLUMN IF NOT EXISTS is_high_voltage boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.maintenance_service_categories
    ADD CONSTRAINT maintenance_service_categories_fits_powertrains_nonempty_check
      CHECK (
        fits_powertrains IS NULL OR cardinality(fits_powertrains) > 0
      );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.maintenance_service_categories
    ADD CONSTRAINT maintenance_service_categories_fits_fuels_nonempty_check
      CHECK (
        fits_fuels IS NULL OR cardinality(fits_fuels) > 0
      );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.maintenance_service_categories
    ADD CONSTRAINT maintenance_service_categories_fits_powertrains_codes_check
      CHECK (
        fits_powertrains IS NULL
        OR fits_powertrains <@ ARRAY['ice','mhev','hev','phev','erev','bev','fcev']::text[]
      );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.maintenance_service_categories
    ADD CONSTRAINT maintenance_service_categories_fits_fuels_codes_check
      CHECK (
        fits_fuels IS NULL
        OR fits_fuels <@ ARRAY['petrol','diesel','cng','hydrogen','electric']::text[]
      );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.maintenance_service_categories
    ADD CONSTRAINT maintenance_service_categories_high_voltage_kind_check
      CHECK (kind = 'component' OR is_high_voltage = false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.maintenance_service_categories.fits_powertrains IS
  'Which powertrains this row fits. NULL on a job = same as group; NULL on a group = any car.';
COMMENT ON COLUMN public.maintenance_service_categories.fits_fuels IS
  'Which fuels this row fits. NULL on a job = same as group; NULL on a group = any car.';
COMMENT ON COLUMN public.maintenance_service_categories.is_high_voltage IS
  'True only on high-voltage component jobs (PT-5). Never set on groups.';

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status
)
SELECT
  'throttle_body_relearn',
  'Throttle Body Relearn',
  'Throttle Body Relearn',
  'Resets the engine idle after the throttle body was cleaned or replaced.',
  'wrench',
  '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
  true,
  165,
  sys.id,
  'component',
  'ENG-TBRL',
  false,
  false,
  'active',
  'none',
  'active'
FROM public.maintenance_service_categories sys
WHERE sys.code = 'sys_engine'
ON CONFLICT (code) DO NOTHING;

DO $jobs$
DECLARE
  v_n int;
  v_code text;
  v_missing text[];
BEGIN
  SELECT array_agg(u.c ORDER BY u.c)
  INTO v_missing
  FROM unnest(ARRAY[
    'sys_engine',
    'sys_belts',
    'sys_transmission',
    'sys_exhaust',
    'sys_hybrid',
    'spark_plugs',
    'spark_plug_wires',
    'ignition_coil',
    'throttle_body_cleaning',
    'throttle_body_relearn',
    'carburetor_cleaning',
    'oil_filter',
    'air_filter',
    'fuel_filter',
    'oil',
    'engine_oil_part',
    'coolant_flush',
    'dpf_cleaning',
    'dpf_replacement',
    'scr_service',
    'adblue_topup',
    'nox_sensor',
    'glow_plugs',
    'egt_sensor',
    'dpf_pressure_sensor',
    'evap_canister',
    'purge_valve',
    'ev_charging_port',
    'ev_onboard_charger',
    'ev_charging_port_cleaning',
    'ev_battery_coolant_service',
    'ev_battery_coolant_pump',
    'hv_battery_fan_filter',
    'hv_battery_fan_cleaning',
    'inverter_coolant_service',
    'inverter_coolant_pump',
    'ev_reduction_gear_oil',
    'electric_ac_compressor',
    'ELEC-ALT',
    'ELEC-START',
    'hv_battery_health_check',
    'hv_battery_module',
    'hv_battery_pack',
    'hv_insulation_inspection',
    'hv_cable',
    'ev_dc_dc_converter',
    'ev_traction_motor'
  ]::text[]) AS u(c)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories m WHERE m.code = u.c
  );

  IF v_missing IS NOT NULL
     AND coalesce(current_setting('powertrain.d1.require_all_codes', true), 'off') = 'on' THEN
    RAISE EXCEPTION 'powertrain D1: job code missing: %', array_to_string(v_missing, ', ');
  ELSIF v_missing IS NOT NULL THEN
    RAISE NOTICE 'powertrain D1: skipping missing job codes (local): %', array_to_string(v_missing, ', ');
  END IF;

  WITH vals (
    code, fits_powertrains, fits_fuels, is_high_voltage, desc_sentence
  ) AS (
    VALUES
    ('sys_engine', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('sys_belts', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('sys_transmission', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('sys_exhaust', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('sys_hybrid', ARRAY['hev','phev','erev','bev','fcev']::text[], NULL::text[], false, NULL::text),
    ('spark_plugs', NULL::text[], ARRAY['petrol','cng']::text[], false, NULL::text),
    ('spark_plug_wires', NULL::text[], ARRAY['petrol','cng']::text[], false, NULL::text),
    ('ignition_coil', NULL::text[], ARRAY['petrol','cng']::text[], false, NULL::text),
    ('throttle_body_cleaning', NULL::text[], ARRAY['petrol','cng']::text[], false, NULL::text),
    ('throttle_body_relearn', NULL::text[], ARRAY['petrol','cng']::text[], false, NULL::text),
    ('carburetor_cleaning', NULL::text[], ARRAY['petrol','cng']::text[], false, NULL::text),
    ('oil_filter', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('air_filter', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('fuel_filter', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('oil', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('engine_oil_part', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('coolant_flush', ARRAY['ice','mhev','hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('dpf_cleaning', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('dpf_replacement', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('scr_service', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('adblue_topup', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('nox_sensor', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('glow_plugs', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('egt_sensor', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('dpf_pressure_sensor', NULL::text[], ARRAY['diesel']::text[], false, NULL::text),
    ('evap_canister', NULL::text[], ARRAY['petrol']::text[], false, NULL::text),
    ('purge_valve', NULL::text[], ARRAY['petrol']::text[], false, NULL::text),
    ('ev_charging_port', ARRAY['phev','erev','bev']::text[], NULL::text[], true, NULL::text),
    ('ev_onboard_charger', ARRAY['phev','erev','bev']::text[], NULL::text[], true, NULL::text),
    ('ev_charging_port_cleaning', ARRAY['phev','erev','bev']::text[], NULL::text[], false, 'Visual check and pin cleaning with the car switched off and unplugged; the port housing stays closed. If the housing has to be opened, that''s high-voltage work: log Charging Port and follow lockout.'),
    ('ev_battery_coolant_service', ARRAY['phev','erev','bev']::text[], NULL::text[], false, NULL::text),
    ('ev_battery_coolant_pump', ARRAY['phev','erev','bev']::text[], NULL::text[], false, NULL::text),
    ('hv_battery_fan_filter', ARRAY['hev','phev']::text[], NULL::text[], false, NULL::text),
    ('hv_battery_fan_cleaning', ARRAY['hev','phev']::text[], NULL::text[], false, NULL::text),
    ('inverter_coolant_service', ARRAY['hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('inverter_coolant_pump', ARRAY['hev','phev','erev']::text[], NULL::text[], false, NULL::text),
    ('ev_reduction_gear_oil', ARRAY['bev','erev','fcev']::text[], NULL::text[], false, NULL::text),
    ('electric_ac_compressor', ARRAY['hev','phev','erev','bev','fcev']::text[], NULL::text[], true, 'Belt-driven compressors (petrol cars, a few hybrids) aren''t this job; use the conventional A/C Compressor job once the HVAC file adds it.'),
    ('ELEC-ALT', ARRAY['ice']::text[], NULL::text[], false, NULL::text),
    ('ELEC-START', ARRAY['ice','mhev']::text[], NULL::text[], false, NULL::text),
    ('hv_battery_health_check', NULL::text[], NULL::text[], true, NULL::text),
    ('hv_battery_module', NULL::text[], NULL::text[], true, NULL::text),
    ('hv_battery_pack', NULL::text[], NULL::text[], true, NULL::text),
    ('hv_insulation_inspection', NULL::text[], NULL::text[], true, NULL::text),
    ('hv_cable', NULL::text[], NULL::text[], true, NULL::text),
    ('ev_dc_dc_converter', NULL::text[], NULL::text[], true, NULL::text),
    ('ev_traction_motor', NULL::text[], NULL::text[], true, NULL::text)
  ),
  wanted AS (
    SELECT
      m.id,
      v.fits_powertrains,
      v.fits_fuels,
      v.is_high_voltage,
      CASE
        WHEN v.desc_sentence IS NOT NULL
          AND (
            m.description IS NULL
            OR right(btrim(m.description), length(v.desc_sentence)) <> v.desc_sentence
          )
          THEN btrim(concat_ws(' ', nullif(btrim(m.description), ''), v.desc_sentence))
        ELSE m.description
      END AS description
    FROM vals v
    JOIN public.maintenance_service_categories m ON m.code = v.code
  )
  UPDATE public.maintenance_service_categories m
  SET
    fits_powertrains = w.fits_powertrains,
    fits_fuels = w.fits_fuels,
    is_high_voltage = w.is_high_voltage,
    description = w.description
  FROM wanted w
  WHERE m.id = w.id
    AND (m.fits_powertrains, m.fits_fuels, m.is_high_voltage, m.description)
      IS DISTINCT FROM (w.fits_powertrains, w.fits_fuels, w.is_high_voltage, w.description);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'powertrain D1: job rows changed = %', v_n;
  INSERT INTO pt_d1_counts (what, n) VALUES ('job rows changed', v_n)
  ON CONFLICT (what) DO UPDATE SET n = EXCLUDED.n;
END;
$jobs$;

ALTER TABLE public.maintenance_work_order_lines
  ADD COLUMN IF NOT EXISTS fit_at_log text;

DO $$ BEGIN
  ALTER TABLE public.maintenance_work_order_lines
    ADD CONSTRAINT maintenance_work_order_lines_fit_at_log_check
      CHECK (fit_at_log IS NULL OR fit_at_log = ANY (ARRAY['yes','no','unknown']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.maintenance_work_order_lines.fit_at_log IS
  'Whether this job fit the car when saved (yes/no/unknown). Set on insert and when the line job changes only.';

ALTER TABLE public.vehicle_component_schedule
  ADD COLUMN IF NOT EXISTS retired_reason text;

COMMENT ON COLUMN public.vehicle_component_schedule.retired_reason IS
  'Why a stored schedule row was retired (e.g. job no longer fits this car).';

CREATE OR REPLACE FUNCTION public._job_fit_effective_lists(p_job_id uuid)
RETURNS TABLE (fits_powertrains text[], fits_fuels text[])
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    coalesce(j.fits_powertrains, g.fits_powertrains) AS fits_powertrains,
    coalesce(j.fits_fuels, g.fits_fuels) AS fits_fuels
  FROM public.maintenance_service_categories j
  LEFT JOIN public.maintenance_service_categories g ON g.id = j.parent_id
  WHERE j.id = p_job_id;
$$;

CREATE OR REPLACE FUNCTION public._job_fit_for_model(
  p_job_id uuid,
  p_vehicle_catalog_id uuid,
  p_eff_powertrains text[] DEFAULT NULL,
  p_eff_fuels text[] DEFAULT NULL,
  -- true = use the two lists given (NULL there means "any"); false = read the job's saved lists.
  p_lists_given boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_model record;
  v_pt text[];
  v_fu text[];
  v_app boolean;
BEGIN
  IF p_vehicle_catalog_id IS NULL THEN
    RETURN 'unknown';
  END IF;

  SELECT c.powertrain, c.fuel, c.powertrain_status, c.platform_id, c.vehicle_class
  INTO v_model
  FROM public.vehicle_catalog c
  WHERE c.id = p_vehicle_catalog_id;

  IF NOT FOUND OR v_model.vehicle_class IS DISTINCT FROM 'car' THEN
    RETURN 'unknown';
  END IF;

  IF v_model.powertrain_status = 'needs_check'
     OR v_model.powertrain IS NULL
     OR v_model.fuel IS NULL THEN
    RETURN 'unknown';
  END IF;

  SELECT a.applicable
  INTO v_app
  FROM public.catalog_component_applicability a
  WHERE a.component_id = p_job_id
    AND a.scope = 'variant'
    AND a.vehicle_catalog_id = p_vehicle_catalog_id
  LIMIT 1;
  IF FOUND THEN
    RETURN CASE WHEN v_app THEN 'yes' ELSE 'no' END;
  END IF;

  SELECT a.applicable
  INTO v_app
  FROM public.catalog_component_applicability a
  WHERE a.component_id = p_job_id
    AND a.scope = 'platform'
    AND a.platform_id = v_model.platform_id
  LIMIT 1;
  IF FOUND THEN
    RETURN CASE WHEN v_app THEN 'yes' ELSE 'no' END;
  END IF;

  IF NOT coalesce(p_lists_given, false) THEN
    SELECT e.fits_powertrains, e.fits_fuels
    INTO v_pt, v_fu
    FROM public._job_fit_effective_lists(p_job_id) e;
  ELSE
    v_pt := p_eff_powertrains;
    v_fu := p_eff_fuels;
  END IF;

  IF v_pt IS NOT NULL AND NOT (v_model.powertrain = ANY (v_pt)) THEN
    RETURN 'no';
  END IF;
  IF v_fu IS NOT NULL AND NOT (v_model.fuel = ANY (v_fu)) THEN
    RETURN 'no';
  END IF;
  RETURN 'yes';
END;
$$;

CREATE OR REPLACE FUNCTION public.job_fits_car(
  p_vehicle_catalog_id uuid,
  p_job_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (job_id uuid, fits text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    j.id,
    public._job_fit_for_model(j.id, p_vehicle_catalog_id) AS fits
  FROM public.maintenance_service_categories j
  WHERE j.kind = 'component'
    AND j.status = 'active'
    AND (
      p_job_ids IS NULL
      OR j.id IN (
        SELECT u.uid
        FROM unnest(coalesce(p_job_ids, ARRAY[]::uuid[])) u(uid)
        WHERE u.uid IS NOT NULL
      )
    )
  ORDER BY j.sort_order, j.code;
$$;

COMMENT ON FUNCTION public.job_fits_car(uuid, uuid[]) IS
  'Assumes vehicle_class = ''car''. Extend when other classes are added.';

CREATE OR REPLACE FUNCTION public.job_fit_count(
  p_job_id uuid,
  p_overrides jsonb DEFAULT NULL
)
RETURNS TABLE (fits int, unknown int, total int)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_pt text[];
  v_fu text[];
  v_key text;
BEGIN
  SELECT j.*, g.fits_powertrains AS g_pt, g.fits_fuels AS g_fu
  INTO v_job
  FROM public.maintenance_service_categories j
  LEFT JOIN public.maintenance_service_categories g ON g.id = j.parent_id
  WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_fit_count_bad_override' USING HINT = 'Job not found.';
  END IF;

  v_pt := coalesce(v_job.fits_powertrains, v_job.g_pt);
  v_fu := coalesce(v_job.fits_fuels, v_job.g_fu);

  IF p_overrides IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_overrides)
    LOOP
      IF v_key NOT IN ('fits_powertrains', 'fits_fuels') THEN
        RAISE EXCEPTION 'job_fit_count_bad_override'
          USING HINT = 'Only fits_powertrains and fits_fuels may be overridden.';
      END IF;
    END LOOP;

    IF p_overrides ? 'fits_powertrains' THEN
      IF jsonb_typeof(p_overrides -> 'fits_powertrains') = 'null' THEN
        v_pt := v_job.g_pt;
      ELSIF jsonb_typeof(p_overrides -> 'fits_powertrains') = 'array' THEN
        IF jsonb_array_length(p_overrides -> 'fits_powertrains') = 0 THEN
          RAISE EXCEPTION 'job_fit_count_bad_override'
            USING HINT = 'fits_powertrains cannot be an empty array.';
        END IF;
        v_pt := ARRAY(SELECT jsonb_array_elements_text(p_overrides -> 'fits_powertrains'));
      ELSE
        RAISE EXCEPTION 'job_fit_count_bad_override'
          USING HINT = 'fits_powertrains override must be null or an array.';
      END IF;
    END IF;

    IF p_overrides ? 'fits_fuels' THEN
      IF jsonb_typeof(p_overrides -> 'fits_fuels') = 'null' THEN
        v_fu := v_job.g_fu;
      ELSIF jsonb_typeof(p_overrides -> 'fits_fuels') = 'array' THEN
        IF jsonb_array_length(p_overrides -> 'fits_fuels') = 0 THEN
          RAISE EXCEPTION 'job_fit_count_bad_override'
            USING HINT = 'fits_fuels cannot be an empty array.';
        END IF;
        v_fu := ARRAY(SELECT jsonb_array_elements_text(p_overrides -> 'fits_fuels'));
      ELSE
        RAISE EXCEPTION 'job_fit_count_bad_override'
          USING HINT = 'fits_fuels override must be null or an array.';
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE x.a = 'yes')::int,
    count(*) FILTER (WHERE x.a = 'unknown')::int,
    count(*)::int
  FROM (
    SELECT public._job_fit_for_model(p_job_id, c.id, v_pt, v_fu, true) AS a
    FROM public.vehicle_catalog c
    WHERE c.vehicle_class = 'car'
  ) x;
END;
$$;

REVOKE ALL ON FUNCTION public.vehicle_catalog_derive_powertrain(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vehicle_catalog_trg_derive_powertrain()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._job_fit_effective_lists(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._job_fit_for_model(uuid, uuid, text[], text[], boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_fits_car(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_fit_count(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_fits_car(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_fit_count(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION fleet._line_fit_at_log(
  p_vehicle_catalog_id uuid,
  p_component_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_vehicle_catalog_id IS NULL OR p_component_id IS NULL THEN 'unknown'
    ELSE coalesce(
      (
        SELECT f.fits
        FROM public.job_fits_car(p_vehicle_catalog_id, ARRAY[p_component_id]) f
        LIMIT 1
      ),
      'unknown'
    )
  END;
$$;

REVOKE ALL ON FUNCTION fleet._line_fit_at_log(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet._line_fit_at_log(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fleet_save_work_order(
  p_organization_id text,
  p_actor_id uuid,
  p_status text,
  p_work_order jsonb,
  p_work_order_id uuid,
  p_expected_version integer,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_wo public.maintenance_work_orders%ROWTYPE;
  v_wo_id uuid;
  v_line jsonb;
  v_item jsonb;
  v_line_id uuid;
  v_incoming_ids uuid[] := ARRAY[]::uuid[];
  v_discount numeric;
  v_line_sum numeric;
  v_new_total numeric;
  v_items jsonb;
  v_declined boolean;
  v_expected_items numeric;
  v_actual_items numeric;
  v_now timestamptz := now();
  v_other_wo uuid;
  v_voided boolean;
  v_vehicle_catalog_id uuid;
  v_old_component uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required' USING HINT = 'Saving user is required.';
  END IF;
  PERFORM set_config('app.actor_id', p_actor_id::text, true);

  IF p_status IS NULL OR p_status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'status_invalid' USING HINT = 'Status must be draft or in_progress.';
  END IF;

  IF p_work_order_id IS NULL THEN
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'version_on_create' USING HINT = 'Do not send expected version when creating.';
    END IF;
    v_wo_id := coalesce(nullif(p_work_order ->> 'id', '')::uuid, gen_random_uuid());
    IF EXISTS (SELECT 1 FROM public.maintenance_work_orders w WHERE w.id = v_wo_id) THEN
      RAISE EXCEPTION 'work_order_id_taken' USING HINT = 'That work order id is already in use.';
    END IF;
    IF nullif(p_work_order ->> 'vehicle_id', '') IS NULL THEN
      RAISE EXCEPTION 'status_invalid' USING HINT = 'vehicle_id is required.';
    END IF;
    INSERT INTO public.maintenance_work_orders (
      id,
      organization_id,
      vehicle_id,
      status,
      log_mode,
      idempotency_key,
      log_number,
      performed_at_date,
      odometer,
      provider,
      currency,
      template_id,
      package_complete,
      notes,
      invoice_url,
      discount_amount,
      payload_json,
      updated_by,
      opened_at,
      total_cost,
      version
    ) VALUES (
      v_wo_id,
      p_organization_id,
      p_work_order ->> 'vehicle_id',
      p_status,
      coalesce(nullif(p_work_order ->> 'log_mode', ''), 'quick_job'),
      CASE WHEN p_work_order ? 'idempotency_key'
        THEN nullif(p_work_order ->> 'idempotency_key', '') END,
      CASE WHEN p_work_order ? 'log_number'
        THEN nullif(p_work_order ->> 'log_number', '') END,
      CASE WHEN p_work_order ? 'performed_at_date'
        THEN nullif(p_work_order ->> 'performed_at_date', '')::date END,
      CASE WHEN p_work_order ? 'odometer'
        THEN nullif(p_work_order ->> 'odometer', '')::integer END,
      CASE WHEN p_work_order ? 'provider'
        THEN nullif(p_work_order ->> 'provider', '') END,
      coalesce(nullif(p_work_order ->> 'currency', ''), 'JMD'),
      CASE WHEN p_work_order ? 'template_id'
        THEN nullif(p_work_order ->> 'template_id', '')::uuid END,
      coalesce((p_work_order ->> 'package_complete')::boolean, false),
      CASE WHEN p_work_order ? 'notes' THEN p_work_order ->> 'notes' END,
      CASE WHEN p_work_order ? 'invoice_url'
        THEN nullif(p_work_order ->> 'invoice_url', '') END,
      coalesce(nullif(p_work_order ->> 'discount_amount', '')::numeric, 0),
      CASE WHEN p_work_order ? 'payload_json' THEN
        CASE WHEN jsonb_typeof(p_work_order -> 'payload_json') = 'null' THEN NULL
        ELSE p_work_order -> 'payload_json' END
      ELSE '{}'::jsonb END,
      p_actor_id,
      v_now,
      0,
      1
    );
  ELSE
    IF p_expected_version IS NULL THEN
      RAISE EXCEPTION 'version_required' USING HINT = 'Send the work order version you loaded.';
    END IF;
    SELECT * INTO v_wo
    FROM public.maintenance_work_orders
    WHERE id = p_work_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'work_order_not_found' USING HINT = 'Work order not found.';
    END IF;
    IF v_wo.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'work_order_org_mismatch' USING HINT = 'Work order is not in this fleet.';
    END IF;
    IF v_wo.voided_at IS NOT NULL OR v_wo.status NOT IN ('draft', 'in_progress') THEN
      RAISE EXCEPTION 'immutable'
        USING HINT = 'This service is finished and can no longer be edited.';
    END IF;
    IF v_wo.completing_since IS NOT NULL
       AND v_wo.completing_since >= v_now - interval '10 minutes' THEN
      RAISE EXCEPTION 'completion_in_progress' USING HINT = 'This service is still finishing.';
    END IF;
    IF v_wo.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'stale_edit' USING HINT = 'Someone else saved this service first.';
    END IF;
    v_wo_id := v_wo.id;
    UPDATE public.maintenance_work_orders
    SET
      performed_at_date = CASE WHEN p_work_order ? 'performed_at_date'
        THEN nullif(p_work_order ->> 'performed_at_date', '')::date
        ELSE performed_at_date END,
      odometer = CASE WHEN p_work_order ? 'odometer'
        THEN nullif(p_work_order ->> 'odometer', '')::integer
        ELSE odometer END,
      provider = CASE WHEN p_work_order ? 'provider'
        THEN nullif(p_work_order ->> 'provider', '')
        ELSE provider END,
      currency = coalesce(nullif(p_work_order ->> 'currency', ''), currency),
      template_id = CASE WHEN p_work_order ? 'template_id'
        THEN nullif(p_work_order ->> 'template_id', '')::uuid
        ELSE template_id END,
      package_complete = coalesce(
        (p_work_order ->> 'package_complete')::boolean,
        package_complete
      ),
      notes = CASE WHEN p_work_order ? 'notes'
        THEN p_work_order ->> 'notes'
        ELSE notes END,
      invoice_url = CASE WHEN p_work_order ? 'invoice_url'
        THEN nullif(p_work_order ->> 'invoice_url', '')
        ELSE invoice_url END,
      discount_amount = coalesce(
        nullif(p_work_order ->> 'discount_amount', '')::numeric,
        discount_amount
      ),
      payload_json = CASE WHEN p_work_order ? 'payload_json' THEN
        CASE WHEN jsonb_typeof(p_work_order -> 'payload_json') = 'null' THEN NULL
        ELSE p_work_order -> 'payload_json' END
      ELSE payload_json END,
      status = p_status,
      updated_by = p_actor_id
    WHERE id = v_wo_id;
  END IF;

  -- A malformed link must never fail a save: it just means 'unknown'.
  SELECT CASE
    WHEN v.vehicle_catalog_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN v.vehicle_catalog_id::uuid
  END
  INTO v_vehicle_catalog_id
  FROM public.maintenance_work_orders wo
  JOIN fleet.vehicles v
    ON v.id = wo.vehicle_id
   AND v.organization_id::text = wo.organization_id
  WHERE wo.id = v_wo_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  LOOP
    v_voided := false;
    v_declined := coalesce((v_line ->> 'declined')::boolean, false);
    v_items := CASE
      WHEN NOT (v_line ? 'items') THEN '[]'::jsonb
      WHEN jsonb_typeof(v_line -> 'items') = 'null' THEN '[]'::jsonb
      WHEN jsonb_typeof(v_line -> 'items') = 'array' THEN v_line -> 'items'
      ELSE '[]'::jsonb
    END;
    IF v_declined AND jsonb_array_length(v_items) > 0 THEN
      RAISE EXCEPTION 'line_items_on_declined' USING HINT = 'Declined jobs cannot include items.';
    END IF;

    v_line_id := nullif(v_line ->> 'id', '')::uuid;
    IF v_line_id IS NOT NULL THEN
      SELECT l.component_id INTO v_old_component
      FROM public.maintenance_work_order_lines l
      WHERE l.id = v_line_id;

      UPDATE public.maintenance_work_order_lines
      SET
        sort_order = coalesce((v_line ->> 'sort_order')::integer, sort_order),
        system_id = CASE WHEN v_line ? 'system_id'
          THEN nullif(v_line ->> 'system_id', '')::uuid
          ELSE system_id END,
        component_id = CASE WHEN v_line ? 'component_id'
          THEN nullif(v_line ->> 'component_id', '')::uuid
          ELSE component_id END,
        system_code = CASE WHEN v_line ? 'system_code'
          THEN v_line ->> 'system_code'
          ELSE system_code END,
        system_name = CASE WHEN v_line ? 'system_name'
          THEN v_line ->> 'system_name'
          ELSE system_name END,
        component_code = CASE WHEN v_line ? 'component_code'
          THEN v_line ->> 'component_code'
          ELSE component_code END,
        component_name = CASE WHEN v_line ? 'component_name'
          THEN v_line ->> 'component_name'
          ELSE component_name END,
        action = coalesce(nullif(v_line ->> 'action', ''), action),
        qty = CASE WHEN v_line ? 'qty'
          THEN nullif(v_line ->> 'qty', '')::numeric
          ELSE qty END,
        unit_price = CASE WHEN v_line ? 'unit_price'
          THEN nullif(v_line ->> 'unit_price', '')::numeric
          ELSE unit_price END,
        material = CASE WHEN v_line ? 'material'
          THEN nullif(v_line ->> 'material', '')::numeric
          ELSE material END,
        labor_amount = CASE WHEN v_line ? 'labor_amount'
          THEN nullif(v_line ->> 'labor_amount', '')::numeric
          ELSE labor_amount END,
        labor_hours = CASE WHEN v_line ? 'labor_hours'
          THEN nullif(v_line ->> 'labor_hours', '')::numeric
          ELSE labor_hours END,
        labor_rate = CASE WHEN v_line ? 'labor_rate'
          THEN nullif(v_line ->> 'labor_rate', '')::numeric
          ELSE labor_rate END,
        condition = CASE WHEN v_line ? 'condition'
          THEN v_line ->> 'condition'
          ELSE condition END,
        positions = CASE
          WHEN v_line ? 'positions' THEN
            CASE WHEN jsonb_typeof(v_line -> 'positions') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(v_line -> 'positions'))
              ELSE NULL
            END
          ELSE positions
        END,
        brand = CASE WHEN v_line ? 'brand'
          THEN v_line ->> 'brand'
          ELSE brand END,
        part_number = CASE WHEN v_line ? 'part_number'
          THEN v_line ->> 'part_number'
          ELSE part_number END,
        warranty = coalesce((v_line ->> 'warranty')::boolean, warranty),
        complimentary = coalesce((v_line ->> 'complimentary')::boolean, complimentary),
        part_id = CASE WHEN v_line ? 'part_id'
          THEN nullif(v_line ->> 'part_id', '')::uuid
          ELSE part_id END,
        supplier_part_offer_id = CASE WHEN v_line ? 'supplier_part_offer_id'
          THEN nullif(v_line ->> 'supplier_part_offer_id', '')::uuid
          ELSE supplier_part_offer_id END,
        notes = CASE WHEN v_line ? 'notes'
          THEN v_line ->> 'notes'
          ELSE notes END,
        recommended = coalesce((v_line ->> 'recommended')::boolean, recommended),
        declined = v_declined,
        values_json = CASE WHEN v_line ? 'values_json' THEN
          CASE WHEN jsonb_typeof(v_line -> 'values_json') = 'null' THEN NULL
          ELSE v_line -> 'values_json' END
        ELSE values_json END,
        line_total = CASE WHEN v_line ? 'line_total'
          THEN nullif(v_line ->> 'line_total', '')::numeric
          ELSE line_total END,
        items_amount = coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0),
        fit_at_log = CASE
          WHEN v_line ? 'component_id'
            AND nullif(v_line ->> 'component_id', '')::uuid IS DISTINCT FROM v_old_component
            THEN fleet._line_fit_at_log(
              v_vehicle_catalog_id,
              nullif(v_line ->> 'component_id', '')::uuid
            )
          ELSE fit_at_log
        END,
        updated_by = p_actor_id,
        updated_at = v_now
      WHERE id = v_line_id
        AND work_order_id = v_wo_id
        AND voided_at IS NULL;

      IF NOT FOUND THEN
        SELECT l.work_order_id, l.voided_at IS NOT NULL
        INTO v_other_wo, v_voided
        FROM public.maintenance_work_order_lines l
        WHERE l.id = v_line_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'line_work_order_mismatch' USING HINT = 'Line id is not part of this work order.';
        ELSIF v_other_wo IS DISTINCT FROM v_wo_id THEN
          RAISE EXCEPTION 'line_work_order_mismatch' USING HINT = 'Line belongs to another work order.';
        ELSIF v_voided THEN
          v_incoming_ids := array_append(v_incoming_ids, v_line_id);
          CONTINUE;
        ELSE
          RAISE EXCEPTION 'line_work_order_mismatch' USING HINT = 'Line could not be updated.';
        END IF;
      END IF;
    ELSE
      v_line_id := gen_random_uuid();
      INSERT INTO public.maintenance_work_order_lines (
        id,
        work_order_id,
        sort_order,
        system_id,
        component_id,
        system_code,
        system_name,
        component_code,
        component_name,
        action,
        qty,
        unit_price,
        material,
        labor_amount,
        labor_hours,
        labor_rate,
        condition,
        positions,
        brand,
        part_number,
        warranty,
        complimentary,
        part_id,
        supplier_part_offer_id,
        notes,
        recommended,
        declined,
        values_json,
        line_total,
        items_amount,
        fit_at_log,
        updated_by,
        updated_at
      ) VALUES (
        v_line_id,
        v_wo_id,
        coalesce((v_line ->> 'sort_order')::integer, 0),
        CASE WHEN v_line ? 'system_id'
          THEN nullif(v_line ->> 'system_id', '')::uuid END,
        CASE WHEN v_line ? 'component_id'
          THEN nullif(v_line ->> 'component_id', '')::uuid END,
        CASE WHEN v_line ? 'system_code' THEN v_line ->> 'system_code' END,
        CASE WHEN v_line ? 'system_name' THEN v_line ->> 'system_name' END,
        CASE WHEN v_line ? 'component_code' THEN v_line ->> 'component_code' END,
        coalesce(v_line ->> 'component_name', ''),
        coalesce(nullif(v_line ->> 'action', ''), 'other'),
        CASE WHEN v_line ? 'qty' THEN nullif(v_line ->> 'qty', '')::numeric END,
        CASE WHEN v_line ? 'unit_price'
          THEN nullif(v_line ->> 'unit_price', '')::numeric END,
        CASE WHEN v_line ? 'material'
          THEN nullif(v_line ->> 'material', '')::numeric END,
        CASE WHEN v_line ? 'labor_amount'
          THEN nullif(v_line ->> 'labor_amount', '')::numeric END,
        CASE WHEN v_line ? 'labor_hours'
          THEN nullif(v_line ->> 'labor_hours', '')::numeric END,
        CASE WHEN v_line ? 'labor_rate'
          THEN nullif(v_line ->> 'labor_rate', '')::numeric END,
        CASE WHEN v_line ? 'condition' THEN v_line ->> 'condition' END,
        CASE
          WHEN v_line ? 'positions' THEN
            CASE WHEN jsonb_typeof(v_line -> 'positions') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(v_line -> 'positions'))
              ELSE NULL
            END
          ELSE NULL
        END,
        CASE WHEN v_line ? 'brand' THEN v_line ->> 'brand' END,
        CASE WHEN v_line ? 'part_number' THEN v_line ->> 'part_number' END,
        coalesce((v_line ->> 'warranty')::boolean, false),
        coalesce((v_line ->> 'complimentary')::boolean, false),
        CASE WHEN v_line ? 'part_id'
          THEN nullif(v_line ->> 'part_id', '')::uuid END,
        CASE WHEN v_line ? 'supplier_part_offer_id'
          THEN nullif(v_line ->> 'supplier_part_offer_id', '')::uuid END,
        CASE WHEN v_line ? 'notes' THEN v_line ->> 'notes' END,
        coalesce((v_line ->> 'recommended')::boolean, false),
        v_declined,
        CASE WHEN v_line ? 'values_json' THEN
          CASE WHEN jsonb_typeof(v_line -> 'values_json') = 'null' THEN NULL
          ELSE v_line -> 'values_json' END
        ELSE '{}'::jsonb END,
        coalesce(nullif(v_line ->> 'line_total', '')::numeric, 0),
        coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0),
        fleet._line_fit_at_log(
          v_vehicle_catalog_id,
          CASE WHEN v_line ? 'component_id'
            THEN nullif(v_line ->> 'component_id', '')::uuid
          END
        ),
        p_actor_id,
        v_now
      );
    END IF;

    v_incoming_ids := array_append(v_incoming_ids, v_line_id);

    IF NOT fleet._mwoli_items_multiset_equal(v_line_id, v_items) THEN
      DELETE FROM public.maintenance_work_order_line_item
      WHERE work_order_line_id = v_line_id;

      FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
      LOOP
        INSERT INTO public.maintenance_work_order_line_item (
          work_order_id,
          work_order_line_id,
          source,
          job_item_id,
          item_kind,
          part_type_id,
          supply_id,
          part_id,
          item_name,
          unit_label,
          brand,
          part_number,
          part_source,
          qty,
          unit_cost,
          updated_by
        ) VALUES (
          v_wo_id,
          v_line_id,
          v_item ->> 'source',
          nullif(v_item ->> 'job_item_id', '')::uuid,
          v_item ->> 'item_kind',
          nullif(v_item ->> 'part_type_id', '')::uuid,
          nullif(v_item ->> 'supply_id', '')::uuid,
          nullif(v_item ->> 'part_id', '')::uuid,
          coalesce(v_item ->> 'item_name', ''),
          coalesce(v_item ->> 'unit_label', ''),
          nullif(v_item ->> 'brand', ''),
          nullif(v_item ->> 'part_number', ''),
          nullif(btrim(v_item ->> 'part_source'), ''),
          (v_item ->> 'qty')::numeric(12, 3),
          CASE
            WHEN v_item ? 'unit_cost'
              AND v_item ->> 'unit_cost' IS NOT NULL
              AND btrim(v_item ->> 'unit_cost') <> ''
              THEN (v_item ->> 'unit_cost')::numeric(12, 2)
            ELSE NULL
          END,
          p_actor_id
        );
      END LOOP;
    END IF;

    v_expected_items := coalesce(nullif(v_line ->> 'items_amount', '')::numeric, 0);
    SELECT coalesce(sum(i.amount), 0) INTO v_actual_items
    FROM public.maintenance_work_order_line_item i
    WHERE i.work_order_line_id = v_line_id;
    IF round(v_expected_items, 2) IS DISTINCT FROM round(v_actual_items, 2) THEN
      RAISE EXCEPTION 'line_items_amount_mismatch' USING HINT = 'items_amount does not match item rows.';
    END IF;

    UPDATE public.maintenance_work_order_lines
    SET items_amount = round(v_actual_items, 2)
    WHERE id = v_line_id;
  END LOOP;

  DELETE FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = v_wo_id
    AND l.voided_at IS NULL
    AND NOT (l.id = ANY (v_incoming_ids));

  SELECT coalesce(sum(l.line_total), 0)
  INTO v_line_sum
  FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = v_wo_id
    AND l.voided_at IS NULL;

  SELECT w.discount_amount INTO v_discount
  FROM public.maintenance_work_orders w
  WHERE w.id = v_wo_id;

  v_new_total := round(v_line_sum - coalesce(v_discount, 0), 2);

  UPDATE public.maintenance_work_orders
  SET total_cost = v_new_total,
      updated_by = p_actor_id
  WHERE id = v_wo_id;

  RETURN jsonb_build_object(
    'work_order',
    (SELECT to_jsonb(w) FROM public.maintenance_work_orders w WHERE w.id = v_wo_id),
    'lines',
    (
      SELECT coalesce(jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'items',
          coalesce((
            SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at, i.id)
            FROM public.maintenance_work_order_line_item i
            WHERE i.work_order_line_id = l.id
          ), '[]'::jsonb)
        )
        ORDER BY l.sort_order, l.created_at
      ), '[]'::jsonb)
      FROM public.maintenance_work_order_lines l
      WHERE l.work_order_id = v_wo_id
        AND l.voided_at IS NULL
    )
  );
END;
$function$;



REVOKE ALL ON FUNCTION public.fleet_save_work_order(
  text, uuid, text, jsonb, uuid, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_save_work_order(
  text, uuid, text, jsonb, uuid, integer, jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';
-- Safety: all 6b assertions; any failure undoes everything above.
DO $chk$
DECLARE
  v_bad bigint;
  v_ids text;
  v_roomy uuid;
  v_fit uuid;
  v_cnt bigint;
  v_car_ch int;
  v_job_ch int;
  v_rev_before bigint;
  v_rev_now bigint;
  v_rev_delta bigint;
  v_sched int;
  v_mhev_yes bigint;
  v_n int;
  v_desc_sent text;
  v_old text;
  v_new text;
  v_fits text;
  v_misc text;
BEGIN
  -- 1: derived/confirmed must have values; no other row with powertrain NULL
  SELECT count(*) INTO v_bad
  FROM public.vehicle_catalog
  WHERE powertrain IS NULL AND powertrain_status IS DISTINCT FROM 'needs_check';
  IF v_bad > 0 THEN
  RAISE EXCEPTION 'Stopped, nothing saved: powertrain_null_not_needs_check on % rows', v_bad;
  END IF;

  -- 2: 3a split (live counts, 15 Nov 2026)
  SELECT count(*) INTO v_cnt FROM public.vehicle_catalog WHERE vehicle_class = 'car';
  IF v_cnt <> 2679 THEN
    RAISE EXCEPTION 'Stopped, nothing saved: car_models on count %', v_cnt;
  END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain_status = 'needs_check';
  IF v_n <> 12 THEN RAISE EXCEPTION 'Stopped, nothing saved: needs_check on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'mhev';
  IF v_n <> 7 THEN RAISE EXCEPTION 'Stopped, nothing saved: mhev on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'bev';
  IF v_n <> 313 THEN RAISE EXCEPTION 'Stopped, nothing saved: bev on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'fcev';
  IF v_n <> 2 THEN RAISE EXCEPTION 'Stopped, nothing saved: fcev on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'phev';
  IF v_n <> 33 THEN RAISE EXCEPTION 'Stopped, nothing saved: phev on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'erev';
  IF v_n <> 34 THEN RAISE EXCEPTION 'Stopped, nothing saved: erev on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'hev';
  IF v_n <> 203 THEN RAISE EXCEPTION 'Stopped, nothing saved: hev on count %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain = 'ice';
  IF v_n <> 2075 THEN RAISE EXCEPTION 'Stopped, nothing saved: ice on count %', v_n; END IF;

  -- 3: known codes only
  SELECT count(*) INTO v_bad
  FROM public.vehicle_catalog
  WHERE powertrain IS NOT NULL
    AND powertrain <> ALL (ARRAY['ice','mhev','hev','phev','erev','bev','fcev']);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: bad_powertrain on % rows', v_bad; END IF;
  SELECT count(*) INTO v_bad
  FROM public.vehicle_catalog
  WHERE fuel IS NOT NULL
    AND fuel <> ALL (ARRAY['petrol','diesel','cng','hydrogen','electric']);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: bad_fuel on % rows', v_bad; END IF;
  SELECT count(*) INTO v_bad
  FROM public.maintenance_service_categories
  WHERE fits_powertrains IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(fits_powertrains) e
    WHERE e <> ALL (ARRAY['ice','mhev','hev','phev','erev','bev','fcev'])
  );
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: bad_fits_powertrains on % rows', v_bad; END IF;
  SELECT count(*) INTO v_bad
  FROM public.maintenance_service_categories
  WHERE fits_fuels IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(fits_fuels) e
    WHERE e <> ALL (ARRAY['petrol','diesel','cng','hydrogen','electric'])
  );
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: bad_fits_fuels on % rows', v_bad; END IF;

  -- 4: no empty fits arrays
  SELECT count(*) INTO v_bad FROM public.maintenance_service_categories
  WHERE (fits_powertrains IS NOT NULL AND cardinality(fits_powertrains) = 0)
     OR (fits_fuels IS NOT NULL AND cardinality(fits_fuels) = 0);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: empty_fits_arrays on % rows', v_bad; END IF;

  -- 5: the two Fleet cars' own linked models (5179KZ Roomy, 1505LM Honda Fit).
  -- By link, not by name: Dominion has 5 Roomy and 11 Honda Fit models (7 Fit are petrol).
  SELECT nullif(v.vehicle_catalog_id, '')::uuid INTO v_roomy
  FROM fleet.vehicles v WHERE v.id = '5179KZ';
  IF v_roomy IS NULL THEN RAISE EXCEPTION 'Stopped, nothing saved: roomy_lookup on 5179KZ not linked'; END IF;
  SELECT nullif(v.vehicle_catalog_id, '')::uuid INTO v_fit
  FROM fleet.vehicles v WHERE v.id = '1505LM';
  IF v_fit IS NULL THEN RAISE EXCEPTION 'Stopped, nothing saved: fit_lookup on 1505LM not linked'; END IF;
  SELECT count(*) INTO v_bad
  FROM public.vehicle_catalog
  WHERE id = v_roomy
    AND (powertrain IS DISTINCT FROM 'ice' OR fuel IS DISTINCT FROM 'petrol' OR powertrain_status IS DISTINCT FROM 'derived');
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: roomy_powertrain on %', v_roomy; END IF;
  SELECT count(*) INTO v_bad
  FROM public.vehicle_catalog
  WHERE id = v_fit
    AND (powertrain IS DISTINCT FROM 'hev' OR fuel IS DISTINCT FROM 'petrol' OR powertrain_status IS DISTINCT FROM 'derived');
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: fit_powertrain on %', v_fit; END IF;

  -- 6: exactly 10 HV jobs
  SELECT count(*) INTO v_n FROM public.maintenance_service_categories
  WHERE kind = 'component' AND is_high_voltage;
  IF v_n <> 10 THEN RAISE EXCEPTION 'Stopped, nothing saved: high_voltage_job_count on %', v_n; END IF;
  SELECT count(*) INTO v_bad FROM public.maintenance_service_categories
  WHERE kind = 'component' AND is_high_voltage
    AND code <> ALL (ARRAY[
      'hv_battery_health_check','hv_battery_module','hv_battery_pack',
      'hv_insulation_inspection','hv_cable','ev_charging_port','ev_onboard_charger',
      'ev_dc_dc_converter','ev_traction_motor','electric_ac_compressor'
    ]);
  IF v_bad > 0 THEN
    SELECT string_agg(code, ', ') INTO v_ids FROM public.maintenance_service_categories
    WHERE kind = 'component' AND is_high_voltage
      AND code <> ALL (ARRAY[
        'hv_battery_health_check','hv_battery_module','hv_battery_pack',
        'hv_insulation_inspection','hv_cable','ev_charging_port','ev_onboard_charger',
        'ev_dc_dc_converter','ev_traction_motor','electric_ac_compressor'
      ]);
    RAISE EXCEPTION 'Stopped, nothing saved: unexpected_high_voltage on %', v_ids;
  END IF;
  SELECT count(*) INTO v_bad FROM public.maintenance_service_categories
  WHERE kind = 'component'
    AND code = ANY (ARRAY[
      'hv_battery_health_check','hv_battery_module','hv_battery_pack',
      'hv_insulation_inspection','hv_cable','ev_charging_port','ev_onboard_charger',
      'ev_dc_dc_converter','ev_traction_motor','electric_ac_compressor'
    ])
    AND NOT is_high_voltage;
  IF v_bad > 0 THEN
    SELECT string_agg(code, ', ') INTO v_ids FROM public.maintenance_service_categories
    WHERE kind = 'component'
      AND code = ANY (ARRAY[
        'hv_battery_health_check','hv_battery_module','hv_battery_pack',
        'hv_insulation_inspection','hv_cable','ev_charging_port','ev_onboard_charger',
        'ev_dc_dc_converter','ev_traction_motor','electric_ac_compressor'
      ])
      AND NOT is_high_voltage;
    RAISE EXCEPTION 'Stopped, nothing saved: missing_high_voltage on %', v_ids;
  END IF;

  -- 7: job_fits_car on Roomy and Fit
  SELECT count(*) INTO v_bad
  FROM public.maintenance_service_categories j
  JOIN public.maintenance_service_categories g ON g.id = j.parent_id
  WHERE g.code = 'sys_hybrid' AND j.kind = 'component' AND j.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.job_fits_car(v_roomy, ARRAY[j.id]) f WHERE f.fits <> 'no'
    );
  IF v_bad > 0 THEN
    SELECT string_agg(j.code, ', ') INTO v_ids
    FROM public.maintenance_service_categories j
    JOIN public.maintenance_service_categories g ON g.id = j.parent_id
    WHERE g.code = 'sys_hybrid' AND j.kind = 'component' AND j.status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.job_fits_car(v_roomy, ARRAY[j.id]) f WHERE f.fits <> 'no'
      );
    RAISE EXCEPTION 'Stopped, nothing saved: roomy_hybrid_job_fits on %', v_ids;
  END IF;
  SELECT f.fits INTO v_fits
  FROM public.job_fits_car(v_roomy, ARRAY[(SELECT id FROM public.maintenance_service_categories WHERE code = 'oil' LIMIT 1)]) f
  LIMIT 1;
  IF v_fits IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Stopped, nothing saved: roomy_engine_oil on %', v_fits;
  END IF;
  SELECT f.fits INTO v_fits
  FROM public.job_fits_car(
    v_fit,
    ARRAY[(SELECT id FROM public.maintenance_service_categories WHERE code = 'inverter_coolant_service' LIMIT 1)]
  ) f LIMIT 1;
  IF v_fits IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Stopped, nothing saved: fit_inverter_coolant on %', v_fits;
  END IF;
  SELECT count(*) INTO v_bad
  FROM (VALUES ('ev_charging_port'), ('ELEC-ALT')) AS t(code)
  JOIN public.maintenance_service_categories j ON j.code = t.code
  WHERE EXISTS (
    SELECT 1 FROM public.job_fits_car(v_fit, ARRAY[j.id]) f WHERE f.fits <> 'no'
  );
  IF v_bad > 0 THEN
    SELECT string_agg(t.code, ', ') INTO v_ids
    FROM (VALUES ('ev_charging_port'), ('ELEC-ALT')) AS t(code)
    JOIN public.maintenance_service_categories j ON j.code = t.code
    WHERE EXISTS (
      SELECT 1 FROM public.job_fits_car(v_fit, ARRAY[j.id]) f WHERE f.fits <> 'no'
    );
    RAISE EXCEPTION 'Stopped, nothing saved: fit_should_not_fit on %', v_ids;
  END IF;

  -- 8: schedule rows the nightly retire rule would touch
  SELECT count(*) INTO v_sched
  FROM public.vehicle_component_schedule s
  JOIN fleet.vehicles v
    ON v.id = s.vehicle_id
   AND v.organization_id::text = s.organization_id
  WHERE s.schedule_status IS DISTINCT FROM 'retired'
    AND nullif(v.vehicle_catalog_id, '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.job_fits_car(nullif(v.vehicle_catalog_id, '')::uuid, ARRAY[s.category_id]) jf
      WHERE jf.fits = 'no'
    );
  RAISE NOTICE 'powertrain D1: schedule rows retire rule would touch = %', v_sched;
  IF v_sched <> 0 THEN
    RAISE EXCEPTION 'Stopped, nothing saved: schedule_retire_would_touch on % rows', v_sched;
  END IF;

  -- 9: changed_other across snapshots
  SELECT string_agg(b.id::text, ', ') INTO v_ids
  FROM pt_snap_vc b
  JOIN public.vehicle_catalog c ON c.id = b.id
  WHERE b.h <> md5(
    (to_jsonb(c.*) - ARRAY[
      'powertrain','fuel','powertrain_status','powertrain_note',
      'powertrain_last_confirmed_by','powertrain_last_confirmed_at'
    ])::text
  );
  IF v_ids IS NOT NULL THEN RAISE EXCEPTION 'Stopped, nothing saved: changed_other_vehicle_catalog on %', v_ids; END IF;

  SELECT string_agg(b.id::text, ', ') INTO v_ids
  FROM pt_snap_msc b
  JOIN public.maintenance_service_categories c ON c.id = b.id
  WHERE b.h <> md5(
    (to_jsonb(c.*) - ARRAY['fits_powertrains','fits_fuels','is_high_voltage','description'])::text
  );
  IF v_ids IS NOT NULL THEN RAISE EXCEPTION 'Stopped, nothing saved: changed_other_msc on %', v_ids; END IF;

  v_desc_sent := 'Visual check and pin cleaning with the car switched off and unplugged; the port housing stays closed. If the housing has to be opened, that''s high-voltage work: log Charging Port and follow lockout.';
  SELECT b.d, coalesce(c.description, '') INTO v_old, v_new
  FROM pt_snap_msc_desc b
  JOIN public.maintenance_service_categories c ON c.id = b.id
  WHERE b.code = 'ev_charging_port_cleaning';
  -- Exactly old + the sentence (or unchanged, only when old already ended with it: a re-run).
  IF v_new IS DISTINCT FROM (CASE
       WHEN right(btrim(v_old), length(v_desc_sent)) = v_desc_sent THEN v_old
       ELSE btrim(concat_ws(' ', nullif(btrim(v_old), ''), v_desc_sent))
     END) THEN
    RAISE EXCEPTION 'Stopped, nothing saved: changed_description on ev_charging_port_cleaning';
  END IF;

  v_desc_sent := 'Belt-driven compressors (petrol cars, a few hybrids) aren''t this job; use the conventional A/C Compressor job once the HVAC file adds it.';
  SELECT b.d, coalesce(c.description, '') INTO v_old, v_new
  FROM pt_snap_msc_desc b
  JOIN public.maintenance_service_categories c ON c.id = b.id
  WHERE b.code = 'electric_ac_compressor';
  IF v_new IS DISTINCT FROM (CASE
       WHEN right(btrim(v_old), length(v_desc_sent)) = v_desc_sent THEN v_old
       ELSE btrim(concat_ws(' ', nullif(btrim(v_old), ''), v_desc_sent))
     END) THEN
    RAISE EXCEPTION 'Stopped, nothing saved: changed_description on electric_ac_compressor';
  END IF;

  SELECT string_agg(s.what, ', ') INTO v_ids
  FROM pt_snap_misc s
  WHERE s.what = 'vehicle_component_schedule'
    AND (
      s.n <> (SELECT count(*) FROM public.vehicle_component_schedule)
      OR s.h <> (SELECT md5(coalesce(string_agg((to_jsonb(x) - 'retired_reason')::text, '' ORDER BY x.id), ''))
                 FROM public.vehicle_component_schedule x)
    );
  IF v_ids IS NOT NULL THEN RAISE EXCEPTION 'Stopped, nothing saved: changed_other on %', v_ids; END IF;

  SELECT string_agg(s.what, ', ') INTO v_ids
  FROM pt_snap_misc s
  WHERE s.what = 'maintenance_work_order_lines'
    AND (
      s.n <> (SELECT count(*) FROM public.maintenance_work_order_lines)
      OR s.h <> (SELECT md5(coalesce(string_agg((to_jsonb(x.*) - 'fit_at_log')::text, '' ORDER BY x.id), ''))
                 FROM public.maintenance_work_order_lines x)
    );
  IF v_ids IS NOT NULL THEN RAISE EXCEPTION 'Stopped, nothing saved: changed_other on %', v_ids; END IF;

  FOREACH v_misc IN ARRAY ARRAY[
    'catalog_component_applicability',
    'maintenance_task_templates',
    'maintenance_work_order_line_item'
  ]
  LOOP
    IF v_misc = 'catalog_component_applicability' THEN
      SELECT count(*) INTO v_bad FROM public.catalog_component_applicability;
      SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.id), ''))
      INTO v_fits FROM public.catalog_component_applicability x;
    ELSIF v_misc = 'maintenance_task_templates' THEN
      SELECT count(*) INTO v_bad FROM public.maintenance_task_templates;
      SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.id), ''))
      INTO v_fits FROM public.maintenance_task_templates x;
    ELSE
      SELECT count(*) INTO v_bad FROM public.maintenance_work_order_line_item;
      SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.id), ''))
      INTO v_fits FROM public.maintenance_work_order_line_item x;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pt_snap_misc s
      WHERE s.what = v_misc AND (s.n <> v_bad OR s.h IS DISTINCT FROM v_fits)
    ) THEN
      RAISE EXCEPTION 'Stopped, nothing saved: changed_other on %', v_misc;
    END IF;
  END LOOP;

  -- 10: idempotency (re-run would change 0 car rows)
  SELECT count(*) INTO v_bad
  FROM public.vehicle_catalog vc
  CROSS JOIN LATERAL public.vehicle_catalog_derive_powertrain(
    vc.fuel_type, vc.engine_type, vc.fuel_category
  ) r
  WHERE vc.powertrain_status IS DISTINCT FROM 'confirmed'
    AND (vc.powertrain, vc.fuel, vc.powertrain_status)
      IS DISTINCT FROM (r.powertrain, r.fuel, r.status);
  IF v_bad > 0 THEN
    SELECT string_agg(vc.id::text, ', ') INTO v_ids
    FROM public.vehicle_catalog vc
    CROSS JOIN LATERAL public.vehicle_catalog_derive_powertrain(
      vc.fuel_type, vc.engine_type, vc.fuel_category
    ) r
    WHERE vc.powertrain_status IS DISTINCT FROM 'confirmed'
      AND (vc.powertrain, vc.fuel, vc.powertrain_status)
        IS DISTINCT FROM (r.powertrain, r.fuel, r.status)
    LIMIT 20;
    RAISE EXCEPTION 'Stopped, nothing saved: idempotent_cars on %', v_ids;
  END IF;

  -- 11: platform_revision delta = car + job row counts from pt_d1_counts
  SELECT coalesce(max(n), 0) INTO v_car_ch FROM pt_d1_counts WHERE what = 'car rows changed';
  SELECT coalesce(max(n), 0) INTO v_job_ch FROM pt_d1_counts WHERE what = 'job rows changed';
  SELECT n INTO v_rev_before FROM pt_snap_pr_rev;
  SELECT count(*) INTO v_rev_now FROM public.platform_revision;
  v_rev_delta := v_rev_now - v_rev_before;
  IF v_rev_delta <> v_car_ch + v_job_ch THEN
    RAISE EXCEPTION
      'Stopped, nothing saved: platform_revision delta % (cars %, jobs %, expected %)',
      v_rev_delta, v_car_ch, v_job_ch, v_car_ch + v_job_ch;
  END IF;

  -- 12: no HV on groups
  SELECT count(*) INTO v_bad FROM public.maintenance_service_categories
  WHERE kind = 'system' AND is_high_voltage;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Stopped, nothing saved: high_voltage_on_group on % rows', v_bad; END IF;

  -- 13: no mhev model fits Hybrid & electric or electric_ac_compressor
  SELECT count(*) INTO v_mhev_yes
  FROM public.vehicle_catalog c
  CROSS JOIN public.maintenance_service_categories j
  WHERE c.powertrain = 'mhev'
    AND j.kind = 'component' AND j.status = 'active'
    AND (
      j.parent_id = (SELECT id FROM public.maintenance_service_categories WHERE code = 'sys_hybrid')
      OR j.code = 'electric_ac_compressor'
    )
    AND EXISTS (
      SELECT 1 FROM public.job_fits_car(c.id, ARRAY[j.id]) f WHERE f.fits = 'yes'
    );
  IF v_mhev_yes > 0 THEN
    RAISE EXCEPTION 'Stopped, nothing saved: mhev_fits_hybrid_job on % pairings', v_mhev_yes;
  END IF;

  SELECT count(*) INTO v_n FROM public.vehicle_catalog WHERE powertrain_status = 'needs_check';

  -- (D1-powertrain_job_fit-DRYRUN.sql replaces the next line with always-stop.)
  -- (real run: no stop here; COMMIT follows)
END $chk$;

COMMIT;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115214317', 'powertrain_job_fit')
ON CONFLICT (version) DO NOTHING;

-- After save: 3a split + fleet Roomy / Fit
SELECT powertrain, powertrain_status, count(*) AS n
FROM public.vehicle_catalog
WHERE vehicle_class = 'car'
GROUP BY 1, 2
ORDER BY 1 NULLS FIRST, 2;

SELECT
  c.make,
  c.model,
  c.powertrain,
  c.fuel,
  c.powertrain_status,
  v.id AS fleet_vehicle_id
FROM public.vehicle_catalog c
JOIN fleet.vehicles v ON nullif(v.vehicle_catalog_id, '')::uuid = c.id
WHERE c.make ILIKE 'Toyota' AND c.model ILIKE 'Roomy'
   OR c.make ILIKE 'Honda' AND c.model ILIKE 'Fit'
ORDER BY c.make, c.model;
