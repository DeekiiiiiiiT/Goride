-- maintenance_log KV domain → fleet.maintenance_logs
CREATE TABLE IF NOT EXISTS fleet.maintenance_logs (
  id text PRIMARY KEY,
  organization_id text,
  vehicle_id text,
  license_plate text,
  service_date date,
  odometer numeric,
  cost numeric,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_maintenance_logs_legacy_kv_uidx ON fleet.maintenance_logs (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_maintenance_logs_vehicle_idx ON fleet.maintenance_logs (vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_maintenance_logs_org_idx ON fleet.maintenance_logs (organization_id);

DROP TRIGGER IF EXISTS set_updated_at ON fleet.maintenance_logs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fleet.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION fleet.set_updated_at();

ALTER TABLE fleet.maintenance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maintenance_logs_select ON fleet.maintenance_logs;
CREATE POLICY maintenance_logs_select ON fleet.maintenance_logs
  FOR SELECT TO authenticated USING (fleet.can_read_org(organization_id));
DROP POLICY IF EXISTS maintenance_logs_no_direct_write ON fleet.maintenance_logs;
CREATE POLICY maintenance_logs_no_direct_write ON fleet.maintenance_logs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT ALL ON fleet.maintenance_logs TO service_role;
GRANT SELECT ON fleet.maintenance_logs TO authenticated;

CREATE OR REPLACE VIEW public.fleet_maintenance_logs AS SELECT * FROM fleet.maintenance_logs;
GRANT SELECT ON public.fleet_maintenance_logs TO authenticated;
GRANT ALL ON public.fleet_maintenance_logs TO service_role;

CREATE INDEX IF NOT EXISTS fleet_claims_org_idx ON fleet.claims (organization_id);
CREATE INDEX IF NOT EXISTS fleet_pll_org_idx ON fleet.payment_ledger_lines (organization_id);
