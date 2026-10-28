-- Phase B: weekly operational read model for driver Overview / Analytics (not money).
-- Money stays on ledger.driver_financial_periods; settlements desk stays on money periods.

CREATE TABLE IF NOT EXISTS ledger.driver_operational_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  driver_id TEXT NOT NULL,
  period_anchor DATE NOT NULL,
  period_end DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Jamaica',
  trip_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  distance_km NUMERIC(14,2) NOT NULL DEFAULT 0,
  duration_minutes NUMERIC(14,2) NOT NULL DEFAULT 0,
  rating_sum NUMERIC(14,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  acceptance_rate NUMERIC(8,4),
  cancellation_rate NUMERIC(8,4),
  platform_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash TEXT NOT NULL DEFAULT '',
  projection_version INTEGER NOT NULL DEFAULT 1,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, period_anchor)
);

CREATE INDEX IF NOT EXISTS idx_dop_driver_anchor
  ON ledger.driver_operational_periods(driver_id, period_anchor DESC);
CREATE INDEX IF NOT EXISTS idx_dop_org_anchor
  ON ledger.driver_operational_periods(organization_id, period_anchor DESC);

CREATE OR REPLACE VIEW public.driver_operational_periods AS
  SELECT * FROM ledger.driver_operational_periods;

ALTER TABLE ledger.driver_operational_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dop_select ON ledger.driver_operational_periods;
CREATE POLICY dop_select ON ledger.driver_operational_periods
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id::text = COALESCE(
      auth.jwt() ->> 'organization_id',
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      ''
    )
  );

GRANT SELECT ON public.driver_operational_periods TO authenticated, service_role;
GRANT ALL ON ledger.driver_operational_periods TO service_role;

-- Fleet rollup for Analytics: sum ops metrics by driver for a date window.
CREATE OR REPLACE FUNCTION public.fleet_operational_rollup_by_driver(
  p_org_id text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  driver_id text,
  trip_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  distance_km numeric,
  duration_minutes numeric,
  rating_sum numeric,
  rating_count bigint,
  acceptance_rate numeric,
  cancellation_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  SELECT
    d.driver_id,
    COALESCE(SUM(d.trip_count), 0)::bigint AS trip_count,
    COALESCE(SUM(d.completed_count), 0)::bigint AS completed_count,
    COALESCE(SUM(d.cancelled_count), 0)::bigint AS cancelled_count,
    ROUND(COALESCE(SUM(d.distance_km), 0)::numeric, 2) AS distance_km,
    ROUND(COALESCE(SUM(d.duration_minutes), 0)::numeric, 2) AS duration_minutes,
    ROUND(COALESCE(SUM(d.rating_sum), 0)::numeric, 2) AS rating_sum,
    COALESCE(SUM(d.rating_count), 0)::bigint AS rating_count,
    CASE
      WHEN SUM(d.completed_count) + SUM(d.cancelled_count) > 0
      THEN ROUND(
        (SUM(d.completed_count)::numeric /
          NULLIF(SUM(d.completed_count) + SUM(d.cancelled_count), 0)),
        4
      )
      ELSE NULL
    END AS acceptance_rate,
    CASE
      WHEN SUM(d.completed_count) + SUM(d.cancelled_count) > 0
      THEN ROUND(
        (SUM(d.cancelled_count)::numeric /
          NULLIF(SUM(d.completed_count) + SUM(d.cancelled_count), 0)),
        4
      )
      ELSE NULL
    END AS cancellation_rate
  FROM ledger.driver_operational_periods d
  WHERE (p_org_id IS NULL OR d.organization_id::text = p_org_id OR d.organization_id IS NULL)
    AND (p_from IS NULL OR d.period_end >= p_from)
    AND (p_to IS NULL OR d.period_anchor <= p_to)
  GROUP BY d.driver_id;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_operational_rollup_by_driver(text, date, date) TO service_role;
