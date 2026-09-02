-- Prerequisite: organizations table must exist before driver_profiles (FK + RLS).
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  product_line TEXT NOT NULL DEFAULT 'fleet'
    CHECK (product_line IN ('fleet', 'enterprise')),
  business_type TEXT
    CHECK (business_type IN ('rideshare', 'delivery', 'taxi', 'trucking', 'shipping', 'other')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending_approval', 'deactivated')),
  contact_email TEXT,
  contact_phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  billing_email TEXT,
  stripe_customer_id TEXT,
  subscription_tier TEXT DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_product_line ON public.organizations(product_line);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug) WHERE slug IS NOT NULL;
