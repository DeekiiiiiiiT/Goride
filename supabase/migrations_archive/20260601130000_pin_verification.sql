-- PIN Verification System
-- Adds support for verifying rider identity before trip start via 4-digit PIN

-- Add PIN columns to ride_requests
ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS verification_pin CHAR(4),
  ADD COLUMN IF NOT EXISTS pin_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN rides.ride_requests.verification_pin IS 
  'Generated 4-digit PIN for rider verification at trip start';
COMMENT ON COLUMN rides.ride_requests.pin_verified_at IS 
  'Timestamp when driver verified the PIN';

-- Add PIN settings to dispatch_settings
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS pin_verification_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pin_verification_required_for_start BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rides.dispatch_settings.pin_verification_enabled IS 
  'Enable PIN generation and display for rides (feature flag)';
COMMENT ON COLUMN rides.dispatch_settings.pin_verification_required_for_start IS 
  'When enabled, driver cannot start trip without entering correct PIN';

-- Update the public view
DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

NOTIFY pgrst, 'reload schema';
