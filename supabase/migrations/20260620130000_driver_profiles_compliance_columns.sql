-- Additive migration: compliance columns on driver_profiles
-- Safe when table was created before 20260513100000 or CREATE TABLE IF NOT EXISTS skipped column adds.

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
  ADD COLUMN IF NOT EXISTS background_check_status TEXT,
  ADD COLUMN IF NOT EXISTS background_check_date DATE;

-- Apply check constraint only when column is new (ignore if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'driver_profiles_background_check_status_check'
  ) THEN
    ALTER TABLE public.driver_profiles
      ADD CONSTRAINT driver_profiles_background_check_status_check
      CHECK (
        background_check_status IS NULL
        OR background_check_status IN ('pending', 'approved', 'rejected', 'expired')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.driver_profiles.background_check_status IS
  'Admin-managed background check state for driver activation';
COMMENT ON COLUMN public.driver_profiles.background_check_date IS
  'Date background check was marked approved';
COMMENT ON COLUMN public.driver_profiles.insurance_expiry IS
  'Insurance expiry date; required for independent driver strict approve';
