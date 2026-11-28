-- Build step 16b, revised (owner + DSH second opinion, 28 Nov 2026): hard use is decided by distance
-- against an average-use baseline, plus one short-trip line. Replaces the four-sign check of
-- 20261128005456 (paid work / short trips / slow traffic / fuel), which was too complicated and built
-- around ride-hail.
--
-- The rule:
--   1. Each night, for each car: how far it drove over the last 90 days, from its odometer readings
--      (last reading minus first, divided by the days between; at least 30 days between them).
--   2. Hard use is on when that is at least 2x the baseline (10,000 km a year = 27 km a day),
--      or when 30% or more of its completed trips are under 8 km (at least 20 trips).
--   3. It goes back to normal after 60 clear days in a row. A car that can't be measured keeps its last
--      answer; a car never decided starts on normal use.
--   4. The fleet can keep either answer for 90 days with a reason (server, step 16c).
--   The baseline classifies; the car maker's manual supplies the shorter number.
--
-- Kept from 20261128005456: the needs_checking fix and resolver (sections 0, 0b), the car columns, the
-- policy table and its change log, the audit row and recompute on change. The cron job
-- mm-hard-use-nightly stays as it is on live (paused by the owner); this file does not touch it.

-- ---------------------------------------------------------------------------
-- 1. The limits
-- ---------------------------------------------------------------------------
ALTER TABLE public.mm_hard_use_policy
  DROP COLUMN IF EXISTS paid_service_lines,
  DROP COLUMN IF EXISTS slow_kmh,
  DROP COLUMN IF EXISTS fuel_worse_share,
  DROP COLUMN IF EXISTS signs_needed,
  DROP COLUMN IF EXISTS min_fuel_litres,
  ADD COLUMN IF NOT EXISTS baseline_km_per_year numeric NOT NULL DEFAULT 10000
    CHECK (baseline_km_per_year > 0),
  ADD COLUMN IF NOT EXISTS high_use_multiple numeric NOT NULL DEFAULT 2.0
    CHECK (high_use_multiple >= 1),
  ADD COLUMN IF NOT EXISTS min_span_days int NOT NULL DEFAULT 30
    CHECK (min_span_days BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS kept_hard_days int NOT NULL DEFAULT 90
    CHECK (kept_hard_days BETWEEN 1 AND 365);

ALTER TABLE public.mm_hard_use_policy
  ALTER COLUMN window_days SET DEFAULT 90,
  ALTER COLUMN clear_days SET DEFAULT 60,
  ALTER COLUMN min_trips SET DEFAULT 20;

-- The row was never changed by anyone, so the trigger's log line here is the only one.
UPDATE public.mm_hard_use_policy
SET window_days = 90,
    clear_days = 60,
    min_trips = 20
WHERE id;

COMMENT ON TABLE public.mm_hard_use_policy IS
  'Step 16b (revised): hard use when a car drives at least high_use_multiple x baseline_km_per_year over window_days, or short_trip_share of its trips are under short_trip_km. One row; server only; every change kept in mm_hard_use_policy_log.';

-- ---------------------------------------------------------------------------
-- 2. The car: the fleet can now keep either answer
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS severe_duty_kept_hard_until timestamptz;

ALTER TABLE fleet.vehicles DROP CONSTRAINT IF EXISTS vehicles_severe_duty_source_check;
ALTER TABLE fleet.vehicles
  ADD CONSTRAINT vehicles_severe_duty_source_check
  CHECK (severe_duty_source IN ('auto', 'fleet_kept_normal', 'fleet_kept_hard'));

-- A car with no decision yet is on normal use ("Waiting for 30 days of readings").
ALTER TABLE fleet.vehicles ALTER COLUMN severe_duty SET DEFAULT false;

COMMENT ON COLUMN fleet.vehicles.severe_duty_source IS
  'Step 16b: auto = decided each night from distance and short trips; fleet_kept_normal / fleet_kept_hard = the fleet kept that answer with a reason, until the matching _kept_*_until.';

-- Explicit-column view (F-14 lesson): the new column goes on the end.
CREATE OR REPLACE VIEW public.fleet_vehicles
WITH (security_invoker = true)
AS
SELECT
  id,
  organization_id,
  license_plate,
  vin,
  make,
  model,
  year,
  color,
  status,
  current_driver_id,
  toll_tag_id,
  vehicle_catalog_id,
  legacy_kv_id,
  payload_json,
  created_at,
  updated_at,
  custody_status,
  handed_over_at,
  handed_over_by,
  custody_confirmed_at,
  custody_confirmed_by,
  service_lines,
  fleet_unit_id,
  home_base,
  do_not_drive,
  do_not_drive_reason,
  do_not_drive_set_at,
  severe_duty,
  plate_aliases,
  color_standard,
  picture_id,
  severe_duty_source,
  severe_duty_why,
  severe_duty_signs,
  severe_duty_checked_at,
  severe_duty_kept_normal_until,
  severe_duty_clear_since,
  severe_duty_kept_hard_until
FROM fleet.vehicles;

-- ---------------------------------------------------------------------------
-- 3. The nightly decision
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mm_hard_use_line_label(text);

CREATE OR REPLACE FUNCTION public.mm_decide_hard_use(p_org text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p public.mm_hard_use_policy%ROWTYPE;
  r record;
  v_today date := (now() AT TIME ZONE 'America/Jamaica')::date;
  v_from date;
  v_recompute boolean;
  v_base_per_day numeric;
  v_span int;
  v_km_per_day numeric;
  v_multiple numeric;
  v_short_share numeric;
  v_high boolean;
  v_short boolean;
  v_measured boolean;
  v_on boolean;
  v_new boolean;
  v_source text;
  v_kept_normal timestamptz;
  v_kept_hard timestamptz;
  v_clear_since date;
  v_parts text[];
  v_why text;
  v_signs jsonb;
  v_checked int := 0;
  v_changed int := 0;
  v_cars jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO p FROM public.mm_hard_use_policy WHERE id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mm_hard_use_policy has no row';
  END IF;
  v_from := v_today - p.window_days;
  v_base_per_day := p.baseline_km_per_year / 365.0;

  SELECT coalesce(bool_or(f.enabled), false) INTO v_recompute
  FROM public.platform_feature_flags f WHERE f.name = 'maintenance_master_governance';

  FOR r IN
    SELECT
      v.id,
      v.organization_id,
      v.license_plate,
      v.severe_duty,
      v.severe_duty_source,
      v.severe_duty_kept_normal_until,
      v.severe_duty_kept_hard_until,
      v.severe_duty_clear_since,
      v.severe_duty_checked_at,
      od.readings,
      od.first_date,
      od.last_date,
      od.km,
      t.trips_with_km,
      t.short_trips
    FROM fleet.vehicles v
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS readings,
        min(o.reading_date) AS first_date,
        max(o.reading_date) AS last_date,
        max(o.reading) - min(o.reading) AS km
      FROM fleet.odometer_readings o
      WHERE o.organization_id = v.organization_id
        AND o.vehicle_id = v.id
        AND o.reading_date >= v_from
        AND o.reading_date <= v_today
        AND o.reading > 0
        AND NOT coalesce(o.is_voided, false)
        AND NOT coalesce(o.is_anomaly, false)
    ) od ON true
    LEFT JOIN LATERAL (
      SELECT
        count(tf.distance_km) AS trips_with_km,
        count(*) FILTER (WHERE tf.distance_km < p.short_trip_km) AS short_trips
      FROM fleet.trip_facts tf
      WHERE tf.organization_id = v.organization_id
        AND tf.vehicle_id = v.id
        AND tf.local_date >= v_from
        AND tf.local_date <= v_today
        AND tf.status_bucket = 'completed'
    ) t ON true
    WHERE (p_org IS NULL OR v.organization_id = p_org)
      AND coalesce(lower(v.status), 'active') NOT IN ('retired', 'sold', 'archived', 'inactive', 'deleted')
  LOOP
    v_checked := v_checked + 1;

    -- How far it drove, from the odometer.
    v_span := CASE WHEN r.first_date IS NOT NULL THEN r.last_date - r.first_date END;
    v_km_per_day := CASE WHEN coalesce(r.readings, 0) >= 2 AND v_span >= p.min_span_days AND r.km >= 0
      THEN r.km / v_span END;
    v_multiple := CASE WHEN v_km_per_day IS NOT NULL THEN v_km_per_day / v_base_per_day END;
    v_high := coalesce(v_multiple >= p.high_use_multiple, false);

    -- Short trips, only for cars whose trips are recorded.
    v_short_share := CASE WHEN coalesce(r.trips_with_km, 0) >= p.min_trips
      THEN r.short_trips::numeric / r.trips_with_km END;
    v_short := coalesce(v_short_share >= p.short_trip_share, false);

    v_measured := v_km_per_day IS NOT NULL OR v_short_share IS NOT NULL;
    v_on := v_high OR v_short;

    v_parts := ARRAY[]::text[];
    IF v_km_per_day IS NOT NULL THEN
      v_parts := v_parts || (
        to_char(round(r.km), 'FM999,999,990') || ' km in ' || v_span || ' days, '
        || to_char(round(v_multiple, 1), 'FM990.0') || '× the normal '
        || to_char(p.baseline_km_per_year, 'FM999,999,990') || ' km a year'
      );
    END IF;
    IF v_short THEN
      v_parts := v_parts || (round(v_short_share * 100)::text || '% of trips under '
        || trim_scale(p.short_trip_km)::text || ' km');
    END IF;

    v_signs := jsonb_build_object(
      'window_days', p.window_days,
      'from', v_from,
      'to', v_today,
      'readings', coalesce(r.readings, 0),
      'first_reading_date', r.first_date,
      'last_reading_date', r.last_date,
      'span_days', v_span,
      'km', r.km,
      'km_per_day', round(v_km_per_day, 1),
      'baseline_km_per_year', p.baseline_km_per_year,
      'baseline_km_per_day', round(v_base_per_day, 1),
      'multiple', round(v_multiple, 2),
      'high_use_multiple', p.high_use_multiple,
      'trips_with_km', coalesce(r.trips_with_km, 0),
      'short_trip_share', round(v_short_share, 3),
      'high_use', v_high,
      'short_trips', v_short,
      'measured', v_measured
    );

    v_source := 'auto';
    v_kept_normal := NULL;
    v_kept_hard := NULL;
    v_clear_since := r.severe_duty_clear_since;

    IF r.severe_duty_source = 'fleet_kept_normal' AND r.severe_duty_kept_normal_until > now() THEN
      v_source := 'fleet_kept_normal';
      v_kept_normal := r.severe_duty_kept_normal_until;
      v_new := false;
      v_clear_since := NULL;
      v_why := 'Kept on normal schedules by the fleet until '
        || to_char(r.severe_duty_kept_normal_until AT TIME ZONE 'America/Jamaica', 'FMDD Mon YYYY') || '.';
    ELSIF r.severe_duty_source = 'fleet_kept_hard' AND r.severe_duty_kept_hard_until > now() THEN
      v_source := 'fleet_kept_hard';
      v_kept_hard := r.severe_duty_kept_hard_until;
      v_new := true;
      v_clear_since := NULL;
      v_why := 'Kept on shorter schedules by the fleet until '
        || to_char(r.severe_duty_kept_hard_until AT TIME ZONE 'America/Jamaica', 'FMDD Mon YYYY') || '.';
    ELSIF NOT v_measured THEN
      IF r.severe_duty_checked_at IS NULL THEN
        v_new := false;
        v_why := 'Waiting for ' || p.min_span_days || ' days of odometer readings.';
      ELSE
        v_new := r.severe_duty;
        v_why := 'Not enough distance data to decide. It keeps the last answer.';
      END IF;
    ELSIF v_on THEN
      v_new := true;
      v_clear_since := NULL;
      v_why := array_to_string(v_parts, ' · ');
    ELSIF r.severe_duty THEN
      v_clear_since := coalesce(r.severe_duty_clear_since, v_today);
      IF v_today - v_clear_since >= p.clear_days THEN
        v_new := false;
        v_clear_since := NULL;
        v_why := array_to_string(v_parts, ' · ');
      ELSE
        v_new := true;
        v_why := array_to_string(v_parts || ('back to normal after ' || p.clear_days
          || ' days below the line (since ' || to_char(v_clear_since, 'FMDD Mon') || ')'), ' · ');
      END IF;
    ELSE
      v_new := false;
      v_clear_since := NULL;
      v_why := array_to_string(v_parts, ' · ');
    END IF;

    IF v_why = '' THEN
      v_why := 'Normal use.';
    END IF;

    UPDATE fleet.vehicles
    SET severe_duty = v_new,
        severe_duty_source = v_source,
        severe_duty_kept_normal_until = v_kept_normal,
        severe_duty_kept_hard_until = v_kept_hard,
        severe_duty_clear_since = v_clear_since,
        severe_duty_why = v_why,
        severe_duty_signs = v_signs,
        severe_duty_checked_at = now()
    WHERE id = r.id AND organization_id = r.organization_id;

    IF v_new IS DISTINCT FROM r.severe_duty THEN
      v_changed := v_changed + 1;
      INSERT INTO fleet.maintenance_audit_log (organization_id, entity_type, entity_id, actor_id, reason, before_json, after_json)
      VALUES (
        r.organization_id,
        'fleet.vehicles.severe_duty',
        r.id,
        NULL,
        'Automatic: ' || v_why,
        jsonb_build_object('severe_duty', r.severe_duty, 'source', r.severe_duty_source),
        jsonb_build_object('severe_duty', v_new, 'source', v_source, 'signs', v_signs)
      );
      IF v_recompute THEN
        PERFORM public.recompute_component_schedules_for_car(r.organization_id, r.id);
      END IF;
    END IF;

    v_cars := v_cars || jsonb_build_object(
      'plate', r.license_plate, 'hard_use', v_new, 'was', r.severe_duty, 'source', v_source, 'why', v_why
    );
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'changed', v_changed, 'cars', v_cars);
END;
$$;

COMMENT ON FUNCTION public.mm_decide_hard_use(text) IS
  'Step 16b (revised): hard use per car from odometer distance against the baseline, plus the short-trip line. Adds up in the database (one company or all), writes the decision and the numbers onto fleet.vehicles, logs every change, recomputes changed cars.';

REVOKE ALL ON FUNCTION public.mm_decide_hard_use(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_decide_hard_use(text) TO service_role;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261128014142', 'mm_hard_use_distance_baseline') ON CONFLICT (version) DO NOTHING;
