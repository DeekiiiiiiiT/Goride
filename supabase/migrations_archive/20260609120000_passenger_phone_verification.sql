-- Passenger phone verification: profile column + backfill from auth.users

ALTER TABLE rides.rider_profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL;

-- Copy auth phone into existing profile rows
UPDATE rides.rider_profiles rp
SET phone = u.phone,
    updated_at = NOW()
FROM auth.users u
WHERE rp.user_id = u.id
  AND rp.phone IS NULL
  AND u.phone IS NOT NULL
  AND trim(u.phone) <> '';

-- Create profile rows for passengers with auth phone but no profile
INSERT INTO rides.rider_profiles (user_id, phone, created_at, updated_at)
SELECT u.id, u.phone, NOW(), NOW()
FROM auth.users u
WHERE u.phone IS NOT NULL
  AND trim(u.phone) <> ''
  AND (
    u.raw_user_meta_data->>'role' = 'passenger'
    OR u.raw_user_meta_data->>'surface' = 'passenger'
  )
  AND NOT EXISTS (
    SELECT 1 FROM rides.rider_profiles rp WHERE rp.user_id = u.id
  )
ON CONFLICT (user_id) DO NOTHING;

-- Refresh public view (includes new column via SELECT *)
CREATE OR REPLACE VIEW public.rides_rider_profiles AS
  SELECT * FROM rides.rider_profiles;

GRANT SELECT, INSERT, UPDATE ON public.rides_rider_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
