-- Self-service driver profile creation (phone sign-up) + extra onboarding fields

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));

CREATE POLICY "Drivers can insert own independent profile"
  ON public.driver_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND mode = 'independent'
    AND (fleet_id IS NULL)
  );
