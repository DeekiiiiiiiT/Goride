-- Fuel Brain: sessions evidence + control-plane tables
-- See docs/platform/FUEL_BRAIN.md

CREATE SCHEMA IF NOT EXISTS fuel;

GRANT USAGE ON SCHEMA fuel TO authenticated, service_role;

--------------------------------------------------------------------------------
-- fuel.driving_sessions — Personal / Off-duty / Work evidence windows
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fuel.driving_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT,
  driver_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('personal', 'off_duty', 'work')),
  source TEXT NOT NULL CHECK (source IN ('driver_toggle', 'driver_declare', 'admin_override')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ, -- NULL = open session
  start_odo NUMERIC,
  end_odo NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_driving_sessions_end_after_start
    CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_fuel_driving_sessions_driver_start
  ON fuel.driving_sessions (driver_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_driving_sessions_vehicle_start
  ON fuel.driving_sessions (vehicle_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_driving_sessions_open
  ON fuel.driving_sessions (driver_id, vehicle_id)
  WHERE end_at IS NULL;

COMMENT ON TABLE fuel.driving_sessions IS
  'Driver/admin declared driving purpose windows for Fuel Brain classification.';

--------------------------------------------------------------------------------
-- fuel.brain_policies — Deadhead gap rules + Unknown finalize threshold
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fuel.brain_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  -- Gap classification (minutes) — mirrors deadhead Method C defaults
  deadhead_gap_max_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (deadhead_gap_max_minutes BETWEEN 1 AND 240),
  personal_gap_min_minutes INTEGER NOT NULL DEFAULT 120
    CHECK (personal_gap_min_minutes BETWEEN 30 AND 1440),
  peak_hours_start INTEGER NOT NULL DEFAULT 6
    CHECK (peak_hours_start BETWEEN 0 AND 23),
  peak_hours_end INTEGER NOT NULL DEFAULT 22
    CHECK (peak_hours_end BETWEEN 0 AND 23),
  -- Finalize gate when FLEET_USE_FUEL_BRAIN=1
  unknown_finalize_threshold_km NUMERIC NOT NULL DEFAULT 25
    CHECK (unknown_finalize_threshold_km >= 0),
  unknown_finalize_threshold_pct NUMERIC NOT NULL DEFAULT 10
    CHECK (unknown_finalize_threshold_pct BETWEEN 0 AND 100),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fuel_brain_policies_one_default
  ON fuel.brain_policies (is_default) WHERE is_default = TRUE;

INSERT INTO fuel.brain_policies (name, is_default)
SELECT 'default', TRUE
WHERE NOT EXISTS (SELECT 1 FROM fuel.brain_policies WHERE is_default = TRUE);

--------------------------------------------------------------------------------
-- fuel.product_profiles — which fleets may enable FLEET_USE_FUEL_BRAIN
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fuel.product_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key TEXT NOT NULL DEFAULT 'fleet'
    CHECK (product_key IN ('fleet', 'enterprise', 'driver')),
  organization_id TEXT,
  fuel_brain_consumer_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_product_profiles_org
  ON fuel.product_profiles (organization_id);

--------------------------------------------------------------------------------
-- fuel.unknown_reviews — admin queue for unexplained km windows
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fuel.unknown_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT,
  driver_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  unknown_km NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_label TEXT
    CHECK (resolution_label IS NULL OR resolution_label IN ('personal', 'deadhead', 'company', 'dismissed')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  classify_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_unknown_reviews_status
  ON fuel.unknown_reviews (status, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_unknown_reviews_vehicle_week
  ON fuel.unknown_reviews (vehicle_id, week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fuel TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA fuel TO authenticated;

--------------------------------------------------------------------------------
-- RLS + public views (PostgREST access when fuel schema not exposed)
--------------------------------------------------------------------------------

ALTER TABLE fuel.driving_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.brain_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.product_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.unknown_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_driving_sessions_service ON fuel.driving_sessions;
CREATE POLICY fuel_driving_sessions_service ON fuel.driving_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fuel_brain_policies_service ON fuel.brain_policies;
CREATE POLICY fuel_brain_policies_service ON fuel.brain_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fuel_product_profiles_service ON fuel.product_profiles;
CREATE POLICY fuel_product_profiles_service ON fuel.product_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fuel_unknown_reviews_service ON fuel.unknown_reviews;
CREATE POLICY fuel_unknown_reviews_service ON fuel.unknown_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP VIEW IF EXISTS public.fuel_driving_sessions;
CREATE OR REPLACE VIEW public.fuel_driving_sessions AS
  SELECT * FROM fuel.driving_sessions;

DROP VIEW IF EXISTS public.fuel_brain_policies;
CREATE OR REPLACE VIEW public.fuel_brain_policies AS
  SELECT * FROM fuel.brain_policies;

DROP VIEW IF EXISTS public.fuel_product_profiles;
CREATE OR REPLACE VIEW public.fuel_product_profiles AS
  SELECT * FROM fuel.product_profiles;

DROP VIEW IF EXISTS public.fuel_unknown_reviews;
CREATE OR REPLACE VIEW public.fuel_unknown_reviews AS
  SELECT * FROM fuel.unknown_reviews;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_driving_sessions TO service_role;
GRANT SELECT ON public.fuel_driving_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_brain_policies TO service_role;
GRANT SELECT ON public.fuel_brain_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_product_profiles TO service_role;
GRANT SELECT ON public.fuel_product_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_unknown_reviews TO service_role;
GRANT SELECT ON public.fuel_unknown_reviews TO authenticated;
