-- Migration: Sync existing drivers to driver_profiles table
-- This creates driver_profiles records for existing drivers who have role='driver' in auth

-- Insert driver_profiles for existing drivers who don't have one yet
-- Uses auth.users metadata to determine fleet membership
INSERT INTO public.driver_profiles (user_id, mode, fleet_id, fleet_joined_at, status, onboarding_complete, display_name)
SELECT 
  u.id as user_id,
  CASE 
    WHEN (u.raw_user_meta_data->>'organizationId') IS NOT NULL 
    THEN 'fleet' 
    ELSE 'independent' 
  END as mode,
  CASE 
    WHEN (u.raw_user_meta_data->>'organizationId') IS NOT NULL 
    THEN (u.raw_user_meta_data->>'organizationId')::uuid 
    ELSE NULL 
  END as fleet_id,
  CASE 
    WHEN (u.raw_user_meta_data->>'organizationId') IS NOT NULL 
    THEN u.created_at 
    ELSE NULL 
  END as fleet_joined_at,
  'active' as status,
  TRUE as onboarding_complete,
  COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) as display_name
FROM auth.users u
WHERE 
  u.raw_user_meta_data->>'role' = 'driver'
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_profiles dp WHERE dp.user_id = u.id
  );

-- Log the sync
DO $$
DECLARE
  synced_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO synced_count FROM public.driver_profiles;
  RAISE NOTICE 'Synced % driver profiles total', synced_count;
END $$;
