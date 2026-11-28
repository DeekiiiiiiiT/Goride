-- Build step 16b: hard use is decided by each car's numbers, every night.
--
-- Owner direction 28 Nov 2026: a fleet should never have to turn hard use on. Roam has each car's trips,
-- fuel and odometer, so the database decides from the last 30 days. Dominion holds the limits.
--
--   1. public.mm_hard_use_policy      one row of limits (server only), every change kept in a log table
--   2. fleet.vehicles                 who decided, why, the numbers, when; public.fleet_vehicles view too
--   3. public.mm_decide_hard_use()    adds up inside the database, writes the decision, recomputes changed cars
--   4. pg_cron 'mm-hard-use-nightly'  06:45 UTC = 1:45 AM Jamaica, before the 2:00 AM maintenance re-check
--
-- The rule: hard use turns on when the car did paid work, or 2 of these 3 count: short trips, slow traffic,
-- hard on fuel. It turns off only after 28 clear days in a row. No numbers at all: the last decision stays.
-- A fleet can keep a car on normal use with a reason (step 16c); that lasts 90 days, then the numbers decide.

-- ---------------------------------------------------------------------------
-- 0. Fix found while testing (step 6b, DOC-05): the "likely, 2016-2020" Roomy copies were saved as
--    draft, and the rule picker skips drafts. So any recompute moved 5179KZ (2019) off the car maker's
--    rules onto Roam's defaults (engine oil 15,000 km -> Roam 5,000 km). needs_checking is the picker's
--    fallback tier: the cars use the numbers, and Dominion still shows them as waiting for a
--    2016-2020 document.
-- ---------------------------------------------------------------------------
UPDATE public.maintenance_task_templates
SET status = 'needs_checking',
    updated_at = now()
WHERE template_scope = 'platform'
  AND archived_at IS NULL
  AND status = 'draft'
  AND year_from = 2016
  AND year_to = 2020
  AND draft_note LIKE 'Read from the June 2021 sheet.%';

-- ---------------------------------------------------------------------------
-- 0b. The resolver: a car maker's rule still waiting for a document (needs_checking) beats Roam's
--     default when it is more specific to the car (Toyota Roomy beats every car). Before this, any
--     active rule won, so Roam's 5,000 km oil beat Toyota's 15,000 / 7,500 km on 5179KZ.
--     Only the rule-picking block changes; the rest is the 20261127114220 version.
-- ---------------------------------------------------------------------------
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
      -- Step 16b: lower rank = more specific to this car. An active rule wins a tie.
      v_rank := public.mm_part_rule_rank(
        v_rule.template_scope, v_ctx.catalog_id, v_ctx.platform_id, v_ctx.platform_family_id,
        v_ctx.engine_family_id, v_rule.vehicle_catalog_id, v_rule.platform_id, v_rule.engine_family_id
      );
      v_check_rank := public.mm_part_rule_rank(
        v_check.template_scope, v_ctx.catalog_id, v_ctx.platform_id, v_ctx.platform_family_id,
        v_ctx.engine_family_id, v_check.vehicle_catalog_id, v_check.platform_id, v_check.engine_family_id
      );
      IF v_check_rank < v_rank THEN
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

-- ---------------------------------------------------------------------------
-- 1. The limits (Dominion setting, one row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mm_hard_use_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  window_days int NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 7 AND 120),
  paid_service_lines text[] NOT NULL DEFAULT ARRAY['rideshare', 'taxi', 'courier', 'delivery']::text[],
  short_trip_km numeric NOT NULL DEFAULT 8 CHECK (short_trip_km > 0),
  short_trip_share numeric NOT NULL DEFAULT 0.30 CHECK (short_trip_share > 0 AND short_trip_share <= 1),
  slow_kmh numeric NOT NULL DEFAULT 25 CHECK (slow_kmh > 0),
  fuel_worse_share numeric NOT NULL DEFAULT 0.15 CHECK (fuel_worse_share > 0 AND fuel_worse_share < 1),
  signs_needed int NOT NULL DEFAULT 2 CHECK (signs_needed BETWEEN 1 AND 3),
  min_trips int NOT NULL DEFAULT 10 CHECK (min_trips >= 1),
  min_fuel_litres numeric NOT NULL DEFAULT 40 CHECK (min_fuel_litres > 0),
  clear_days int NOT NULL DEFAULT 28 CHECK (clear_days BETWEEN 1 AND 365),
  kept_normal_days int NOT NULL DEFAULT 90 CHECK (kept_normal_days BETWEEN 1 AND 365),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.mm_hard_use_policy IS
  'Step 16b: the limits that decide hard use per car each night. One row. Changed only by the platform owner through the server; every change is kept in mm_hard_use_policy_log.';

