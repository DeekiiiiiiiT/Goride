-- Toll Brain: detect + classify control plane
-- See docs/platform/TOLL_BRAIN.md

CREATE SCHEMA IF NOT EXISTS toll;

GRANT USAGE ON SCHEMA toll TO authenticated, service_role;

--------------------------------------------------------------------------------
-- toll.brain_policies — live detect + match tunables
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS toll.brain_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',

  -- Detect
  detection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  detect_enroute BOOLEAN NOT NULL DEFAULT FALSE,
  geofence_radius_m INTEGER NOT NULL DEFAULT 100
    CHECK (geofence_radius_m BETWEEN 10 AND 2000),
  round_trip_cooldown_ms INTEGER NOT NULL DEFAULT 300000
    CHECK (round_trip_cooldown_ms BETWEEN 0 AND 3600000),
  live_ledger_materialize_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Match windows / amounts
  approach_minutes INTEGER NOT NULL DEFAULT 45
    CHECK (approach_minutes BETWEEN 5 AND 180),
  post_trip_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (post_trip_minutes BETWEEN 0 AND 120),
  same_day_pad_days INTEGER NOT NULL DEFAULT 1
    CHECK (same_day_pad_days BETWEEN 0 AND 3),
  variance_threshold NUMERIC NOT NULL DEFAULT 0.05
    CHECK (variance_threshold >= 0),
  cash_amount_delta_max NUMERIC NOT NULL DEFAULT 15
    CHECK (cash_amount_delta_max >= 0),
  cash_receipt_proximity_minutes INTEGER NOT NULL DEFAULT 90
    CHECK (cash_receipt_proximity_minutes BETWEEN 15 AND 480),

  -- Personal / orphan
  personal_use_detection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  orphan_proximity_minutes INTEGER NOT NULL DEFAULT 180
    CHECK (orphan_proximity_minutes BETWEEN 15 AND 480),

  -- Ambiguity
  ambiguity_min_score INTEGER NOT NULL DEFAULT 50
    CHECK (ambiguity_min_score BETWEEN 0 AND 100),
  ambiguity_max_gap INTEGER NOT NULL DEFAULT 15
    CHECK (ambiguity_max_gap BETWEEN 0 AND 50),
  max_suggestions INTEGER NOT NULL DEFAULT 5
    CHECK (max_suggestions BETWEEN 1 AND 20),

  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_toll_brain_policies_one_default
  ON toll.brain_policies (is_default) WHERE is_default = TRUE;

INSERT INTO toll.brain_policies (name, is_default)
SELECT 'default', TRUE
WHERE NOT EXISTS (SELECT 1 FROM toll.brain_policies WHERE is_default = TRUE);

--------------------------------------------------------------------------------
-- Public views (service_role + authenticated, same pattern as fuel_brain_policies)
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.toll_brain_policies AS
SELECT * FROM toll.brain_policies;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.toll_brain_policies TO service_role;
GRANT SELECT ON public.toll_brain_policies TO authenticated;

COMMENT ON TABLE toll.brain_policies IS
  'Toll Brain detect + match policies (Dominion Toll Brain page).';
