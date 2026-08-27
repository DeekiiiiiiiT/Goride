-- Rush H3 foundation: coverage cells, merchant reach, courier presence, lookup RPC, demand/surge
-- ADR 0013 + H3 Spatial Master Plan Phases 3–4

CREATE EXTENSION IF NOT EXISTS postgis;

--------------------------------------------------------------------------------
-- 1. Market coverage cells (derived from polygons; compile at res 7 + 8)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery.coverage_cells (
  market_id UUID NOT NULL REFERENCES delivery.service_markets(id) ON DELETE CASCADE,
  h3_cell   TEXT NOT NULL,
  h3_res    SMALLINT NOT NULL CHECK (h3_res BETWEEN 4 AND 10),
  kind      TEXT NOT NULL CHECK (kind IN ('include', 'exclude')),
  PRIMARY KEY (market_id, h3_res, h3_cell, kind)
);

CREATE INDEX IF NOT EXISTS idx_coverage_cells_lookup
  ON delivery.coverage_cells (h3_res, h3_cell, kind);

COMMENT ON TABLE delivery.coverage_cells IS
  'Derived H3 cache of published market polygons. Polygons remain source of truth.';

ALTER TABLE delivery.coverage_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coverage_cells_service ON delivery.coverage_cells;
CREATE POLICY coverage_cells_service ON delivery.coverage_cells
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS coverage_cells_authenticated_select ON delivery.coverage_cells;
CREATE POLICY coverage_cells_authenticated_select ON delivery.coverage_cells
  FOR SELECT TO authenticated USING (true);

--------------------------------------------------------------------------------
-- 2. Merchant reach cells (radius disk ∩ market include)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery.merchant_coverage_cells (
  merchant_id UUID NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  h3_cell     TEXT NOT NULL,
  h3_res      SMALLINT NOT NULL CHECK (h3_res BETWEEN 4 AND 10),
  PRIMARY KEY (merchant_id, h3_res, h3_cell)
);

CREATE INDEX IF NOT EXISTS idx_merchant_coverage_cells_lookup
  ON delivery.merchant_coverage_cells (h3_res, h3_cell);

ALTER TABLE delivery.merchant_coverage_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_coverage_cells_service ON delivery.merchant_coverage_cells;
CREATE POLICY merchant_coverage_cells_service ON delivery.merchant_coverage_cells
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS merchant_coverage_cells_auth_select ON delivery.merchant_coverage_cells;
CREATE POLICY merchant_coverage_cells_auth_select ON delivery.merchant_coverage_cells
  FOR SELECT TO authenticated USING (true);

--------------------------------------------------------------------------------
-- 3. Courier availability H3 columns
--------------------------------------------------------------------------------

ALTER TABLE delivery.courier_availability
  ADD COLUMN IF NOT EXISTS h3_cell TEXT,
  ADD COLUMN IF NOT EXISTS h3_res SMALLINT;

-- Backfill cannot compute H3 in SQL (no h3 extension). Clear stale; edge re-stamps on next ping.
UPDATE delivery.courier_availability
SET h3_cell = NULL, h3_res = NULL
WHERE h3_cell IS NULL OR h3_res IS NULL;

CREATE INDEX IF NOT EXISTS idx_courier_avail_h3_online
  ON delivery.courier_availability (h3_res, h3_cell, last_location_update DESC)
  WHERE is_online = TRUE AND h3_cell IS NOT NULL;

--------------------------------------------------------------------------------
-- 4. Bounded courier H3 lookup RPC
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delivery_couriers_in_h3_cells(
  p_cells TEXT[],
  p_res SMALLINT,
  p_fresh_since TIMESTAMPTZ,
  p_limit INT DEFAULT 200
)
RETURNS TABLE (
  driver_id UUID,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  h3_cell TEXT,
  h3_res SMALLINT,
  last_location_update TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
BEGIN
  IF p_cells IS NULL OR cardinality(p_cells) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_cells) > 2000 THEN
    RAISE EXCEPTION 'h3_cell_array_too_large' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;
  p_limit := LEAST(p_limit, 500);

  RETURN QUERY
  SELECT
    ca.driver_id,
    ca.current_lat,
    ca.current_lng,
    ca.h3_cell,
    ca.h3_res,
    ca.last_location_update
  FROM delivery.courier_availability ca
  WHERE ca.h3_res = p_res
    AND ca.h3_cell = ANY (p_cells)
    AND ca.is_online = TRUE
    AND ca.h3_cell IS NOT NULL
    AND ca.last_location_update >= p_fresh_since
  ORDER BY ca.last_location_update DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_couriers_in_h3_cells TO service_role;

