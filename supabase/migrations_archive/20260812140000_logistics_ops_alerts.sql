-- Phase F: Enterprise ops alert inbox.

CREATE TABLE IF NOT EXISTS logistics.ops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('matching_exhausted', 'job_exception', 'stale_gps')),
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  job_id UUID REFERENCES logistics.jobs(id) ON DELETE SET NULL,
  shipment_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_ops_alerts_org_unread
  ON logistics.ops_alerts (organization_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_logistics_ops_alerts_org_created
  ON logistics.ops_alerts (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logistics_ops_alerts_job_kind
  ON logistics.ops_alerts (job_id, kind, created_at DESC)
  WHERE job_id IS NOT NULL;

ALTER TABLE logistics.ops_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_ops_alerts_select ON logistics.ops_alerts;
CREATE POLICY logistics_ops_alerts_select ON logistics.ops_alerts
  FOR SELECT TO authenticated
  USING (logistics.user_owns_org(organization_id));

DROP POLICY IF EXISTS logistics_ops_alerts_no_insert ON logistics.ops_alerts;
CREATE POLICY logistics_ops_alerts_no_insert ON logistics.ops_alerts
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS logistics_ops_alerts_no_update ON logistics.ops_alerts;
CREATE POLICY logistics_ops_alerts_no_update ON logistics.ops_alerts
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS logistics_ops_alerts_no_delete ON logistics.ops_alerts;
CREATE POLICY logistics_ops_alerts_no_delete ON logistics.ops_alerts
  FOR DELETE TO authenticated USING (false);

GRANT SELECT ON logistics.ops_alerts TO authenticated;
GRANT ALL ON logistics.ops_alerts TO service_role;
