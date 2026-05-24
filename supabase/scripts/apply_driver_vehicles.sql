-- Create driver_vehicles if missing (from driver_profiles migration) + body_type for dispatch.

CREATE TABLE IF NOT EXISTS public.driver_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 1990 AND year <= 2100),
  color TEXT,
  license_plate TEXT NOT NULL,
  vin TEXT,
  ownership_type TEXT NOT NULL CHECK (ownership_type IN ('owned', 'rented', 'financed', 'leased')),
  lease_end_date DATE,
  registration_state TEXT,
  registration_expiry DATE,
  insurance_policy_number TEXT,
  insurance_expiry DATE,
  is_primary BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'decommissioned')),
  uber_approved BOOLEAN DEFAULT FALSE,
  lyft_approved BOOLEAN DEFAULT FALSE,
  bolt_approved BOOLEAN DEFAULT FALSE,
  vehicle_photo_url TEXT,
  notes TEXT,
  body_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.driver_vehicles
  ADD COLUMN IF NOT EXISTS body_type TEXT;

CREATE INDEX IF NOT EXISTS idx_driver_vehicles_profile ON public.driver_vehicles(driver_profile_id);

ALTER TABLE public.driver_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view own vehicles" ON public.driver_vehicles;
CREATE POLICY "Drivers can view own vehicles"
  ON public.driver_vehicles FOR SELECT
  USING (
    driver_profile_id IN (
      SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Drivers can manage own vehicles" ON public.driver_vehicles;
CREATE POLICY "Drivers can manage own vehicles"
  ON public.driver_vehicles FOR ALL
  USING (
    driver_profile_id IN (
      SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role has full access to vehicles" ON public.driver_vehicles;
CREATE POLICY "Service role has full access to vehicles"
  ON public.driver_vehicles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON public.driver_vehicles TO authenticated;
GRANT ALL ON public.driver_vehicles TO service_role;

NOTIFY pgrst, 'reload schema';
