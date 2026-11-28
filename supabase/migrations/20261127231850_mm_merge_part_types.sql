-- Maintenance rebuild step 14 (MER-20, MER-14): merge duplicate part types; rows with no rule stop counting as OK.
--
-- MER-20. "Cabin Air Filter" (no schedule) is a twin of "Cabin A/C Filter" (has the schedule). 5179KZ's cabin
-- filter was logged under the twin on 20 May 2026 at 156,649 km, so the scheduled part never saw it and read
-- 68,980 km overdue (from 30 Oct 2025 at 121,952 km). public.mm_merge_part_type(from, into, reason) moves
-- everything maintenance keeps on the twin onto the part that stays, keeps the LATER last-done point on each car,
-- recomputes those cars, and retires the twin. It refuses (and changes nothing) if the twin is used anywhere it
-- does not know how to move (the parts catalogue, for example), so a person looks first.
--
-- MER-14. A schedule row with no rule ('no_rule') has no interval, so it was shown and counted as "OK". The due
-- view now gives it its own status, 'no_rule': never Overdue, never OK. Rows with no rule and no service history
-- are dropped (none on the live data when this was written: all 4 have history).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Merge a duplicate part type into the one that stays
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_merge_part_type(p_from uuid, p_into uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from public.maintenance_service_categories%ROWTYPE;
  v_into public.maintenance_service_categories%ROWTYPE;
  r record;
  n bigint;
  v_blockers text := '';
  v_out jsonb := '{}'::jsonb;
  v_keep_id uuid;
  v_keep public.vehicle_component_schedule%ROWTYPE;
  v_prev_repair text;
  v_handled constant text[] := ARRAY[
    'maintenance_work_order_lines.component_id', 'maintenance_service_ledger.category_id',
    'maintenance_job_item.job_id', 'vehicle_component_schedule.category_id',
    'maintenance_inspection_items.component_id', 'maintenance_inspection_findings.component_id',
    'maintenance_package_categories.category_id', 'maintenance_job_section_members.category_id',
    'maintenance_job_relations.from_category_id', 'maintenance_job_relations.to_category_id',
    'maintenance_task_templates.component_id'
  ];
BEGIN
  IF p_from IS NULL OR p_into IS NULL OR p_from = p_into THEN
    RAISE EXCEPTION 'give two different part types';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'say why these are the same part';
  END IF;
  SELECT * INTO v_from FROM public.maintenance_service_categories WHERE id = p_from;
  SELECT * INTO v_into FROM public.maintenance_service_categories WHERE id = p_into;
  IF v_from.id IS NULL OR v_into.id IS NULL THEN
    RAISE EXCEPTION 'part type not found';
  END IF;
  IF v_from.kind <> 'component' OR v_into.kind <> 'component' THEN
    RAISE EXCEPTION 'only parts (not systems) can be merged';
  END IF;
  IF EXISTS (SELECT 1 FROM public.maintenance_task_templates t WHERE t.component_id = p_from AND t.status <> 'retired') THEN
    RAISE EXCEPTION '% has its own schedule rules; retire or move them first', v_from.name;
  END IF;

  -- Anything else pointing at the twin stops the merge: a person decides those.
  FOR r IN
    SELECT c.conrelid::regclass::text AS full_t, replace(c.conrelid::regclass::text, 'public.', '') AS t, a.attname::text AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.maintenance_service_categories'::regclass
  LOOP
    IF (r.t || '.' || r.col) = ANY (v_handled) THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.full_t, r.col) INTO n USING p_from;
    IF n > 0 THEN
      v_blockers := v_blockers || r.t || '.' || r.col || ' (' || n || ') ';
    END IF;
  END LOOP;
  IF v_blockers <> '' THEN
    RAISE EXCEPTION '% is also used in: %- merge those by hand first', v_from.name, v_blockers;
  END IF;

  -- Logged jobs and the service ledger: the history now belongs to the part that stays.
  -- A completed job's lines are locked; this is the one sanctioned repair, so the lock is lifted for this
  -- transaction only (the same switch earlier repair migrations use).
  v_prev_repair := current_setting('fleet.legacy_repair', true);
  PERFORM set_config('fleet.legacy_repair', 'on', true);
  UPDATE public.maintenance_work_order_lines SET component_id = p_into WHERE component_id = p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_out := v_out || jsonb_build_object('work_order_lines', n);
  UPDATE public.maintenance_service_ledger
  SET category_id = p_into, category_code = v_into.code, category_name = v_into.name
  WHERE category_id = p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  v_out := v_out || jsonb_build_object('service_ledger', n);

  -- Items used on the job: moved unless the part that stays already lists the same item.
  UPDATE public.maintenance_job_item ji SET job_id = p_into, updated_at = now()
  WHERE ji.job_id = p_from
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_job_item k
      WHERE k.job_id = p_into AND k.removed_at IS NULL
        AND k.part_type_id IS NOT DISTINCT FROM ji.part_type_id
        AND k.supply_id IS NOT DISTINCT FROM ji.supply_id
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  v_out := v_out || jsonb_build_object('job_items_moved', n);
  UPDATE public.maintenance_job_item SET removed_at = now(), updated_at = now()
  WHERE job_id = p_from AND removed_at IS NULL;

  UPDATE public.maintenance_inspection_items SET component_id = p_into WHERE component_id = p_from;
  UPDATE public.maintenance_inspection_findings SET component_id = p_into WHERE component_id = p_from;
  UPDATE public.maintenance_package_categories pc SET category_id = p_into
  WHERE pc.category_id = p_from
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_package_categories k WHERE k.category_id = p_into AND k.template_id = pc.template_id
    );
  DELETE FROM public.maintenance_package_categories WHERE category_id = p_from;
  UPDATE public.maintenance_job_section_members m SET category_id = p_into
  WHERE m.category_id = p_from
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_job_section_members k WHERE k.category_id = p_into AND k.section_id = m.section_id
    );
  DELETE FROM public.maintenance_job_section_members WHERE category_id = p_from;
  DELETE FROM public.maintenance_job_relations WHERE from_category_id = p_from OR to_category_id = p_from;

  -- Each car: one schedule row for the part, counted from the LATER of the two last-done points.
  FOR r IN SELECT * FROM public.vehicle_component_schedule WHERE category_id = p_from LOOP
    v_keep_id := NULL;
    SELECT s.id INTO v_keep_id FROM public.vehicle_component_schedule s
    WHERE s.organization_id = r.organization_id AND s.vehicle_id = r.vehicle_id
      AND s.category_id = p_into AND s.position IS NOT DISTINCT FROM r.position
    LIMIT 1;
    IF v_keep_id IS NULL THEN
      UPDATE public.vehicle_component_schedule SET category_id = p_into, updated_at = now() WHERE id = r.id;
      PERFORM public.mm_recompute_schedule_row(r.organization_id, r.vehicle_id, p_into, r.position, r.id);
    ELSE
      SELECT * INTO v_keep FROM public.vehicle_component_schedule WHERE id = v_keep_id;
      IF COALESCE(r.last_performed_date, '0001-01-01'::date) > COALESCE(v_keep.last_performed_date, '0001-01-01'::date)
         OR (r.last_performed_date IS NULL AND v_keep.last_performed_date IS NULL
             AND COALESCE(r.last_performed_km, 0) > COALESCE(v_keep.last_performed_km, 0)) THEN
        UPDATE public.vehicle_component_schedule
        SET last_performed_km = r.last_performed_km,
            last_performed_date = r.last_performed_date,
            last_performed_source = r.last_performed_source,
            updated_at = now()
        WHERE id = v_keep_id;
      END IF;
      DELETE FROM public.vehicle_component_schedule WHERE id = r.id;
      PERFORM public.mm_recompute_schedule_row(v_keep.organization_id, v_keep.vehicle_id, p_into, v_keep.position, v_keep_id);
    END IF;
  END LOOP;

  PERFORM set_config('fleet.legacy_repair', COALESCE(v_prev_repair, ''), true);

  UPDATE public.maintenance_service_categories
  SET status = 'retired', retired_at = now(), updated_at = now()
  WHERE id = p_from;

  RETURN v_out || jsonb_build_object('merged', v_from.name, 'into', v_into.name, 'reason', p_reason);
