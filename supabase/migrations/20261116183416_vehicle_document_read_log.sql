-- Certificate scan rate limits (cross edge-instance): log reads and count in SQL.

CREATE TABLE fleet.vehicle_document_read_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicle_document_read_log_user_idx ON fleet.vehicle_document_read_log (user_id, read_at);
CREATE INDEX vehicle_document_read_log_org_idx ON fleet.vehicle_document_read_log (organization_id, read_at);

ALTER TABLE fleet.vehicle_document_read_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fleet.vehicle_document_read_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fleet.vehicle_document_read_counts(p_user uuid, p_org text)
RETURNS TABLE (user_hour_count int, org_day_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'fleet', 'public'
AS $$
  SELECT
    (SELECT count(*)::int
     FROM fleet.vehicle_document_read_log l
     WHERE l.user_id = p_user
       AND l.read_at > now() - interval '1 hour') AS user_hour_count,
    (SELECT count(*)::int
     FROM fleet.vehicle_document_read_log l
     WHERE l.organization_id = p_org
       AND (l.read_at AT TIME ZONE 'America/Jamaica')::date =
           (now() AT TIME ZONE 'America/Jamaica')::date) AS org_day_count;
$$;

REVOKE ALL ON FUNCTION fleet.vehicle_document_read_counts(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.vehicle_document_read_counts(uuid, text) TO service_role;
GRANT INSERT, SELECT ON fleet.vehicle_document_read_log TO service_role;

-- Retention: piggyback on vehicle-picture-fill daily cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'vehicle-picture-fill';
    PERFORM cron.schedule(
      'vehicle-picture-fill',
      '15 5 * * *',
      $cron$SELECT private.invoke_vehicle_picture_fill();
DELETE FROM fleet.vehicle_document_read_log WHERE read_at < now() - interval '7 days';$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped vehicle-picture-fill reschedule';
  END IF;
END $$;