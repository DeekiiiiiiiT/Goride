-- Platform Matching Brain: bounded context for rider-driver matching.
-- This schema enables a central matching engine that can serve multiple products
-- (rides, fleet, dash, enterprise) through a dedicated Edge function.
-- See docs/platform/MATCHING_BRAIN.md (to be created in Phase 6).

--------------------------------------------------------------------------------
-- 1. Create the matching schema
--------------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS matching;

GRANT USAGE ON SCHEMA matching TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 2. matching.policies — Global dispatch/matching settings
--    Migrated from rides.dispatch_settings with new fields for serial dispatch + H3.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matching.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  
  -- Wave dispatch settings (from rides.dispatch_settings)
  max_match_waves INTEGER NOT NULL DEFAULT 3 
    CHECK (max_match_waves BETWEEN 1 AND 5),
  wave_radius_km NUMERIC[] NOT NULL DEFAULT '{5,15,35}',
  max_offers_per_wave INTEGER NOT NULL DEFAULT 8 
    CHECK (max_offers_per_wave BETWEEN 1 AND 20),
  default_driver_offer_timeout_seconds INTEGER NOT NULL DEFAULT 15
    CHECK (default_driver_offer_timeout_seconds BETWEEN 5 AND 120),
  driver_location_max_age_minutes INTEGER NOT NULL DEFAULT 10
    CHECK (driver_location_max_age_minutes BETWEEN 1 AND 30),
  max_matching_duration_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (max_matching_duration_minutes BETWEEN 2 AND 120),
  
  -- Quote ETA settings
  quote_driver_radius_km NUMERIC NOT NULL DEFAULT 15
    CHECK (quote_driver_radius_km > 0 AND quote_driver_radius_km <= 50),
  
  -- Body type filtering
  body_type_filtering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  body_type_tier_mode TEXT NOT NULL DEFAULT 'expand'
    CHECK (body_type_tier_mode IN ('expand', 'strict')),
  require_body_type_for_offers BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Driver mode filtering
  independent_only_matching BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Trip lifecycle settings (kept here for policy consistency)
  trip_location_interval_seconds INTEGER NOT NULL DEFAULT 4
    CHECK (trip_location_interval_seconds BETWEEN 2 AND 30),
  pickup_geofence_radius_m INTEGER NOT NULL DEFAULT 80
    CHECK (pickup_geofence_radius_m BETWEEN 20 AND 500),
  dropoff_geofence_radius_m INTEGER NOT NULL DEFAULT 100
    CHECK (dropoff_geofence_radius_m BETWEEN 20 AND 500),
  arrival_dwell_seconds INTEGER NOT NULL DEFAULT 15
    CHECK (arrival_dwell_seconds BETWEEN 0 AND 120),
  max_speed_mps_for_arrival NUMERIC NOT NULL DEFAULT 4
    CHECK (max_speed_mps_for_arrival BETWEEN 0 AND 20),
  auto_en_route_on_accept BOOLEAN NOT NULL DEFAULT TRUE,
  auto_arrive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_complete_suggest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  no_show_cancel_minutes INTEGER NOT NULL DEFAULT 5
    CHECK (no_show_cancel_minutes BETWEEN 0 AND 60),
  gps_max_accuracy_m_for_arrival INTEGER NOT NULL DEFAULT 50
    CHECK (gps_max_accuracy_m_for_arrival BETWEEN 10 AND 200),
  no_show_auto_cancel_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Wait time settings
  wait_time_grace_minutes INTEGER NOT NULL DEFAULT 2
    CHECK (wait_time_grace_minutes BETWEEN 0 AND 10),
  wait_time_rate_per_min_minor INTEGER NOT NULL DEFAULT 50,
  wait_time_charge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  wait_time_max_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (wait_time_max_minutes BETWEEN 1 AND 60),
  
  -- PIN verification
  pin_verification_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pin_verification_required_for_start BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Toll detection
  toll_detection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  toll_geofence_radius_m INTEGER NOT NULL DEFAULT 100
    CHECK (toll_geofence_radius_m BETWEEN 50 AND 500),
  
  -- NEW: Serial dispatch (Phase 2)
  serial_dispatch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- NEW: H3 spatial indexing (Phase 4+5)
  h3_resolution INTEGER NOT NULL DEFAULT 7
    CHECK (h3_resolution BETWEEN 4 AND 10),
  h3_supply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  h3_surge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  wave_h3_k_rings INTEGER[] NOT NULL DEFAULT '{0,2,6}',
  
  -- Audit
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE matching.policies IS 
  'Global matching policies. Multiple policies can exist for A/B testing or per-product overrides.';
