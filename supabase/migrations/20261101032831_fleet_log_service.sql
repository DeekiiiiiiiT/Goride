-- Prod-applied: fleet_log_service (audit O-07 sync)

CREATE OR REPLACE FUNCTION fleet.log_service_finalize(
  p_organization_id text,
  p_vehicle_id text,
  p_work_order_id uuid,
  p_record_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_updated integer;
BEGIN
  v_updated := fleet.recompute_maintenance_schedule(p_vehicle_id);

  INSERT INTO fleet.maintenance_events (organization_id, vehicle_id, type, payload)
  VALUES (
    p_organization_id,
    p_vehicle_id,
    'service.logged',
    jsonb_build_object(
      'workOrderId', p_work_order_id,
      'recordId', p_record_id,
      'scheduleRowsUpdated', v_updated
    )
  );

  RETURN jsonb_build_object(
    'scheduleRowsUpdated', v_updated,
    'eventType', 'service.logged'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fleet.log_service_finalize(text, text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION fleet.log_service(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_org text := payload->>'organizationId';
  v_vehicle text := payload->>'vehicleId';
  v_wo uuid := (payload->>'workOrderId')::uuid;
  v_record uuid := NULLIF(payload->>'recordId', '')::uuid;
BEGIN
  IF v_org IS NULL OR v_vehicle IS NULL OR v_wo IS NULL THEN
    RAISE EXCEPTION 'organizationId, vehicleId, and workOrderId are required';
  END IF;
  RETURN fleet.log_service_finalize(v_org, v_vehicle, v_wo, v_record);
END;
$$;

GRANT EXECUTE ON FUNCTION fleet.log_service(jsonb) TO service_role;
