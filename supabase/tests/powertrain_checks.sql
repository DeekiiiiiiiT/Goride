-- Powertrain D1 invariant checks. Every count must be 0.

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_catalog
  WHERE powertrain_status IN ('derived', 'confirmed')
    AND (powertrain IS NULL OR fuel IS NULL);
  IF v_cnt > 0 THEN RAISE EXCEPTION 'derived_confirmed_missing_value: % rows', v_cnt; END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_catalog
  WHERE powertrain IS NOT NULL
    AND powertrain <> ALL (ARRAY['ice','mhev','hev','phev','erev','bev','fcev']);
  IF v_cnt > 0 THEN RAISE EXCEPTION 'bad_powertrain_code: % rows', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.vehicle_catalog
  WHERE fuel IS NOT NULL
    AND fuel <> ALL (ARRAY['petrol','diesel','cng','hydrogen','electric']);
  IF v_cnt > 0 THEN RAISE EXCEPTION 'bad_fuel_code: % rows', v_cnt; END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories m
  WHERE fits_powertrains IS NOT NULL AND cardinality(fits_powertrains) = 0;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'empty_fits_powertrains: % rows', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories m
  WHERE fits_fuels IS NOT NULL AND cardinality(fits_fuels) = 0;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'empty_fits_fuels: % rows', v_cnt; END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories
  WHERE kind = 'system' AND is_high_voltage;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'high_voltage_on_group: % rows', v_cnt; END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories
  WHERE kind = 'component' AND is_high_voltage
    AND code <> ALL (ARRAY[
      'hv_battery_health_check','hv_battery_module','hv_battery_pack',
      'hv_insulation_inspection','hv_cable','ev_charging_port','ev_onboard_charger',
      'ev_dc_dc_converter','ev_traction_motor','electric_ac_compressor'
    ]);
  IF v_cnt > 0 THEN RAISE EXCEPTION 'unexpected_high_voltage_jobs: % rows', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories
  WHERE kind = 'component'
    AND code = ANY (ARRAY[
      'hv_battery_health_check','hv_battery_module','hv_battery_pack',
      'hv_insulation_inspection','hv_cable','ev_charging_port','ev_onboard_charger',
      'ev_dc_dc_converter','ev_traction_motor','electric_ac_compressor'
    ])
    AND NOT is_high_voltage;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'missing_high_voltage_jobs: % rows', v_cnt; END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_catalog c
  CROSS JOIN public.maintenance_service_categories j
  WHERE c.powertrain = 'mhev'
    AND (
      j.parent_id = (SELECT id FROM public.maintenance_service_categories WHERE code = 'sys_hybrid')
      OR j.code = 'electric_ac_compressor'
    )
    AND j.kind = 'component' AND j.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.job_fits_car(c.id, ARRAY[j.id]) f
      WHERE f.fits = 'yes'
    );
  IF v_cnt > 0 THEN RAISE EXCEPTION 'mhev_fits_hybrid_job: % rows', v_cnt; END IF;
END $$;