--------------------------------------------------------------------------------
-- 5. Windowed hex demand + surge_now (not rides open_requests ratchet)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery.demand_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h3_cell TEXT NOT NULL,
  h3_res SMALLINT NOT NULL,
  market_id UUID REFERENCES delivery.service_markets(id) ON DELETE SET NULL,
  order_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_events_window
  ON delivery.demand_events (h3_res, h3_cell, occurred_at DESC);

CREATE TABLE IF NOT EXISTS delivery.surge_now (
  h3_cell TEXT NOT NULL,
  h3_res SMALLINT NOT NULL,
  open_demand INTEGER NOT NULL DEFAULT 0,
  surge_multiplier NUMERIC(12, 4) NOT NULL DEFAULT 1.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (h3_res, h3_cell)
);

ALTER TABLE delivery.demand_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.surge_now ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demand_events_service ON delivery.demand_events;
CREATE POLICY demand_events_service ON delivery.demand_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS surge_now_service ON delivery.surge_now;
CREATE POLICY surge_now_service ON delivery.surge_now
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS surge_now_auth_select ON delivery.surge_now;
CREATE POLICY surge_now_auth_select ON delivery.surge_now
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.delivery_refresh_surge_now(
  p_window_minutes INT DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  v_since TIMESTAMPTZ := NOW() - make_interval(mins => GREATEST(1, p_window_minutes));
  v_count INTEGER := 0;
BEGIN
  DELETE FROM delivery.surge_now;

  INSERT INTO delivery.surge_now (h3_cell, h3_res, open_demand, surge_multiplier, updated_at)
  SELECT
    de.h3_cell,
    de.h3_res,
    COUNT(*)::INTEGER AS open_demand,
    CASE
      WHEN COUNT(*) >= 12 THEN 2.0
      WHEN COUNT(*) >= 8 THEN 1.5
      WHEN COUNT(*) >= 4 THEN 1.2
      ELSE 1.0
    END,
    NOW()
  FROM delivery.demand_events de
  WHERE de.occurred_at >= v_since
  GROUP BY de.h3_cell, de.h3_res;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delivery_refresh_surge_now TO service_role;

-- Stale courier presence sweep (pg_cron if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery_courier_stale_offline') THEN
      PERFORM cron.unschedule('delivery_courier_stale_offline');
    END IF;
    PERFORM cron.schedule(
      'delivery_courier_stale_offline',
      '*/5 * * * *',
      $cron$UPDATE delivery.courier_availability
        SET is_online = FALSE
        WHERE is_online = TRUE
          AND last_location_update < NOW() - INTERVAL '15 minutes'$cron$
    );
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery_refresh_surge_now') THEN
      PERFORM cron.unschedule('delivery_refresh_surge_now');
    END IF;
    PERFORM cron.schedule(
      'delivery_refresh_surge_now',
      '* * * * *',
      $cron$SELECT public.delivery_refresh_surge_now(15)$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

--------------------------------------------------------------------------------
-- 6. Coverage / merchant cell public views (security_invoker)
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.delivery_coverage_cells
WITH (security_invoker = true) AS
  SELECT market_id, h3_cell, h3_res, kind FROM delivery.coverage_cells;

CREATE OR REPLACE VIEW public.delivery_merchant_coverage_cells
WITH (security_invoker = true) AS
  SELECT merchant_id, h3_cell, h3_res FROM delivery.merchant_coverage_cells;

CREATE OR REPLACE VIEW public.delivery_surge_now
WITH (security_invoker = true) AS
  SELECT h3_cell, h3_res, open_demand, surge_multiplier, updated_at FROM delivery.surge_now;

GRANT SELECT ON public.delivery_coverage_cells TO authenticated, service_role;
GRANT SELECT ON public.delivery_merchant_coverage_cells TO authenticated, service_role;
GRANT SELECT ON public.delivery_surge_now TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
