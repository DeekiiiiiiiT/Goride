-- Shared logistics job primitives (Enterprise first adapter: domestic freight shipments).
-- Writes: service role / edge only. Authenticated members: SELECT for own org.

CREATE SCHEMA IF NOT EXISTS logistics;

GRANT USAGE ON SCHEMA logistics TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL DEFAULT 'enterprise'
    CHECK (product_key IN ('enterprise', 'fleet', 'dash', 'rides')),
  vertical_key TEXT NOT NULL DEFAULT 'freight'
    CHECK (vertical_key IN ('freight', 'delivery', 'haulage')),
  external_ref_type TEXT NOT NULL
    CHECK (external_ref_type IN ('freight_shipment')),
  external_ref_id UUID NOT NULL,
  reference_code TEXT,
  status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (status IN (
      'unassigned', 'assigned', 'in_progress', 'completed', 'cancelled', 'exception'
    )),
  -- Marketplace reserved for Phase C; CHECK allows storage of legacy/future values but
  -- assign API rejects roam_marketplace until matching adapter ships.
  assignee_type TEXT
    CHECK (
      assignee_type IS NULL
      OR assignee_type IN ('org_fleet', 'client_fleet', 'third_party', 'roam_marketplace')
    ),
  assignee_driver_id UUID,
  assignee_vehicle_id UUID,
  client_fleet_asset_id UUID,
  third_party_carrier_id UUID,
  pickup_label TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  dropoff_label TEXT,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  scheduled_pickup_at TIMESTAMPTZ,
  scheduled_dropoff_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_ref_type, external_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_logistics_jobs_org_status
  ON logistics.jobs (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_logistics_jobs_org_assignee
  ON logistics.jobs (organization_id, assignee_type)
  WHERE assignee_type IS NOT NULL;

-- ---------------------------------------------------------------------------
-- job_stops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.job_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES logistics.jobs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  stop_type TEXT NOT NULL DEFAULT 'waypoint'
    CHECK (stop_type IN ('pickup', 'dropoff', 'waypoint')),
  label TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  external_leg_id UUID,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'arrived', 'completed', 'skipped', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_logistics_job_stops_job
  ON logistics.job_stops (job_id, sequence);

-- ---------------------------------------------------------------------------
-- job_events (append-only audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES logistics.jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id UUID,
  note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_logistics_job_events_job
  ON logistics.job_events (job_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — mirror freight posture
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION logistics.user_owns_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_org_id AND o.owner_id = auth.uid()
  )
  OR public.rbac_is_platform_user(auth.uid());
$$;

ALTER TABLE logistics.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics.job_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics.job_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['jobs', 'job_stops', 'job_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS logistics_%s_select ON logistics.%I', t, t);
    EXECUTE format(
      $pol$
      CREATE POLICY logistics_%s_select ON logistics.%I
        FOR SELECT TO authenticated
        USING (logistics.user_owns_org(organization_id))
      $pol$,
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS logistics_%s_no_insert ON logistics.%I', t, t);
    EXECUTE format(
      'CREATE POLICY logistics_%s_no_insert ON logistics.%I FOR INSERT TO authenticated WITH CHECK (false)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS logistics_%s_no_update ON logistics.%I', t, t);
    EXECUTE format(
      'CREATE POLICY logistics_%s_no_update ON logistics.%I FOR UPDATE TO authenticated USING (false)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS logistics_%s_no_delete ON logistics.%I', t, t);
    EXECUTE format(
      'CREATE POLICY logistics_%s_no_delete ON logistics.%I FOR DELETE TO authenticated USING (false)',
      t, t
    );
  END LOOP;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA logistics TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA logistics TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA logistics TO service_role;
