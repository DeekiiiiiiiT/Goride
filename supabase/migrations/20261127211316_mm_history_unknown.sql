-- Maintenance rebuild step 7 (MER-11, MER-12): "History unknown" and "Fill in history".
--
-- A part nobody has dated (no logged service, no filled-in history) was counted from the car's first odometer
-- reading and reported as Overdue: 22 of 25 parts on 5179KZ, one by 68,980 km. Now such a part reads
-- **history_unknown** in the due view: counted on its own, never Overdue, never OK, with "Check at next service".
-- It ends the moment last-done km or date is filled in (from a logged service, or the new fill-in).
--
-- 1. vehicle_component_schedule: who filled the history and when, and the "Check at next service" tick.
-- 2. fleet.maintenance_due_v: the history_unknown status (same columns, so public.fleet_maintenance_due_v is
--    unchanged).
-- 3. public.mm_fill_part_history(...): the Fill in history save. Writes last done km/date as a 'manual'
--    history, or the tick; recomputes each part; logs every change in fleet.maintenance_audit_log.
-- 4. Open overdue/due-soon alerts on parts that are now history_unknown are superseded (the
--    maintenance_alerts_supersede_open helper is an empty stub, so they would stay open for ever).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------------------------------------
ALTER TABLE public.vehicle_component_schedule
  ADD COLUMN IF NOT EXISTS history_check_at_next_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS history_filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_filled_by uuid;

COMMENT ON COLUMN public.vehicle_component_schedule.history_check_at_next_service IS
  'The owner could not date this part ("Check at next service"). The part stays history_unknown until a service or a filled-in date gives it a last-done point.';

