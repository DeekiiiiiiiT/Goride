-- S-04: migrate legacy daily alerts before fleet-wide component schedule recompute (go-live order).

DO $$
DECLARE
  v_row record;
BEGIN
  PERFORM public.maintenance_alerts_migrate_daily_rows();
  FOR v_row IN
    SELECT organization_id, id AS vehicle_id
    FROM fleet.vehicles
    WHERE vehicle_catalog_id IS NOT NULL
      AND btrim(vehicle_catalog_id) <> ''
  LOOP
    PERFORM public.recompute_component_schedules_for_car(
      v_row.organization_id,
      v_row.vehicle_id
    );
  END LOOP;
END $$;
