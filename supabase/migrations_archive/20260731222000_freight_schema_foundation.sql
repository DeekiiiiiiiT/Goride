-- Freight Forwarding schema (Enterprise Path B) — RLS-only tenancy, no customs
CREATE SCHEMA IF NOT EXISTS freight;

GRANT USAGE ON SCHEMA freight TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- carriers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_own_fleet BOOLEAN NOT NULL DEFAULT false,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  capacity_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_carriers_org
  ON freight.carriers (organization_id, status);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_clients_org
  ON freight.clients (organization_id, status);

-- ---------------------------------------------------------------------------
-- rate_cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES freight.clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  origin_label TEXT,
  destination_label TEXT,
  currency TEXT NOT NULL DEFAULT 'JMD',
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  effective_from DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_rate_cards_org
  ON freight.rate_cards (organization_id, status);

-- ---------------------------------------------------------------------------
-- shipments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES freight.clients(id) ON DELETE SET NULL,
  rate_card_id UUID REFERENCES freight.rate_cards(id) ON DELETE SET NULL,
  reference_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'booked', 'in_transit', 'out_for_delivery',
      'delivered', 'cancelled', 'exception'
    )),
  mode TEXT NOT NULL DEFAULT 'own'
    CHECK (mode IN ('own', '3pl', 'mixed')),
  origin_label TEXT NOT NULL,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_label TEXT NOT NULL,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'JMD',
  billed_at TIMESTAMPTZ,
  billed_entry_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reference_code)
);

CREATE INDEX IF NOT EXISTS idx_freight_shipments_org_status
  ON freight.shipments (organization_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- shipment_legs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.shipment_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES freight.shipments(id) ON DELETE CASCADE,
  sequence INT NOT NULL CHECK (sequence >= 1),
  carrier_id UUID REFERENCES freight.carriers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'assigned', 'in_transit', 'completed', 'cancelled', 'exception'
    )),
  planned_pickup_at TIMESTAMPTZ,
  planned_delivery_at TIMESTAMPTZ,
  actual_pickup_at TIMESTAMPTZ,
  actual_delivery_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_freight_legs_shipment
  ON freight.shipment_legs (shipment_id, sequence);

-- ---------------------------------------------------------------------------
-- consignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.consignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES freight.shipments(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  weight_kg NUMERIC(12, 3),
  length_cm NUMERIC(12, 2),
  width_cm NUMERIC(12, 2),
  height_cm NUMERIC(12, 2),
  declared_value_minor BIGINT,
  currency TEXT NOT NULL DEFAULT 'JMD',
  hazmat BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_consignments_shipment
  ON freight.consignments (shipment_id);

-- ---------------------------------------------------------------------------
-- tracking_events (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES freight.shipments(id) ON DELETE CASCADE,
  leg_id UUID REFERENCES freight.shipment_legs(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  note TEXT,
  actor_user_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_tracking_shipment
  ON freight.tracking_events (shipment_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- documents (POD/BOL metadata — no customs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES freight.shipments(id) ON DELETE CASCADE,
  leg_id UUID REFERENCES freight.shipment_legs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bol', 'pod', 'invoice', 'other')),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_documents_shipment
  ON freight.documents (shipment_id);

-- ---------------------------------------------------------------------------
-- RLS (Wave-2 style: no organization_id IS NULL leak)
-- ---------------------------------------------------------------------------
ALTER TABLE freight.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.shipment_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION freight.user_owns_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_org_id AND o.owner_id = auth.uid()
  )
  OR public.rbac_is_platform_user(auth.uid());
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'carriers', 'clients', 'rate_cards', 'shipments',
    'shipment_legs', 'consignments', 'tracking_events', 'documents'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS freight_%s_select ON freight.%I',
      t, t
    );
    EXECUTE format(
      $pol$
      CREATE POLICY freight_%s_select ON freight.%I
        FOR SELECT TO authenticated
        USING (freight.user_owns_org(organization_id))
      $pol$,
      t, t
    );
  END LOOP;
END $$;

-- Direct writes blocked for authenticated — edge uses service role
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'carriers', 'clients', 'rate_cards', 'shipments',
    'shipment_legs', 'consignments', 'tracking_events', 'documents'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS freight_%s_no_direct_write ON freight.%I', t, t);
    EXECUTE format(
      'CREATE POLICY freight_%s_no_direct_write ON freight.%I FOR INSERT TO authenticated WITH CHECK (false)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS freight_%s_no_update ON freight.%I', t, t);
    EXECUTE format(
      'CREATE POLICY freight_%s_no_update ON freight.%I FOR UPDATE TO authenticated USING (false)',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS freight_%s_no_delete ON freight.%I', t, t);
    EXECUTE format(
      'CREATE POLICY freight_%s_no_delete ON freight.%I FOR DELETE TO authenticated USING (false)',
      t, t
    );
  END LOOP;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA freight TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA freight TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA freight TO service_role;

-- Storage bucket for freight docs (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'enterprise-freight-docs',
  'enterprise-freight-docs',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;
