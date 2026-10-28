-- Platform master: Florida US intake warehouse lease holders (Dominion-managed).
-- Enterprise tenants link freight.facilities (miami_warehouse) to these rows.

CREATE TABLE IF NOT EXISTS public.intake_warehouse_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'FL',
  postal_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'US',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  known_subleasers TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_intake_warehouse_catalog_status
  ON public.intake_warehouse_catalog (status, name);

COMMENT ON TABLE public.intake_warehouse_catalog IS
  'Master Florida warehouse lease holders; Enterprise orgs pick these for US intake.';

ALTER TABLE public.intake_warehouse_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intake_warehouse_catalog_no_direct_access" ON public.intake_warehouse_catalog;
CREATE POLICY "intake_warehouse_catalog_no_direct_access"
  ON public.intake_warehouse_catalog FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Org facilities may reference a catalog row when type = miami_warehouse
ALTER TABLE freight.facilities
  ADD COLUMN IF NOT EXISTS intake_catalog_id UUID
    REFERENCES public.intake_warehouse_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_freight_facilities_intake_catalog
  ON freight.facilities (intake_catalog_id)
  WHERE intake_catalog_id IS NOT NULL;

-- Seed known Jamaican-export Florida terminals
INSERT INTO public.intake_warehouse_catalog (
  name, code, address_line, city, state, postal_code, country_code, known_subleasers, status
) VALUES
  (
    'Complete Sourcing USA',
    'COMPLETE_SOURCING',
    '1807 SW 31st Ave',
    'Hallandale Beach',
    'FL',
    '33009',
    'US',
    'Complete Sourcing, BShip''D Couriers, Sueños Shipping',
    'active'
  ),
  (
    'Reliable Courier Jamaica',
    'RELIABLE_COURIER',
    '10250 NW 89th Ave, STE 18',
    'Medley',
    'FL',
    '33178',
    'US',
    'Reliable Courier, Rocketship Courier Services',
    'active'
  ),
  (
    'MD Courier JA LLC',
    'MD_COURIER',
    '2900 NW 112th Ave, Unit E1',
    'Doral',
    'FL',
    '33172',
    'US',
    'MD Courier, Independent small-scale cargo agents',
    'active'
  ),
  (
    'All Things Ja Courier',
    'ALL_THINGS_JA',
    '8050 NW 66th St',
    'Miami',
    'FL',
    '33166',
    'US',
    'All Things Ja, Boutique barrel/e-commerce consolidators',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  address_line = EXCLUDED.address_line,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  postal_code = EXCLUDED.postal_code,
  known_subleasers = EXCLUDED.known_subleasers,
  updated_at = now();
