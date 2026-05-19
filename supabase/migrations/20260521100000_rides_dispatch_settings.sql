-- Global dispatch/matching settings (singleton row, admin-editable via Control Panel).

CREATE TABLE IF NOT EXISTS rides.dispatch_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_match_waves INTEGER NOT NULL DEFAULT 3 CHECK (max_match_waves BETWEEN 1 AND 5),
  wave_radius_km NUMERIC[] NOT NULL DEFAULT '{5,15,35}',
  max_offers_per_wave INTEGER NOT NULL DEFAULT 8 CHECK (max_offers_per_wave BETWEEN 1 AND 20),
  default_driver_offer_timeout_seconds INTEGER NOT NULL DEFAULT 15
    CHECK (default_driver_offer_timeout_seconds BETWEEN 5 AND 120),
  driver_location_max_age_minutes INTEGER NOT NULL DEFAULT 10
    CHECK (driver_location_max_age_minutes BETWEEN 1 AND 30),
  quote_driver_radius_km NUMERIC NOT NULL DEFAULT 15
    CHECK (quote_driver_radius_km > 0 AND quote_driver_radius_km <= 50),
  body_type_filtering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  body_type_tier_mode TEXT NOT NULL DEFAULT 'expand'
    CHECK (body_type_tier_mode IN ('expand', 'strict')),
  require_body_type_for_offers BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

COMMENT ON TABLE rides.dispatch_settings IS 'Singleton global dispatch knobs (Control Panel).';

INSERT INTO rides.dispatch_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE rides.dispatch_settings ENABLE ROW LEVEL SECURITY;

DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE OR REPLACE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

NOTIFY pgrst, 'reload schema';