INSERT INTO public.mm_hard_use_policy (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mm_hard_use_policy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  before_json jsonb,
  after_json jsonb
);

CREATE OR REPLACE FUNCTION public.mm_hard_use_policy_log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  INSERT INTO public.mm_hard_use_policy_log (changed_by, before_json, after_json)
  VALUES (NEW.updated_by, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_hard_use_policy_log_change ON public.mm_hard_use_policy;
CREATE TRIGGER mm_hard_use_policy_log_change
  BEFORE UPDATE ON public.mm_hard_use_policy
  FOR EACH ROW EXECUTE FUNCTION public.mm_hard_use_policy_log_change();

-- Server only, like maintenance_manual: no browser reads or writes.
ALTER TABLE public.mm_hard_use_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_hard_use_policy_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mm_hard_use_policy FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mm_hard_use_policy_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.mm_hard_use_policy TO service_role;
GRANT SELECT ON public.mm_hard_use_policy_log TO service_role;
REVOKE ALL ON FUNCTION public.mm_hard_use_policy_log_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The decision on each car
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS severe_duty_source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS severe_duty_why text,
  ADD COLUMN IF NOT EXISTS severe_duty_signs jsonb,
  ADD COLUMN IF NOT EXISTS severe_duty_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS severe_duty_kept_normal_until timestamptz,
  ADD COLUMN IF NOT EXISTS severe_duty_clear_since date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_severe_duty_source_check'
      AND conrelid = 'fleet.vehicles'::regclass
  ) THEN
    ALTER TABLE fleet.vehicles
      ADD CONSTRAINT vehicles_severe_duty_source_check
      CHECK (severe_duty_source IN ('auto', 'fleet_kept_normal'));
  END IF;
END $$;

-- A new car starts on hard use until its numbers say otherwise (step 8).
ALTER TABLE fleet.vehicles ALTER COLUMN severe_duty SET DEFAULT true;

COMMENT ON COLUMN fleet.vehicles.severe_duty_source IS
  'Step 16b: auto = decided each night from the car''s numbers; fleet_kept_normal = the fleet kept it on normal use with a reason, until severe_duty_kept_normal_until.';
COMMENT ON COLUMN fleet.vehicles.severe_duty_why IS 'Step 16b: the plain sentence Fleet shows next to the decision.';
COMMENT ON COLUMN fleet.vehicles.severe_duty_signs IS 'Step 16b: the numbers behind the last decision (30-day window).';
COMMENT ON COLUMN fleet.vehicles.severe_duty_clear_since IS 'Step 16b: first day of the current run of clear days while still on hard use; turns off after clear_days.';

-- Explicit-column view (F-14 lesson): new columns go on the end, nothing else changes.
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
  severe_duty_clear_since
FROM fleet.vehicles;

