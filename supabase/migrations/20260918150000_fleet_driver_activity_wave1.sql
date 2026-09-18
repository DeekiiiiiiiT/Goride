-- Driver Activity Wave 1: projection table + source time indexes for ingest.

-- ── ACT-05: fleet.driver_activity_events (rebuildable read model) ───────────
CREATE TABLE IF NOT EXISTS fleet.driver_activity_events (
  id                bigserial PRIMARY KEY,
  organization_id   text        NOT NULL,
  driver_id         text        NOT NULL,
  service_line      text        NOT NULL CHECK (service_line IN ('roam_rides', 'roam_rush', 'fleet_ops')),
  source            text        NOT NULL,
  source_event_id   text        NOT NULL,
  event_type        text        NOT NULL,
  occurred_at       timestamptz NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  job_ref           text,
  job_seq           int,
  payload           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT driver_activity_events_source_uidx UNIQUE (source, source_event_id)
);

CREATE INDEX IF NOT EXISTS fleet_driver_activity_events_driver_time_idx
  ON fleet.driver_activity_events (organization_id, driver_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fleet_driver_activity_events_job_ref_idx
  ON fleet.driver_activity_events (job_ref) WHERE job_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_driver_activity_events_ingested_idx
  ON fleet.driver_activity_events (ingested_at);

ALTER TABLE fleet.driver_activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_activity_events_select ON fleet.driver_activity_events;
CREATE POLICY driver_activity_events_select ON fleet.driver_activity_events
  FOR SELECT TO authenticated USING (fleet.can_read_org(organization_id));
DROP POLICY IF EXISTS driver_activity_events_no_direct_write ON fleet.driver_activity_events;
CREATE POLICY driver_activity_events_no_direct_write ON fleet.driver_activity_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT ALL ON fleet.driver_activity_events TO service_role;
GRANT SELECT ON fleet.driver_activity_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE fleet.driver_activity_events_id_seq TO service_role;

CREATE OR REPLACE VIEW public.fleet_driver_activity_events AS
  SELECT * FROM fleet.driver_activity_events;
GRANT SELECT ON public.fleet_driver_activity_events TO authenticated;
GRANT ALL ON public.fleet_driver_activity_events TO service_role;

-- Coverage for rides/delivery event sources (historical append-only; covered from earliest practical)
INSERT INTO fleet.activity_source_coverage (service_line, source, covered_from, covered_to, note)
VALUES
  ('roam_rides', 'rides.audit_events', '2025-01-01'::timestamptz, NULL, 'Append-only ride lifecycle; backfillable'),
  ('roam_rides', 'rides.driver_offers', '2025-01-01'::timestamptz, NULL, 'Offer status history; backfillable'),
  ('roam_rush',  'delivery.order_events', '2025-01-01'::timestamptz, NULL, 'Append-only delivery lifecycle; backfillable')
ON CONFLICT DO NOTHING;

-- Ingest watermarks (per source)
CREATE TABLE IF NOT EXISTS fleet.activity_ingest_watermarks (
  source            text PRIMARY KEY,
  last_occurred_at  timestamptz,
  last_source_id    text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fleet.activity_ingest_watermarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_ingest_watermarks_no_direct ON fleet.activity_ingest_watermarks;
CREATE POLICY activity_ingest_watermarks_no_direct ON fleet.activity_ingest_watermarks
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
GRANT ALL ON fleet.activity_ingest_watermarks TO service_role;

CREATE OR REPLACE VIEW public.fleet_activity_ingest_watermarks AS
  SELECT * FROM fleet.activity_ingest_watermarks;
GRANT ALL ON public.fleet_activity_ingest_watermarks TO service_role;

-- Public wrapper so PostgREST can call the Wave 0 sweeper
CREATE OR REPLACE FUNCTION public.sweep_stale_presence(p_grace_seconds int DEFAULT 300)
RETURNS TABLE(closed_rides bigint, closed_rush bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT * FROM fleet.sweep_stale_presence(p_grace_seconds);
$$;
GRANT EXECUTE ON FUNCTION public.sweep_stale_presence(int) TO service_role;

-- ── ACT-06: source time indexes for incremental ingest ──────────────────────
CREATE INDEX IF NOT EXISTS idx_rides_audit_created_at
  ON rides.audit_events (created_at);

CREATE INDEX IF NOT EXISTS idx_delivery_order_events_created_at
  ON delivery.order_events (created_at);

NOTIFY pgrst, 'reload schema';
