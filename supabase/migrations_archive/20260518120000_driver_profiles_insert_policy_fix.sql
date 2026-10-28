-- Allow any authenticated user to create their own driver_profiles row (fleet or independent).
-- The previous policy only allowed mode = 'independent', which blocked fleet onboarding saves.

DROP POLICY IF EXISTS "Drivers can insert own independent profile" ON public.driver_profiles;

CREATE POLICY "Drivers can insert own profile"
  ON public.driver_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
