-- Migration: Driver Profiles for Hybrid Driver Architecture
-- Supports both fleet-affiliated and independent drivers

-- Create driver_profiles table
CREATE TABLE IF NOT EXISTS public.driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('fleet', 'independent')),
  
  -- Fleet affiliation (nullable for independent drivers)
  fleet_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  fleet_joined_at TIMESTAMPTZ,
  fleet_role TEXT CHECK (fleet_role IN ('driver', 'lead_driver', 'trainer')),
  
  -- Independent driver fields
  vehicle_ownership TEXT CHECK (vehicle_ownership IN ('owned', 'rented', 'financed', 'leased')),
  insurance_provider TEXT,
  insurance_policy_number TEXT,
  insurance_expiry DATE,
  business_license_number TEXT,
  tax_id TEXT,
  
  -- Common fields
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'suspended', 'deactivated')),
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step TEXT,
  
  -- Profile metadata
  display_name TEXT,
  phone TEXT,
  profile_photo_url TEXT,
  background_check_status TEXT CHECK (background_check_status IN ('pending', 'approved', 'rejected', 'expired')),
  background_check_date DATE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Create platform connections table for OAuth integrations
CREATE TABLE IF NOT EXISTS public.driver_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('uber', 'lyft', 'bolt', 'indrive', 'doordash', 'grubhub', 'instacart', 'other')),
  external_driver_id TEXT,
  connection_status TEXT NOT NULL DEFAULT 'pending' CHECK (connection_status IN ('pending', 'connected', 'disconnected', 'error', 'revoked')),
  
  -- OAuth tokens (encrypted at application level)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Sync metadata
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  
  -- Platform-specific data
  platform_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(driver_profile_id, platform)
);

-- Create driver vehicles table for independent drivers
CREATE TABLE IF NOT EXISTS public.driver_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  
  -- Vehicle info
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 1990 AND year <= 2100),
  color TEXT,
  license_plate TEXT NOT NULL,
  vin TEXT,
  
  -- Ownership
  ownership_type TEXT NOT NULL CHECK (ownership_type IN ('owned', 'rented', 'financed', 'leased')),
  lease_end_date DATE,
  
  -- Registration and insurance
  registration_state TEXT,
  registration_expiry DATE,
  insurance_policy_number TEXT,
  insurance_expiry DATE,
  
  -- Vehicle status
  is_primary BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'decommissioned')),
  
  -- Platform approvals
  uber_approved BOOLEAN DEFAULT FALSE,
  lyft_approved BOOLEAN DEFAULT FALSE,
  bolt_approved BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  vehicle_photo_url TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON public.driver_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_fleet_id ON public.driver_profiles(fleet_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_mode ON public.driver_profiles(mode);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_status ON public.driver_profiles(status);

CREATE INDEX IF NOT EXISTS idx_driver_platform_connections_profile ON public.driver_platform_connections(driver_profile_id);
CREATE INDEX IF NOT EXISTS idx_driver_platform_connections_platform ON public.driver_platform_connections(platform);

CREATE INDEX IF NOT EXISTS idx_driver_vehicles_profile ON public.driver_vehicles(driver_profile_id);
CREATE INDEX IF NOT EXISTS idx_driver_vehicles_plate ON public.driver_vehicles(license_plate);

-- Enable Row Level Security
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_vehicles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_profiles
CREATE POLICY "Drivers can view own profile"
  ON public.driver_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Drivers can update own profile"
  ON public.driver_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Fleet admins can view fleet drivers"
  ON public.driver_profiles FOR SELECT
  USING (
    fleet_id IN (
      SELECT id FROM public.organizations 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to profiles"
  ON public.driver_profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for driver_platform_connections
CREATE POLICY "Drivers can view own connections"
  ON public.driver_platform_connections FOR SELECT
  USING (
    driver_profile_id IN (
      SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Drivers can manage own connections"
  ON public.driver_platform_connections FOR ALL
  USING (
    driver_profile_id IN (
      SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to connections"
  ON public.driver_platform_connections FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for driver_vehicles
CREATE POLICY "Drivers can view own vehicles"
  ON public.driver_vehicles FOR SELECT
  USING (
    driver_profile_id IN (
      SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Drivers can manage own vehicles"
  ON public.driver_vehicles FOR ALL
  USING (
    driver_profile_id IN (
      SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to vehicles"
  ON public.driver_vehicles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT ALL ON public.driver_profiles TO authenticated;
GRANT ALL ON public.driver_platform_connections TO authenticated;
GRANT ALL ON public.driver_vehicles TO authenticated;

GRANT ALL ON public.driver_profiles TO service_role;
GRANT ALL ON public.driver_platform_connections TO service_role;
GRANT ALL ON public.driver_vehicles TO service_role;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_driver_profiles_updated_at ON public.driver_profiles;
CREATE TRIGGER update_driver_profiles_updated_at
  BEFORE UPDATE ON public.driver_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_platform_connections_updated_at ON public.driver_platform_connections;
CREATE TRIGGER update_driver_platform_connections_updated_at
  BEFORE UPDATE ON public.driver_platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_vehicles_updated_at ON public.driver_vehicles;
CREATE TRIGGER update_driver_vehicles_updated_at
  BEFORE UPDATE ON public.driver_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