COMMENT ON COLUMN matching.policies.serial_dispatch_enabled IS 
  'When true, offer one driver at a time (serial) instead of parallel broadcast.';
COMMENT ON COLUMN matching.policies.h3_resolution IS 
  'H3 hexagon resolution for spatial indexing. 7 = ~1.2km edge, 8 = ~460m edge.';
COMMENT ON COLUMN matching.policies.wave_h3_k_rings IS 
  'Array of k-ring values per wave for H3 lookups. Calibrate per market.';

CREATE INDEX IF NOT EXISTS idx_matching_policies_default 
  ON matching.policies(is_default) WHERE is_default = TRUE;

--------------------------------------------------------------------------------
-- 3. matching.product_profiles — Maps products to policies
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matching.product_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key TEXT NOT NULL CHECK (product_key IN ('rides', 'fleet', 'dash', 'enterprise')),
  surface_key TEXT NOT NULL DEFAULT 'default' CHECK (surface_key IN ('rider', 'driver', 'default')),
  policy_id UUID NOT NULL REFERENCES matching.policies(id) ON DELETE CASCADE,
  
  -- Per-product overrides (nullable, merges with policy)
  overrides JSONB,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(product_key, surface_key)
);

COMMENT ON TABLE matching.product_profiles IS 
  'Maps each product/surface to a matching policy. Overrides allow per-product tweaks.';

CREATE INDEX IF NOT EXISTS idx_matching_product_profiles_lookup 
  ON matching.product_profiles(product_key, surface_key) WHERE is_active = TRUE;

--------------------------------------------------------------------------------
-- 4. matching.audit_events — Audit log for matching operations
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matching.audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  product_key TEXT,
  policy_id UUID REFERENCES matching.policies(id) ON DELETE SET NULL,
  actor_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE matching.audit_events IS 'Audit log for policy changes and matching operations.';

CREATE INDEX IF NOT EXISTS idx_matching_audit_created 
  ON matching.audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matching_audit_policy 
  ON matching.audit_events(policy_id) WHERE policy_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 5. Seed default policy from rides.dispatch_settings (if exists)
--------------------------------------------------------------------------------

DO $$
DECLARE
  existing_policy_id UUID;
  rides_settings RECORD;
