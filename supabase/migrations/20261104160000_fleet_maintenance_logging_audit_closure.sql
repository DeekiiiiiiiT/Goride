-- Fleet maintenance logging audit closure (O-01, O-02, O-03, O-04, O-09)

-- ---------------------------------------------------------------------------
-- O-01: Refresh public.fleet_vehicles so fleet_unit_id / home_base are visible
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

ALTER VIEW public.fleet_vehicles SET (security_invoker = true);

GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;

-- ---------------------------------------------------------------------------
-- O-02: Legacy fleet.maintenance_logs → completed work orders + lines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet._map_legacy_checklist_to_category(p_label text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_label text := lower(trim(p_label));
  v_id uuid;
BEGIN
  IF v_label LIKE '%engine oil%' OR v_label LIKE '%oil filter%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'oil' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%cabin%' AND v_label LIKE '%filter%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'cabin_filter' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%air filter%' OR v_label LIKE '%engine air%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'air_filter' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  SELECT c.id INTO v_id
  FROM public.maintenance_service_categories c
  WHERE lower(trim(c.name)) = v_label
  ORDER BY length(c.name) DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT c.id INTO v_id
  FROM public.maintenance_service_categories c
  WHERE v_label LIKE '%' || lower(trim(c.name)) || '%'
  ORDER BY length(c.name) DESC
  LIMIT 1;
  RETURN v_id;
END;
$$;

DO $$
DECLARE
  r record;
  v_wo_id uuid;
  v_item text;
  v_idx integer;
  v_cost jsonb;
  v_material numeric;
  v_labor numeric;
  v_line_total numeric;
  v_comp uuid;
  v_odo integer;
  v_date date;
  v_exists uuid;
BEGIN
  FOR r IN
    SELECT ml.*
    FROM fleet.maintenance_logs ml
    WHERE coalesce(ml.payload_json->>'workOrderId', '') = ''
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_work_orders wo
        WHERE wo.payload_json->>'legacyMaintenanceLogId' = ml.id::text
      )
  LOOP
    v_wo_id := gen_random_uuid();
    v_odo := coalesce(
      nullif((r.payload_json->>'odo')::integer, 0),
      nullif(r.odometer, 0),
      nullif((r.payload_json->>'performed_at_miles')::integer, 0)
    );
    v_date := coalesce(
      nullif(r.payload_json->>'date', '')::date,
      r.service_date,
      current_date
    );

    INSERT INTO public.maintenance_work_orders (
      id,
      organization_id,
      vehicle_id,
      status,
      opened_at,
      closed_at,
      performed_at_date,
      odometer,
      provider,
      currency,
      log_mode,
      package_complete,
      notes,
      total_cost,
      payload_json,
      updated_at
    ) VALUES (
      v_wo_id,
      r.organization_id,
      r.vehicle_id,
      'completed',
      coalesce(r.created_at, now()),
      coalesce(r.updated_at, now()),
      v_date,
      v_odo,
      coalesce(r.payload_json->>'provider', 'Unknown'),
      'JMD',
      coalesce(r.payload_json->>'logMode', 'quick_job'),
      false,
      coalesce(r.payload_json->>'notes', ''),
      coalesce(r.cost, (r.payload_json->>'cost')::numeric, 0),
      jsonb_build_object(
        'source', 'legacy_maintenance_log_backfill',
        'legacyMaintenanceLogId', r.id::text
      ),
      now()
    );

    v_idx := 0;
    FOR v_item IN
      SELECT jsonb_array_elements_text(coalesce(r.payload_json->'checklist', '[]'::jsonb))
    LOOP
      v_idx := v_idx + 1;
      v_comp := fleet._map_legacy_checklist_to_category(v_item);
      v_cost := coalesce(r.payload_json->'itemCosts'->v_item, '{}'::jsonb);
      v_material := coalesce((v_cost->>'material')::numeric, 0);
      v_labor := coalesce((v_cost->>'labor')::numeric, 0);
      v_line_total := v_material + v_labor;

      INSERT INTO public.maintenance_work_order_lines (
        id,
        work_order_id,
        sort_order,
        component_id,
        component_name,
        action,
        material,
        labor_amount,
        line_total,
        notes
      ) VALUES (
        gen_random_uuid(),
        v_wo_id,
        v_idx,
        v_comp,
        v_item,
        'replace',
        v_material,
        v_labor,
        v_line_total,
        CASE WHEN v_comp IS NULL THEN 'Unmapped legacy checklist item' ELSE NULL END
      );
    END LOOP;

    UPDATE fleet.maintenance_logs
    SET payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('workOrderId', v_wo_id::text),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT mr.*
    FROM public.maintenance_records mr
    WHERE coalesce(mr.payload_json->>'workOrderId', '') = ''
      AND lower(coalesce(mr.status, '')) NOT IN ('requested', 'draft')
  LOOP
    v_wo_id := gen_random_uuid();
    v_odo := coalesce(
      nullif(r.performed_at_miles, 0),
      nullif((r.payload_json->>'odo')::integer, 0)
    );
    v_date := coalesce(r.performed_at_date, nullif(r.payload_json->>'date', '')::date, current_date);

    INSERT INTO public.maintenance_work_orders (
      id,
      organization_id,
      vehicle_id,
      status,
      opened_at,
      closed_at,
      performed_at_date,
      odometer,
      provider,
      currency,
      log_mode,
      package_complete,
      notes,
      total_cost,
      maintenance_record_id,
      payload_json,
      updated_at
    ) VALUES (
      v_wo_id,
      r.organization_id,
      r.vehicle_id,
      'completed',
      coalesce(r.updated_at, now()),
      coalesce(r.updated_at, now()),
      v_date,
      v_odo,
      coalesce(r.provider, r.payload_json->>'provider', 'Unknown'),
      coalesce(r.currency, 'JMD'),
      coalesce(r.payload_json->>'logMode', 'quick_job'),
      coalesce((r.payload_json->>'packageComplete')::boolean, false),
      coalesce(r.notes, r.payload_json->>'notes', ''),
      coalesce(r.cost, 0),
      r.id,
      jsonb_build_object('source', 'legacy_maintenance_record_backfill', 'recordId', r.id::text),
      now()
    );

    v_idx := 0;
    IF jsonb_typeof(r.payload_json->'lines') = 'array'
      AND jsonb_array_length(r.payload_json->'lines') > 0
    THEN
      FOR v_cost IN SELECT jsonb_array_elements(r.payload_json->'lines') LOOP
        v_idx := v_idx + 1;
        v_comp := nullif(v_cost->>'categoryId', '')::uuid;
        IF v_comp IS NULL THEN
          v_comp := fleet._map_legacy_checklist_to_category(coalesce(v_cost->>'categoryName', ''));
        END IF;
        v_material := coalesce((v_cost->'values'->>'unit_price')::numeric, (v_cost->>'unitPrice')::numeric, 0)
          * coalesce((v_cost->>'qty')::numeric, 1);
        v_labor := coalesce((v_cost->'values'->>'labor')::numeric, (v_cost->>'labor')::numeric, 0);
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
          line_total,
          positions,
          brand,
          complimentary,
          values_json
        ) VALUES (
          gen_random_uuid(),
          v_wo_id,
          v_idx,
          nullif(v_cost->>'systemId', '')::uuid,
          v_comp,
          v_cost->>'systemCode',
          v_cost->>'systemName',
          v_cost->>'categoryCode',
          coalesce(v_cost->>'categoryName', v_cost->>'categoryCode'),
          coalesce(v_cost->>'action', 'replace'),
          coalesce((v_cost->>'qty')::numeric, 1),
          coalesce((v_cost->>'unitPrice')::numeric, 0),
          v_material,
          v_labor,
          v_material + v_labor,
          CASE
            WHEN jsonb_typeof(v_cost->'positions') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(v_cost->'positions'))
            ELSE NULL
          END,
          v_cost->>'brand',
          coalesce((v_cost->>'complimentary')::boolean, false),
          coalesce(v_cost->'values', '{}'::jsonb)
        );
      END LOOP;
    ELSE
      FOR v_item IN
        SELECT jsonb_array_elements_text(coalesce(r.payload_json->'checklist', '[]'::jsonb))
      LOOP
        v_idx := v_idx + 1;
        v_comp := fleet._map_legacy_checklist_to_category(v_item);
        v_cost := coalesce(r.payload_json->'itemCosts'->v_item, '{}'::jsonb);
        v_material := coalesce((v_cost->>'material')::numeric, 0);
        v_labor := coalesce((v_cost->>'labor')::numeric, 0);
        v_line_total := v_material + v_labor;

        INSERT INTO public.maintenance_work_order_lines (
          id,
          work_order_id,
          sort_order,
          component_id,
          component_name,
          action,
          material,
          labor_amount,
          line_total,
          notes
        ) VALUES (
          gen_random_uuid(),
          v_wo_id,
          v_idx,
          v_comp,
          v_item,
          'replace',
          v_material,
          v_labor,
          v_line_total,
          CASE WHEN v_comp IS NULL THEN 'Unmapped legacy checklist item' ELSE NULL END
        );
      END LOOP;
    END IF;

    UPDATE public.maintenance_records
    SET payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('workOrderId', v_wo_id::text),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- O-03: Package-only template intervals in recompute
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.recompute_maintenance_schedule(p_vehicle_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row record;
  v_last record;
  v_updated integer := 0;
  v_interval_miles numeric;
  v_interval_months integer;
  v_base_miles numeric;
  v_base_date date;
  v_in_package boolean;
BEGIN
  FOR v_row IN
    SELECT vcs.*
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.vehicle_id = p_vehicle_id
  LOOP
    SELECT wo.performed_at_date, wo.odometer
    INTO v_last
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE wo.vehicle_id = p_vehicle_id
      AND wo.status = 'completed'
      AND wo.voided_at IS NULL
      AND l.component_id = v_row.category_id
      AND (
        v_row.position IS NULL
        OR l.positions @> ARRAY[v_row.position]::text[]
        OR (v_row.position IS NOT NULL AND coalesce(array_length(l.positions, 1), 0) = 0)
      )
    ORDER BY wo.performed_at_date DESC NULLS LAST, wo.closed_at DESC NULLS LAST
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM public.maintenance_package_categories mpc
      WHERE mpc.template_id = v_row.source_template_id
        AND mpc.category_id = v_row.category_id
    ) INTO v_in_package;

    IF v_in_package AND v_row.source_template_id IS NOT NULL THEN
      SELECT t.interval_miles, t.interval_months
      INTO v_interval_miles, v_interval_months
      FROM public.maintenance_task_templates t
      WHERE t.id = v_row.source_template_id;
    ELSE
      SELECT c.default_interval_miles, c.default_interval_months
      INTO v_interval_miles, v_interval_months
      FROM public.maintenance_service_categories c
      WHERE c.id = v_row.category_id;
    END IF;

    IF v_last.performed_at_date IS NOT NULL THEN
      UPDATE public.vehicle_component_schedule vcs
      SET
        last_performed_date = v_last.performed_at_date,
        last_performed_miles = v_last.odometer,
        next_due_miles = CASE
          WHEN v_interval_miles IS NOT NULL AND v_last.odometer IS NOT NULL
            THEN v_last.odometer + v_interval_miles
          ELSE vcs.next_due_miles
        END,
        next_due_date = CASE
          WHEN v_interval_months IS NOT NULL AND v_last.performed_at_date IS NOT NULL
            THEN (v_last.performed_at_date + (v_interval_months || ' months')::interval)::date
          ELSE vcs.next_due_date
        END,
        schedule_status = 'active',
        updated_at = now()
      WHERE vcs.id = v_row.id;
      v_updated := v_updated + 1;
    ELSIF v_row.baseline_odometer IS NOT NULL OR v_row.baseline_date IS NOT NULL THEN
      v_base_miles := coalesce(v_row.baseline_odometer, 0);
      v_base_date := v_row.baseline_date;
      UPDATE public.vehicle_component_schedule vcs
      SET
        last_performed_miles = NULL,
        last_performed_date = NULL,
        next_due_miles = CASE
          WHEN v_interval_miles IS NOT NULL THEN v_base_miles + v_interval_miles
          ELSE vcs.next_due_miles
        END,
        next_due_date = CASE
          WHEN v_interval_months IS NOT NULL AND v_base_date IS NOT NULL
            THEN (v_base_date + (v_interval_months || ' months')::interval)::date
          ELSE vcs.next_due_date
        END,
        schedule_status = 'active',
        updated_at = now()
      WHERE vcs.id = v_row.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$$;

