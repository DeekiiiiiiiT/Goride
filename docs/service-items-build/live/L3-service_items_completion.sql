-- Go-live step: paste ALL of this into the Supabase SQL editor (live project) and press Run.
-- Source: supabase/migrations/20261113184641_service_items_completion.sql

-- S3: dedupe service.logged events on completion retry (audit 4.3 step 8).

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
AS $function$
DECLARE
  v_updated integer;
  v_wo text := p_work_order_id::text;
  v_rec text := coalesce(p_record_id::text, '');
BEGIN
  v_updated := fleet.recompute_maintenance_schedule(p_vehicle_id);

  IF NOT EXISTS (
    SELECT 1
    FROM fleet.maintenance_events e
    WHERE e.type = 'service.logged'
      AND e.payload ->> 'workOrderId' = v_wo
      AND coalesce(e.payload ->> 'recordId', '') = v_rec
  ) THEN
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
  END IF;

  RETURN jsonb_build_object(
    'scheduleRowsUpdated', v_updated,
    'eventType', 'service.logged'
  );
END;
$function$;

REVOKE ALL ON FUNCTION fleet.log_service_finalize(text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.log_service_finalize(text, text, uuid, uuid) TO service_role;

-- Logbook line (keeps CI's migration list in step with live):
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113184641', 'service_items_completion') ON CONFLICT (version) DO NOTHING;