BEGIN
  -- Check if we already have a default policy
  SELECT id INTO existing_policy_id 
  FROM matching.policies 
  WHERE is_default = TRUE 
  LIMIT 1;
  
  IF existing_policy_id IS NULL THEN
    -- Try to read from rides.dispatch_settings
    BEGIN
      SELECT * INTO rides_settings 
      FROM rides.dispatch_settings 
      WHERE id = 1;
      
      IF rides_settings IS NOT NULL THEN
        INSERT INTO matching.policies (
          name,
          is_default,
          max_match_waves,
          wave_radius_km,
          max_offers_per_wave,
          default_driver_offer_timeout_seconds,
          driver_location_max_age_minutes,
          quote_driver_radius_km,
          body_type_filtering_enabled,
          body_type_tier_mode,
          require_body_type_for_offers
        ) VALUES (
          'default',
          TRUE,
          COALESCE(rides_settings.max_match_waves, 3),
          COALESCE(rides_settings.wave_radius_km, '{5,15,35}'::NUMERIC[]),
          COALESCE(rides_settings.max_offers_per_wave, 8),
          COALESCE(rides_settings.default_driver_offer_timeout_seconds, 15),
          COALESCE(rides_settings.driver_location_max_age_minutes, 10),
          COALESCE(rides_settings.quote_driver_radius_km, 15),
          COALESCE(rides_settings.body_type_filtering_enabled, TRUE),
          COALESCE(rides_settings.body_type_tier_mode, 'expand'),
          COALESCE(rides_settings.require_body_type_for_offers, TRUE)
        )
        RETURNING id INTO existing_policy_id;
        
        RAISE NOTICE 'Created default matching policy from rides.dispatch_settings: %', existing_policy_id;
      ELSE
        -- No rides settings, create with defaults
        INSERT INTO matching.policies (name, is_default)
        VALUES ('default', TRUE)
        RETURNING id INTO existing_policy_id;
        
        RAISE NOTICE 'Created default matching policy with defaults: %', existing_policy_id;
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        -- rides.dispatch_settings doesn't exist, create with defaults
        INSERT INTO matching.policies (name, is_default)
        VALUES ('default', TRUE)
        RETURNING id INTO existing_policy_id;
        
        RAISE NOTICE 'Created default matching policy (rides schema not found): %', existing_policy_id;
    END;
    
    -- Create product profile for rides
    INSERT INTO matching.product_profiles (product_key, surface_key, policy_id)
    VALUES ('rides', 'default', existing_policy_id)
    ON CONFLICT (product_key, surface_key) DO NOTHING;
    
    RAISE NOTICE 'Created rides product profile linked to policy: %', existing_policy_id;
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 6. Row Level Security
--------------------------------------------------------------------------------

ALTER TABLE matching.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching.product_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching.audit_events ENABLE ROW LEVEL SECURITY;

-- Policies: service_role full access, authenticated read-only for active
DROP POLICY IF EXISTS matching_policies_service ON matching.policies;
CREATE POLICY matching_policies_service ON matching.policies
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS matching_policies_read ON matching.policies;
CREATE POLICY matching_policies_read ON matching.policies
  FOR SELECT TO authenticated USING (TRUE);

-- Product profiles: service_role full, authenticated read active
DROP POLICY IF EXISTS matching_profiles_service ON matching.product_profiles;
CREATE POLICY matching_profiles_service ON matching.product_profiles
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS matching_profiles_read ON matching.product_profiles;
CREATE POLICY matching_profiles_read ON matching.product_profiles
  FOR SELECT TO authenticated USING (is_active = TRUE);

-- Audit: service_role full, authenticated no access (internal)
DROP POLICY IF EXISTS matching_audit_service ON matching.audit_events;
CREATE POLICY matching_audit_service ON matching.audit_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

--------------------------------------------------------------------------------
-- 7. Public views for PostgREST access (when matching schema not exposed)
--------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.matching_policies;
CREATE OR REPLACE VIEW public.matching_policies AS
  SELECT * FROM matching.policies;

DROP VIEW IF EXISTS public.matching_product_profiles;
CREATE OR REPLACE VIEW public.matching_product_profiles AS
  SELECT * FROM matching.product_profiles WHERE is_active = TRUE;

GRANT SELECT ON public.matching_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matching_policies TO service_role;

GRANT SELECT ON public.matching_product_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matching_product_profiles TO service_role;

--------------------------------------------------------------------------------
-- 8. Grants
--------------------------------------------------------------------------------

GRANT SELECT ON matching.policies TO authenticated;
GRANT SELECT ON matching.product_profiles TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA matching TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA matching TO service_role;

--------------------------------------------------------------------------------
-- 9. Updated_at trigger
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION matching.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_matching_policies_updated_at ON matching.policies;
CREATE TRIGGER update_matching_policies_updated_at
  BEFORE UPDATE ON matching.policies
  FOR EACH ROW EXECUTE FUNCTION matching.update_updated_at();

DROP TRIGGER IF EXISTS update_matching_profiles_updated_at ON matching.product_profiles;
CREATE TRIGGER update_matching_profiles_updated_at
  BEFORE UPDATE ON matching.product_profiles
  FOR EACH ROW EXECUTE FUNCTION matching.update_updated_at();

NOTIFY pgrst, 'reload schema';