-- ---------------------------------------------------------------------------------------------------------
-- 2. The due view, with history_unknown
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW fleet.maintenance_due_v AS
WITH settings AS (
  SELECT organization_settings.organization_id,
    organization_settings.due_soon_km,
    organization_settings.due_soon_days
  FROM fleet.organization_settings
), cur AS (
  SELECT vehicle_current_odometer_v.vehicle_id,
    vehicle_current_odometer_v.organization_id,
    vehicle_current_odometer_v.reading,
    vehicle_current_odometer_v.recorded_at,
    vehicle_current_odometer_v.source,
    vehicle_current_odometer_v.reading_date
  FROM fleet.vehicle_current_odometer_v
), avg_km AS (
  SELECT odometer_readings.vehicle_id,
    CASE
      WHEN ((count(*) >= 2) AND (max(odometer_readings.recorded_at) > min(odometer_readings.recorded_at)))
        THEN ((max(odometer_readings.reading) - min(odometer_readings.reading))
          / GREATEST((1)::numeric, (EXTRACT(epoch FROM (max(odometer_readings.recorded_at) - min(odometer_readings.recorded_at))) / 86400.0)))
      ELSE NULL::numeric
    END AS avg_km_per_day
  FROM fleet.odometer_readings
  WHERE ((odometer_readings.is_voided = false) AND (odometer_readings.is_anomaly = false)
    AND (odometer_readings.recorded_at >= (now() - '30 days'::interval)))
  GROUP BY odometer_readings.vehicle_id
), base AS (
  SELECT vcs.*,
    ((vcs.schedule_status = 'retired'::text)
      AND (NOT (vcs.retired_reason IS DISTINCT FROM 'As needed: done only when a job calls for it'::text))) AS as_needed,
    -- Nobody knows when this part was last done: no logged service and no filled-in history, on a part that
    -- has a schedule.
    ((vcs.last_performed_km IS NULL) AND (vcs.last_performed_date IS NULL)
      AND (vcs.rule_id IS NOT NULL OR vcs.schedule_status = 'manual_override'::text)
      AND (vcs.schedule_status <> ALL (ARRAY['retired'::text, 'no_rule'::text]))) AS history_unknown
  FROM public.vehicle_component_schedule vcs
), scored AS (
  SELECT vcs.organization_id,
    vcs.vehicle_id,
    vcs.category_id,
    vcs."position",
    c.name AS category_name,
    c.code AS category_code,
    c.overdue_effect,
    vcs.last_performed_km,
    vcs.last_performed_date,
    vcs.baseline_odometer,
    vcs.baseline_date,
    vcs.baseline_source,
    CASE WHEN vcs.as_needed THEN NULL::numeric ELSE vcs.next_due_km END AS next_due_km,
    CASE WHEN vcs.as_needed THEN NULL::numeric ELSE vcs.next_due_km_max END AS next_due_km_max,
    CASE WHEN vcs.as_needed THEN NULL::date ELSE vcs.next_due_date END AS next_due_date,
    cur.reading AS current_odometer,
    ak.avg_km_per_day,
    CASE
      WHEN vcs.as_needed THEN 'retired'::text
      WHEN vcs.history_unknown THEN 'history_unknown'::text
      WHEN ((vcs.last_performed_date IS NULL) AND (vcs.last_performed_km IS NULL) AND (vcs.baseline_odometer IS NULL) AND (vcs.baseline_date IS NULL)) THEN 'no_record'::text
      WHEN ((cur.reading IS NULL) AND (vcs.next_due_km IS NOT NULL)) THEN 'odometer_needed'::text
      WHEN ((cur.reading IS NOT NULL) AND (vcs.next_due_km IS NOT NULL) AND (cur.reading >= vcs.next_due_km)) THEN 'overdue'::text
      WHEN ((vcs.next_due_date IS NOT NULL) AND (vcs.next_due_date < CURRENT_DATE)) THEN 'overdue'::text
      WHEN ((cur.reading IS NOT NULL) AND (vcs.next_due_km IS NOT NULL) AND (cur.reading >= (vcs.next_due_km - (COALESCE(s.due_soon_km, 1000))::numeric)) AND (cur.reading < vcs.next_due_km)) THEN 'due_soon'::text
      WHEN ((vcs.next_due_date IS NOT NULL) AND (vcs.next_due_date <= (CURRENT_DATE + COALESCE(s.due_soon_days, 14)))) THEN 'due_soon'::text
      ELSE 'ok'::text
    END AS due_status,
    CASE
      WHEN vcs.history_unknown THEN NULL::numeric
      WHEN ((vcs.last_performed_date IS NULL) AND (vcs.last_performed_km IS NULL) AND (vcs.baseline_odometer IS NULL) AND (vcs.baseline_date IS NULL)) THEN NULL::numeric
      WHEN vcs.as_needed THEN NULL::numeric
      WHEN ((cur.reading IS NOT NULL) AND (vcs.next_due_km IS NOT NULL)) THEN GREATEST((0)::numeric, (cur.reading - vcs.next_due_km))
      ELSE NULL::numeric
    END AS km_overdue,
    CASE
      WHEN vcs.history_unknown THEN NULL::integer
      WHEN ((vcs.last_performed_date IS NULL) AND (vcs.last_performed_km IS NULL) AND (vcs.baseline_odometer IS NULL) AND (vcs.baseline_date IS NULL)) THEN NULL::integer
      WHEN vcs.as_needed THEN NULL::integer
      WHEN ((vcs.next_due_date IS NOT NULL) AND (vcs.next_due_date < CURRENT_DATE)) THEN (CURRENT_DATE - vcs.next_due_date)
      ELSE NULL::integer
    END AS days_overdue
  FROM base vcs
    JOIN public.maintenance_service_categories c ON (c.id = vcs.category_id)
    LEFT JOIN cur ON (cur.vehicle_id = vcs.vehicle_id)
    LEFT JOIN settings s ON (s.organization_id = vcs.organization_id)
    LEFT JOIN avg_km ak ON (ak.vehicle_id = vcs.vehicle_id)
)
SELECT organization_id,
  vehicle_id,
  category_id,
  "position",
  category_name,
  category_code,
  overdue_effect,
  last_performed_km,
  last_performed_date,
  baseline_odometer,
  baseline_date,
  baseline_source,
  next_due_km,
  next_due_km_max,
  next_due_date,
  current_odometer,
  avg_km_per_day,
  due_status,
  km_overdue,
  days_overdue,
  CASE
    WHEN (due_status = 'overdue'::text) THEN NULL::date
    WHEN (due_status = 'no_record'::text) THEN NULL::date
    WHEN (due_status = 'history_unknown'::text) THEN NULL::date
    WHEN ((current_odometer IS NOT NULL) AND (next_due_km IS NOT NULL) AND (avg_km_per_day IS NOT NULL) AND (avg_km_per_day > (0)::numeric) AND (current_odometer < next_due_km))
      THEN LEAST(COALESCE(next_due_date, (CURRENT_DATE + 3650)), (CURRENT_DATE + (ceil(((next_due_km - current_odometer) / avg_km_per_day)))::integer))
    ELSE next_due_date
  END AS projected_due_date
