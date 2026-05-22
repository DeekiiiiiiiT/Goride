-- Run in Supabase Dashboard → SQL Editor if onboarding fails with:
-- "Could not find the 'date_of_birth' column of 'driver_profiles' in the schema cache"

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));

-- Refresh PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';