END;
$$;

COMMENT ON FUNCTION public.mm_merge_part_type(uuid, uuid, text) IS
  'Maintenance step 14 (MER-20): move a duplicate part type''s maintenance history onto the part that stays, keep the later last-done point per car, recompute, retire the duplicate. Refuses when the duplicate is used anywhere else.';

REVOKE ALL ON FUNCTION public.mm_merge_part_type(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_merge_part_type(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 2. The duplicate found on the live data
-- ---------------------------------------------------------------------------------------------------------
DO $merge$
BEGIN
  IF EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = '67d34386-c044-43a8-bfa0-cfe472a9f520' AND status = 'active')
     AND EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = 'a1000000-0000-4000-8000-000000000008') THEN
    PERFORM public.mm_merge_part_type(
      '67d34386-c044-43a8-bfa0-cfe472a9f520'::uuid,  -- Cabin Air Filter (no schedule)
      'a1000000-0000-4000-8000-000000000008'::uuid,  -- Cabin A/C Filter (has the schedule)
      'Same part: the cabin (pollen) filter. MER-20.'
    );
  END IF;
END
$merge$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Rows with no rule: dropped when they have no history; never counted as OK (view below)
-- ---------------------------------------------------------------------------------------------------------
DELETE FROM public.vehicle_component_schedule
WHERE schedule_status = 'no_rule'
  AND last_performed_km IS NULL AND last_performed_date IS NULL;

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
      WHEN vcs.schedule_status = 'no_rule'::text THEN 'no_rule'::text
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
      WHEN vcs.schedule_status = 'no_rule'::text THEN NULL::numeric
      WHEN ((vcs.last_performed_date IS NULL) AND (vcs.last_performed_km IS NULL) AND (vcs.baseline_odometer IS NULL) AND (vcs.baseline_date IS NULL)) THEN NULL::numeric
      WHEN vcs.as_needed THEN NULL::numeric
      WHEN ((cur.reading IS NOT NULL) AND (vcs.next_due_km IS NOT NULL)) THEN GREATEST((0)::numeric, (cur.reading - vcs.next_due_km))
      ELSE NULL::numeric
    END AS km_overdue,
    CASE
      WHEN vcs.history_unknown THEN NULL::integer
      WHEN vcs.schedule_status = 'no_rule'::text THEN NULL::integer
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
    WHEN (due_status = 'no_rule'::text) THEN NULL::date
    WHEN ((current_odometer IS NOT NULL) AND (next_due_km IS NOT NULL) AND (avg_km_per_day IS NOT NULL) AND (avg_km_per_day > (0)::numeric) AND (current_odometer < next_due_km))
      THEN LEAST(COALESCE(next_due_date, (CURRENT_DATE + 3650)), (CURRENT_DATE + (ceil(((next_due_km - current_odometer) / avg_km_per_day)))::integer))
    ELSE next_due_date
  END AS projected_due_date
FROM scored;
