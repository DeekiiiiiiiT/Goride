CREATE OR REPLACE FUNCTION fleet.next_maintenance_log_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('fleet.maintenance_log_number_seq');
  RETURN 'LOG-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS fleet.maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_maint_events_org_occurred
  ON fleet.maintenance_events (organization_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS fleet.maintenance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  alert_key text NOT NULL,
  vehicle_id text NOT NULL,
  category_id uuid,
  position text,
  alert_date date NOT NULL,
  severity text NOT NULL DEFAULT 'overdue',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_maint_alert_key UNIQUE (alert_key)
);

CREATE INDEX IF NOT EXISTS idx_maint_alerts_org_created
  ON fleet.maintenance_alerts (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fleet.maintenance_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  job_name text NOT NULL DEFAULT 'nightly_check',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  vehicles_checked integer NOT NULL DEFAULT 0,
  alerts_written integer NOT NULL DEFAULT 0,
  drift_rows integer NOT NULL DEFAULT 0,
  error text,
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_maint_job_runs_started
  ON fleet.maintenance_job_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS fleet.maintenance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor_id uuid,
  reason text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fleet.maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.maintenance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.maintenance_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.maintenance_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_events_service') THEN
    CREATE POLICY maint_events_service ON fleet.maintenance_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_alerts_service') THEN
    CREATE POLICY maint_alerts_service ON fleet.maintenance_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_job_runs_service') THEN
    CREATE POLICY maint_job_runs_service ON fleet.maintenance_job_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_audit_service') THEN
    CREATE POLICY maint_audit_service ON fleet.maintenance_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON fleet.maintenance_events TO service_role;
GRANT ALL ON fleet.maintenance_alerts TO service_role;
GRANT ALL ON fleet.maintenance_job_runs TO service_role;
GRANT ALL ON fleet.maintenance_audit_log TO service_role;
GRANT USAGE ON SEQUENCE fleet.maintenance_log_number_seq TO service_role;