FROM scored;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Fill in history
-- ---------------------------------------------------------------------------------------------------------
-- p_rows: [{ "schedule_id": uuid, "last_km": number|null, "last_date": "YYYY-MM-DD"|null,
--            "check_next_service": boolean }]
-- A row with a km or a date becomes a dated 'manual' history and is recomputed from it. A row with only the
-- tick keeps history_unknown and records that the owner could not date it. A row with neither is skipped.
-- A part already dated by a logged service is never overwritten here.
CREATE OR REPLACE FUNCTION public.mm_fill_part_history(
  p_org text,
  p_vehicle_id text,
  p_rows jsonb,
  p_actor uuid DEFAULT NULL
)
RETURNS TABLE (schedule_id uuid, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  v_row public.vehicle_component_schedule%ROWTYPE;
  v_id uuid;
  v_km numeric;
  v_date date;
  v_tick boolean;
  v_current numeric;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'send the parts as a list';
  END IF;

  SELECT o.reading INTO v_current
  FROM fleet.vehicle_current_odometer_v o
  WHERE o.vehicle_id = p_vehicle_id
  LIMIT 1;

  FOR item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := NULLIF(item ->> 'schedule_id', '')::uuid;
    v_km := NULLIF(btrim(COALESCE(item ->> 'last_km', '')), '')::numeric;
    v_date := NULLIF(btrim(COALESCE(item ->> 'last_date', '')), '')::date;
    v_tick := COALESCE((item ->> 'check_next_service')::boolean, false);

    SELECT * INTO v_row
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.id = v_id AND vcs.organization_id = p_org AND vcs.vehicle_id = p_vehicle_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'part % is not on this car', v_id;
    END IF;

    -- A service that was really logged wins: its date is not replaced from memory.
    IF v_row.last_performed_source IN ('work_order', 'service_log') THEN
      schedule_id := v_id;
      result := 'kept_logged_service';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_km IS NULL AND v_date IS NULL THEN
      IF v_tick IS DISTINCT FROM v_row.history_check_at_next_service THEN
        UPDATE public.vehicle_component_schedule vcs
        SET history_check_at_next_service = v_tick,
            history_filled_at = now(),
            history_filled_by = p_actor,
            updated_at = now()
        WHERE vcs.id = v_id;
        INSERT INTO fleet.maintenance_audit_log (organization_id, entity_type, entity_id, actor_id, reason, before_json, after_json)
        VALUES (p_org, 'component_schedule_history', v_id::text, p_actor,
          CASE WHEN v_tick THEN 'Check at next service' ELSE 'Check at next service removed' END,
          jsonb_build_object('check_at_next_service', v_row.history_check_at_next_service),
          jsonb_build_object('check_at_next_service', v_tick));
        schedule_id := v_id;
        result := CASE WHEN v_tick THEN 'check_next_service' ELSE 'tick_removed' END;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    IF v_km IS NOT NULL AND v_km < 0 THEN
      RAISE EXCEPTION 'a km reading cannot be below 0';
    END IF;
    IF v_km IS NOT NULL AND v_current IS NOT NULL AND v_km > v_current THEN
      RAISE EXCEPTION 'last done at % km is more than the car''s odometer (% km)', v_km, v_current
        USING HINT = 'Type the km the part was done at, not a future reading.';
    END IF;
    IF v_date IS NOT NULL AND v_date > current_date THEN
      RAISE EXCEPTION 'last done on % is in the future', v_date;
    END IF;

    UPDATE public.vehicle_component_schedule vcs
    SET last_performed_km = v_km,
        last_performed_date = v_date,
        last_performed_source = 'manual',
        history_check_at_next_service = false,
        history_filled_at = now(),
        history_filled_by = p_actor,
        updated_at = now()
    WHERE vcs.id = v_id;

    PERFORM public.mm_recompute_schedule_row(p_org, p_vehicle_id, v_row.category_id, v_row.position, v_id);

    INSERT INTO fleet.maintenance_audit_log (organization_id, entity_type, entity_id, actor_id, reason, before_json, after_json)
    VALUES (p_org, 'component_schedule_history', v_id::text, p_actor, 'Service history filled in',
      jsonb_build_object('last_km', v_row.last_performed_km, 'last_date', v_row.last_performed_date,
        'source', v_row.last_performed_source),
      jsonb_build_object('last_km', v_km, 'last_date', v_date, 'source', 'manual'));

    schedule_id := v_id;
    result := 'filled';
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.mm_fill_part_history(text, text, jsonb, uuid) IS
  'Maintenance step 7: Fill in history. Dates parts nobody had dated (manual source) and recomputes them, or records "Check at next service". Never overwrites a logged service.';

REVOKE ALL ON FUNCTION public.mm_fill_part_history(text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_fill_part_history(text, text, jsonb, uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Alerts on parts that are now history_unknown
-- ---------------------------------------------------------------------------------------------------------
UPDATE fleet.maintenance_alerts a
SET status = 'superseded',
    resolved_at = now(),
    resolution_reason = 'rule_changed'
FROM fleet.maintenance_due_v d
WHERE a.status = 'open'
  AND d.organization_id = a.organization_id
  AND d.vehicle_id = a.vehicle_id
  AND d.category_id = a.category_id
  AND d.position IS NOT DISTINCT FROM a.position
  AND d.due_status = 'history_unknown';
