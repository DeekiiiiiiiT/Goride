-- Wait Time Fee System
-- Adds support for charging riders when they make drivers wait beyond a grace period

-- Add wait time tracking columns to ride_requests
ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS wait_time_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wait_time_fee_minor BIGINT DEFAULT 0
    CHECK (wait_time_fee_minor >= 0);

COMMENT ON COLUMN rides.ride_requests.wait_time_started_at IS 
  'Timestamp when wait time billing started (after grace period expired)';
COMMENT ON COLUMN rides.ride_requests.wait_time_fee_minor IS 
  'Accumulated wait time fee in minor units (cents)';

-- Add wait time settings to dispatch_settings
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS wait_time_grace_minutes INTEGER NOT NULL DEFAULT 2
    CHECK (wait_time_grace_minutes BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS wait_time_rate_per_min_minor INTEGER NOT NULL DEFAULT 50
    CHECK (wait_time_rate_per_min_minor >= 0),
  ADD COLUMN IF NOT EXISTS wait_time_charge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wait_time_max_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (wait_time_max_minutes BETWEEN 1 AND 60);

COMMENT ON COLUMN rides.dispatch_settings.wait_time_grace_minutes IS 
  'Minutes after driver arrival before wait time charges begin (default 2)';
COMMENT ON COLUMN rides.dispatch_settings.wait_time_rate_per_min_minor IS 
  'Per-minute rate for wait time in minor units (default 50 JMD cents)';
COMMENT ON COLUMN rides.dispatch_settings.wait_time_charge_enabled IS 
  'Whether to charge riders for wait time (disabled by default for rollout)';
COMMENT ON COLUMN rides.dispatch_settings.wait_time_max_minutes IS 
  'Maximum wait time before system auto-cancels (default 15 minutes)';

-- Update the public view to include new columns
DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

NOTIFY pgrst, 'reload schema';