-- ---------------------------------------------------------------------------
-- 3. The nightly decision
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_hard_use_line_label(p_line text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(coalesce(p_line, ''))
    WHEN 'rideshare' THEN 'Ride-hail work'
    WHEN 'taxi' THEN 'Taxi work'
    WHEN 'courier' THEN 'Delivery work'
    WHEN 'delivery' THEN 'Delivery work'
    ELSE initcap(replace(coalesce(p_line, 'paid'), '_', ' ')) || ' work'
  END;
$$;

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
  v_paid boolean;
  v_paid_via text;
  v_paid_line text;
  v_short_share numeric;
  v_kmh numeric;
  v_kmpl numeric;
  v_short boolean;
  v_slow boolean;
  v_fuel boolean;
  v_other int;
  v_on boolean;
  v_has_numbers boolean;
  v_new boolean;
  v_source text;
  v_kept_until timestamptz;
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

  SELECT coalesce(bool_or(f.enabled), false) INTO v_recompute
  FROM public.platform_feature_flags f WHERE f.name = 'maintenance_master_governance';

  FOR r IN
    SELECT
      v.id,
      v.organization_id,
      v.license_plate,
      v.severe_duty,
      v.service_lines,
      v.severe_duty_source,
      v.severe_duty_kept_normal_until,
      v.severe_duty_clear_since,
      c.fuel_economy_km_per_l AS rated_kmpl,
      t.trips,
      t.paid_trips,
      t.paid_line,
      t.trips_with_km,
      t.short_trips,
      t.km_timed,
      t.min_timed,
      fu.litres,
      od.readings,
      od.km
    FROM fleet.vehicles v
    LEFT JOIN public.vehicle_catalog c ON c.id::text = v.vehicle_catalog_id
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS trips,
        count(*) FILTER (WHERE tf.service_line = ANY (p.paid_service_lines)) AS paid_trips,
        mode() WITHIN GROUP (ORDER BY tf.service_line)
          FILTER (WHERE tf.service_line = ANY (p.paid_service_lines)) AS paid_line,
        count(tf.distance_km) AS trips_with_km,
        count(*) FILTER (WHERE tf.distance_km < p.short_trip_km) AS short_trips,
        sum(tf.distance_km) FILTER (WHERE tf.distance_km IS NOT NULL AND tf.duration_min > 0) AS km_timed,
        sum(tf.duration_min) FILTER (WHERE tf.distance_km IS NOT NULL AND tf.duration_min > 0) AS min_timed
      FROM fleet.trip_facts tf
      WHERE tf.organization_id = v.organization_id
        AND tf.vehicle_id = v.id
        AND tf.local_date >= v_from
        AND tf.local_date <= v_today
        AND tf.status_bucket = 'completed'
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT sum(fe.liters) AS litres
      FROM fleet.fuel_entries fe
      WHERE fe.organization_id = v.organization_id
        AND fe.vehicle_id = v.id
        AND fe.date >= v_from
        AND fe.date <= v_today
        AND fe.liters > 0
    ) fu ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS readings, max(o.reading) - min(o.reading) AS km
      FROM fleet.odometer_readings o
      WHERE o.organization_id = v.organization_id
        AND o.vehicle_id = v.id
        AND o.reading_date >= v_from
        AND o.reading_date <= v_today
        AND o.reading > 0
        AND NOT coalesce(o.is_voided, false)
        AND NOT coalesce(o.is_anomaly, false)
    ) od ON true
    WHERE (p_org IS NULL OR v.organization_id = p_org)
      AND coalesce(lower(v.status), 'active') NOT IN ('retired', 'sold', 'archived', 'inactive', 'deleted')
  LOOP
    v_checked := v_checked + 1;

    -- Paid work: the car's own trips; with no trips at all, the car's service line.
    v_paid_via := NULL;
    v_paid_line := NULL;
    IF coalesce(r.paid_trips, 0) > 0 THEN
      v_paid_via := 'trips';
      v_paid_line := r.paid_line;
    ELSIF coalesce(r.trips, 0) = 0 AND coalesce(r.service_lines, ARRAY[]::text[]) && p.paid_service_lines THEN
      v_paid_via := 'service_line';
      SELECT l INTO v_paid_line FROM unnest(r.service_lines) l WHERE l = ANY (p.paid_service_lines) LIMIT 1;
    END IF;
    v_paid := v_paid_via IS NOT NULL;

    v_short_share := CASE WHEN coalesce(r.trips_with_km, 0) >= p.min_trips
      THEN r.short_trips::numeric / r.trips_with_km END;
    v_kmh := CASE WHEN coalesce(r.trips_with_km, 0) >= p.min_trips AND coalesce(r.min_timed, 0) > 0
      THEN r.km_timed / r.min_timed * 60 END;
    v_kmpl := CASE WHEN coalesce(r.litres, 0) >= p.min_fuel_litres AND coalesce(r.km, 0) > 0
      THEN r.km / r.litres END;

    v_short := coalesce(v_short_share >= p.short_trip_share, false);
    v_slow := coalesce(v_kmh < p.slow_kmh, false);
    v_fuel := coalesce(r.rated_kmpl > 0 AND v_kmpl <= r.rated_kmpl * (1 - p.fuel_worse_share), false);
    v_other := v_short::int + v_slow::int + v_fuel::int;
    v_on := v_paid OR v_other >= p.signs_needed;
    v_has_numbers := coalesce(r.trips, 0) > 0 OR coalesce(r.litres, 0) > 0
      OR coalesce(r.readings, 0) > 0 OR v_paid;

    v_parts := ARRAY[]::text[];
    IF v_paid_via = 'trips' THEN
      v_parts := v_parts || public.mm_hard_use_line_label(v_paid_line);
    ELSIF v_paid_via = 'service_line' THEN
      v_parts := v_parts || (public.mm_hard_use_line_label(v_paid_line) || ' (the car''s service line; no trips in '
        || p.window_days || ' days)');
    END IF;
    IF v_slow THEN v_parts := v_parts || (round(v_kmh, 1)::text || ' km/h average'); END IF;
    IF v_short THEN v_parts := v_parts || (round(v_short_share * 100)::text || '% short trips'); END IF;
    IF v_fuel THEN
      v_parts := v_parts || (round(v_kmpl, 1)::text || ' km/L (rated ' || trim_scale(r.rated_kmpl)::text || ')');
    END IF;

    v_signs := jsonb_build_object(
      'window_days', p.window_days,
      'from', v_from,
      'to', v_today,
      'trips', coalesce(r.trips, 0),
      'paid_trips', coalesce(r.paid_trips, 0),
      'paid_via', v_paid_via,
      'paid_line', v_paid_line,
      'short_trip_share', round(v_short_share, 3),
      'avg_kmh', round(v_kmh, 1),
      'km', r.km,
      'litres', round(r.litres, 1),
      'km_per_l', round(v_kmpl, 1),
      'rated_km_per_l', r.rated_kmpl,
      'paid', v_paid,
      'short', v_short,
      'slow', v_slow,
      'fuel', v_fuel,
      'other_signs', v_other,
      'signs_needed', p.signs_needed
    );

    v_source := 'auto';
    v_kept_until := NULL;
    v_clear_since := r.severe_duty_clear_since;

    IF r.severe_duty_source = 'fleet_kept_normal' AND r.severe_duty_kept_normal_until > now() THEN
      -- The fleet's reasoned choice holds until it runs out; the numbers are still recorded.
      v_source := 'fleet_kept_normal';
      v_kept_until := r.severe_duty_kept_normal_until;
      v_new := false;
      v_clear_since := NULL;
      v_why := 'Kept on normal use by the fleet until '
        || to_char(r.severe_duty_kept_normal_until AT TIME ZONE 'America/Jamaica', 'FMDD Mon YYYY') || '.';
    ELSIF NOT v_has_numbers THEN
      v_new := r.severe_duty;
      v_why := 'No trips, fuel or odometer readings in the last ' || p.window_days
        || ' days. It keeps its last decision.';
    ELSIF v_on THEN
      v_new := true;
      v_clear_since := NULL;
      v_why := array_to_string(v_parts, ' · ');
    ELSIF r.severe_duty THEN
      v_clear_since := coalesce(r.severe_duty_clear_since, v_today);
      IF v_today - v_clear_since >= p.clear_days THEN
        v_new := false;
        v_clear_since := NULL;
        v_why := 'No hard-use signs for ' || p.clear_days || ' days in a row.';
      ELSE
        v_new := true;
        v_why := 'No hard-use signs since ' || to_char(v_clear_since, 'FMDD Mon')
          || '. It goes back to normal use after ' || p.clear_days || ' clear days.';
      END IF;
    ELSE
      v_new := false;
      v_clear_since := NULL;
      v_why := 'No hard-use signs in the last ' || p.window_days || ' days.';
    END IF;

    UPDATE fleet.vehicles
    SET severe_duty = v_new,
        severe_duty_source = v_source,
        severe_duty_kept_normal_until = v_kept_until,
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
  'Step 16b: decides hard use per car from its last window_days of trips, fuel and odometer (adds up in the database, one company or all). Writes the decision and the numbers onto fleet.vehicles, logs every change, recomputes changed cars.';

REVOKE ALL ON FUNCTION public.mm_decide_hard_use(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_decide_hard_use(text) TO service_role;
REVOKE ALL ON FUNCTION public.mm_hard_use_line_label(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_hard_use_line_label(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Nightly at 1:45 AM Jamaica (06:45 UTC), before fleet-maintenance-nightly at 07:00 UTC
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mm-hard-use-nightly';
    PERFORM cron.schedule(
      'mm-hard-use-nightly',
      '45 6 * * *',
      $cron$SELECT public.mm_decide_hard_use(NULL);$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped mm-hard-use-nightly cron job';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261128005456', 'mm_hard_use_decided_by_numbers') ON CONFLICT (version) DO NOTHING;
