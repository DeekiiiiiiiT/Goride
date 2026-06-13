-- Migration: Organizations Table for Multi-Tenancy
-- Phase 6 of Fleet Data Isolation Implementation
-- 
-- This table provides proper organization/tenant isolation for fleet owners.
-- Each fleet owner has an organization record that their drivers, trips,
-- and other data are associated with.

-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner is typically the fleet_owner user who created/owns this org
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Organization details
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  
  -- Product line determines which app this org belongs to
  -- 'fleet' = Roam Fleet (rideshare fleet management)
  -- 'enterprise' = Roam Enterprise (multi-vertical business)
  product_line TEXT NOT NULL DEFAULT 'fleet' 
    CHECK (product_line IN ('fleet', 'enterprise')),
  
  -- Business type for enterprise customers
  business_type TEXT 
    CHECK (business_type IN ('rideshare', 'delivery', 'taxi', 'trucking', 'shipping', 'other')),
  
  -- Organization status
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'suspended', 'pending_approval', 'deactivated')),
  
  -- Contact information
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Address (for legal/billing)
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  
  -- Billing/subscription info (future use)
  billing_email TEXT,
  stripe_customer_id TEXT,
  subscription_tier TEXT DEFAULT 'free' 
    CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_product_line ON public.organizations(product_line);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug) WHERE slug IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Owners can view their own organization
CREATE POLICY "Owners can view own organization"
  ON public.organizations FOR SELECT
  USING (owner_id = auth.uid());

-- Owners can update their own organization
CREATE POLICY "Owners can update own organization"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid());

-- Fleet members can view their organization (via driver_profiles.fleet_id)
CREATE POLICY "Fleet members can view their organization"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT fleet_id FROM public.driver_profiles 
      WHERE user_id = auth.uid() AND fleet_id IS NOT NULL
    )
  );

-- Platform staff can view all organizations
CREATE POLICY "Platform staff can view all organizations"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (
        auth.users.raw_app_meta_data->>'role' IN ('superadmin', 'platform_owner', 'platform_support', 'platform_analyst')
        OR auth.users.raw_user_meta_data->>'role' IN ('superadmin', 'platform_owner', 'platform_support', 'platform_analyst')
      )
    )
  );

-- Platform owners can manage all organizations
CREATE POLICY "Platform owners can manage all organizations"
  ON public.organizations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (
        auth.users.raw_app_meta_data->>'role' IN ('superadmin', 'platform_owner')
        OR auth.users.raw_user_meta_data->>'role' IN ('superadmin', 'platform_owner')
      )
    )
  );

-- Service role has full access
CREATE POLICY "Service role has full access to organizations"
  ON public.organizations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT ALL ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

-- Create updated_at trigger
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create organization for new fleet owners
CREATE OR REPLACE FUNCTION public.auto_create_organization_for_fleet_owner()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  user_product_line TEXT;
  org_name TEXT;
BEGIN
  -- Get the user's role from metadata
  user_role := COALESCE(
    NEW.raw_app_meta_data->>'role',
    NEW.raw_user_meta_data->>'role',
    'viewer'
  );
  
  -- Only create organization for admin/fleet_owner roles
  IF user_role NOT IN ('admin', 'fleet_owner') THEN
    RETURN NEW;
  END IF;
  
  -- Check if organization already exists for this user
  IF EXISTS (SELECT 1 FROM public.organizations WHERE owner_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  
  -- Determine product line from user metadata
  user_product_line := COALESCE(
    NEW.raw_user_meta_data->>'productLine',
    CASE WHEN NEW.raw_user_meta_data->>'businessType' = 'rideshare' THEN 'fleet' ELSE 'enterprise' END,
    'fleet'
  );
  
  -- Create organization name from user email/name
  org_name := COALESCE(
    NEW.raw_user_meta_data->>'fleetName',
    NEW.raw_user_meta_data->>'companyName',
    CONCAT(SPLIT_PART(NEW.email, '@', 1), '''s Fleet')
  );
  
  -- Create the organization
  INSERT INTO public.organizations (
    id,
    owner_id,
    name,
    product_line,
    business_type,
    contact_email,
    status
  ) VALUES (
    NEW.id,  -- Use user's ID as org ID for legacy compatibility
    NEW.id,
    org_name,
    user_product_line,
    COALESCE(NEW.raw_user_meta_data->>'businessType', 'rideshare'),
    NEW.email,
    'active'
  );
  
  -- Also update user's metadata with organizationId
  UPDATE auth.users 
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('organizationId', NEW.id)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-creating organizations (only for new users)
-- Note: This trigger fires after INSERT to allow the user to be created first
DROP TRIGGER IF EXISTS auto_create_org_on_fleet_owner_signup ON auth.users;
CREATE TRIGGER auto_create_org_on_fleet_owner_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_organization_for_fleet_owner();
