-- Master mailbox courier companies (Enterprise Admin → Courier → Companies).

CREATE TABLE IF NOT EXISTS public.intake_courier_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'US',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_intake_courier_catalog_status
  ON public.intake_courier_catalog (status, name);

COMMENT ON TABLE public.intake_courier_catalog IS
  'Master mailbox courier companies; managed in Roam Enterprise Admin under Courier → Companies.';

ALTER TABLE public.intake_courier_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intake_courier_catalog_no_direct_access" ON public.intake_courier_catalog;
CREATE POLICY "intake_courier_catalog_no_direct_access"
  ON public.intake_courier_catalog FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Seed known Jamaican mailbox courier (was previously only a FF subleaser note).
INSERT INTO public.intake_courier_catalog (
  name, code, address_line, city, state, postal_code, country_code, timezone, status
) VALUES (
  'BShip''D Couriers',
  'BSHIPD',
  'Kingston',
  'Kingston',
  '',
  'JM',
  'JM',
  'America/Jamaica',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  address_line = EXCLUDED.address_line,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  postal_code = EXCLUDED.postal_code,
  country_code = EXCLUDED.country_code,
  timezone = EXCLUDED.timezone,
  status = EXCLUDED.status,
  updated_at = now();