-- ---------------------------------------------------------------------------
-- O-04: Ensure line immutability trigger (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_voided timestamptz;
BEGIN
  SELECT status, voided_at INTO v_status, v_voided
  FROM public.maintenance_work_orders
  WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  IF v_status = 'completed' AND v_voided IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'completed work order lines cannot be edited';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'completed work order lines cannot be deleted';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mwo_line_immutable ON public.maintenance_work_order_lines;
CREATE TRIGGER trg_mwo_line_immutable
  BEFORE UPDATE OR DELETE ON public.maintenance_work_order_lines
  FOR EACH ROW EXECUTE FUNCTION fleet.guard_completed_maintenance_wo_line();

-- ---------------------------------------------------------------------------
-- O-09: projected_due_date NULL when overdue
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.fleet_maintenance_due_v CASCADE;
DROP VIEW IF EXISTS fleet.maintenance_due_v CASCADE;

CREATE VIEW fleet.maintenance_due_v AS
WITH settings AS (
  SELECT organization_id, due_soon_km, due_soon_days
  FROM fleet.organization_settings
),
cur AS (
  SELECT * FROM fleet.vehicle_current_odometer_v
),
avg_km AS (
  SELECT
    vehicle_id,
    CASE
      WHEN count(*) >= 2 AND max(recorded_at) > min(recorded_at) THEN
        (max(reading) - min(reading)) / greatest(
          1,
          extract(epoch FROM (max(recorded_at) - min(recorded_at))) / 86400.0
        )
      ELSE NULL
    END AS avg_km_per_day
  FROM fleet.odometer_readings
  WHERE is_voided = false
    AND is_anomaly = false
    AND recorded_at >= now() - interval '30 days'
  GROUP BY vehicle_id
),
scored AS (
  SELECT
    vcs.organization_id,
    vcs.vehicle_id,
    vcs.category_id,
    vcs.position,
    c.name AS category_name,
    c.code AS category_code,
    c.overdue_effect,
    vcs.last_performed_miles,
    vcs.last_performed_date,
    vcs.baseline_odometer,
    vcs.baseline_date,
    vcs.baseline_source,
    vcs.next_due_miles,
    vcs.next_due_miles_max,
    vcs.next_due_date,
    cur.reading AS current_odometer,
    ak.avg_km_per_day,
    CASE
      WHEN cur.reading IS NULL AND vcs.next_due_miles IS NOT NULL THEN 'odometer_needed'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
        AND cur.reading >= vcs.next_due_miles THEN 'overdue'
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date THEN 'overdue'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
        AND cur.reading >= vcs.next_due_miles - coalesce(s.due_soon_km, 1000)
        AND cur.reading < vcs.next_due_miles THEN 'due_soon'
      WHEN vcs.next_due_date IS NOT NULL
        AND vcs.next_due_date <= current_date + coalesce(s.due_soon_days, 14) THEN 'due_soon'
      ELSE 'ok'
    END AS due_status,
    CASE
      WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
        THEN greatest(0, cur.reading - vcs.next_due_miles)
      ELSE NULL
    END AS km_overdue,
    CASE
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date
        THEN current_date - vcs.next_due_date
      ELSE NULL
    END AS days_overdue
  FROM public.vehicle_component_schedule vcs
  JOIN public.maintenance_service_categories c ON c.id = vcs.category_id
  LEFT JOIN cur ON cur.vehicle_id = vcs.vehicle_id
  LEFT JOIN settings s ON s.organization_id = vcs.organization_id
  LEFT JOIN avg_km ak ON ak.vehicle_id = vcs.vehicle_id
)
SELECT
  scored.*,
  CASE
    WHEN scored.due_status = 'overdue' THEN NULL
    WHEN scored.current_odometer IS NOT NULL
      AND scored.next_due_miles IS NOT NULL
      AND scored.avg_km_per_day IS NOT NULL
      AND scored.avg_km_per_day > 0
      AND scored.current_odometer < scored.next_due_miles
    THEN least(
      coalesce(scored.next_due_date, current_date + 3650),
      current_date + ceil((scored.next_due_miles - scored.current_odometer) / scored.avg_km_per_day)::int
    )
    ELSE scored.next_due_date
  END AS projected_due_date
FROM scored;

CREATE OR REPLACE VIEW public.fleet_maintenance_due_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_due_v;

GRANT SELECT ON public.fleet_maintenance_due_v TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT vehicle_id FROM public.vehicle_component_schedule LOOP
    PERFORM fleet.recompute_maintenance_schedule(r.vehicle_id);
  END LOOP;
END $$;
