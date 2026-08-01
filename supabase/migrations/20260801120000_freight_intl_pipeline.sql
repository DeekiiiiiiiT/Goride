-- Jamaica international mailbox freight pipeline (Enterprise Path B extension)
-- Packages / suites / manifests / customs / hub / mixed-fleet fulfillment
-- RLS: org-owned select; writes via service role (edge)

-- ---------------------------------------------------------------------------
-- facilities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  facility_type TEXT NOT NULL
    CHECK (facility_type IN ('miami_warehouse', 'ja_hub', 'branch')),
  address_line TEXT,
  city TEXT,
  country_code TEXT NOT NULL DEFAULT 'JM',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  timezone TEXT NOT NULL DEFAULT 'America/Jamaica',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_freight_facilities_org
  ON freight.facilities (organization_id, facility_type, status);

-- ---------------------------------------------------------------------------
-- suites (US mailbox codes for end customers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES freight.clients(id) ON DELETE SET NULL,
  suite_code TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  trn TEXT,
  default_fulfillment_mode TEXT NOT NULL DEFAULT 'pickup'
    CHECK (default_fulfillment_mode IN ('pickup', 'door_delivery')),
  default_assignee_type TEXT NOT NULL DEFAULT 'org_fleet'
    CHECK (default_assignee_type IN (
      'roam_marketplace', 'org_fleet', 'client_fleet', 'third_party'
    )),
  default_pickup_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, suite_code)
);

CREATE INDEX IF NOT EXISTS idx_freight_suites_org
  ON freight.suites (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_freight_suites_client
  ON freight.suites (client_id);

-- ---------------------------------------------------------------------------
-- packages (parcel custody unit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  suite_id UUID REFERENCES freight.suites(id) ON DELETE SET NULL,
  client_id UUID REFERENCES freight.clients(id) ON DELETE SET NULL,
  courier_tracking_number TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'expected'
    CHECK (status IN (
      'expected', 'received_miami', 'manifested', 'in_transit_intl',
      'customs_hold', 'customs_cleared', 'received_hub', 'ready_for_fulfillment',
      'out_for_delivery', 'awaiting_pickup', 'delivered', 'collected', 'exception'
    )),
  weight_lbs NUMERIC(12, 3),
  length_in NUMERIC(12, 2),
  width_in NUMERIC(12, 2),
  height_in NUMERIC(12, 2),
  declared_value_usd_minor BIGINT,
  invoice_storage_path TEXT,
  invoice_file_name TEXT,
  current_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  sort_zone TEXT,
  fulfillment_mode TEXT
    CHECK (fulfillment_mode IS NULL OR fulfillment_mode IN ('pickup', 'door_delivery')),
  preferred_assignee_type TEXT
    CHECK (preferred_assignee_type IS NULL OR preferred_assignee_type IN (
      'roam_marketplace', 'org_fleet', 'client_fleet', 'third_party'
    )),
  pickup_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  manifest_id UUID,
  notes TEXT,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_packages_org_tracking
  ON freight.packages (organization_id, courier_tracking_number)
  WHERE courier_tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_freight_packages_org_status
  ON freight.packages (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_packages_suite
  ON freight.packages (suite_id);
CREATE INDEX IF NOT EXISTS idx_freight_packages_manifest
  ON freight.packages (manifest_id);

-- ---------------------------------------------------------------------------
-- package_scan_events (custody spine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.package_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES freight.packages(id) ON DELETE CASCADE,
  facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'pre_alert', 'received_miami', 'manifested', 'shipped', 'arrived_ja',
      'customs_hold', 'customs_cleared', 'hub_inbound', 'sorted',
      'ready_fulfillment', 'loaded_vehicle', 'out_for_delivery',
      'delivered', 'picked_up', 'exception', 'note'
    )),
  barcode TEXT,
  note TEXT,
  actor_user_id UUID,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_scan_idem
  ON freight.package_scan_events (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_freight_scan_package
  ON freight.package_scan_events (package_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- manifests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manifest_number TEXT NOT NULL,
  carrier_name TEXT,
  shipment_type TEXT NOT NULL DEFAULT 'air'
    CHECK (shipment_type IN ('air', 'sea')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'sealed', 'shipped', 'arrived_ja', 'cleared')),
  origin_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  destination_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  awb_or_bl TEXT,
  estimated_arrival TIMESTAMPTZ,
  sealed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, manifest_number)
);

CREATE INDEX IF NOT EXISTS idx_freight_manifests_org_status
  ON freight.manifests (organization_id, status, created_at DESC);

ALTER TABLE freight.packages
  DROP CONSTRAINT IF EXISTS freight_packages_manifest_id_fkey;
ALTER TABLE freight.packages
  ADD CONSTRAINT freight_packages_manifest_id_fkey
  FOREIGN KEY (manifest_id) REFERENCES freight.manifests(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS freight.manifest_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manifest_id UUID NOT NULL REFERENCES freight.manifests(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES freight.packages(id) ON DELETE CASCADE,
  line_number INT NOT NULL CHECK (line_number >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manifest_id, package_id),
  UNIQUE (manifest_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_freight_manifest_packages_pkg
  ON freight.manifest_packages (package_id);

-- ---------------------------------------------------------------------------
-- customs_cases (manual broker mirror — not live ASYCUDA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.customs_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manifest_id UUID NOT NULL REFERENCES freight.manifests(id) ON DELETE CASCADE,
  broker_ref TEXT,
  channel TEXT CHECK (channel IS NULL OR channel IN ('green', 'yellow', 'red')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'hold', 'cleared', 'released')),
  hold_reason TEXT,
  release_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, manifest_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_customs_org
  ON freight.customs_cases (organization_id, status);

-- ---------------------------------------------------------------------------
-- client_fleet_assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.client_fleet_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES freight.clients(id) ON DELETE CASCADE,
  driver_name TEXT NOT NULL,
  driver_phone TEXT,
  vehicle_plate TEXT,
  vehicle_label TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_client_fleet_org
  ON freight.client_fleet_assets (organization_id, client_id, status);

-- ---------------------------------------------------------------------------
-- fulfillment_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.fulfillment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES freight.packages(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('pickup', 'door_delivery')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  pickup_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  delivery_batch_id UUID,
  assignee_type TEXT
    CHECK (assignee_type IS NULL OR assignee_type IN (
      'roam_marketplace', 'org_fleet', 'client_fleet', 'third_party'
    )),
  assignee_driver_id UUID,
  assignee_vehicle_id UUID,
  client_fleet_asset_id UUID REFERENCES freight.client_fleet_assets(id) ON DELETE SET NULL,
  third_party_carrier_id UUID REFERENCES freight.carriers(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_fulfillment_org_status
  ON freight.fulfillment_orders (organization_id, status, mode);

-- ---------------------------------------------------------------------------
-- delivery_batches + stops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'offered', 'accepted', 'in_progress', 'completed', 'cancelled')),
  assignee_type TEXT NOT NULL
    CHECK (assignee_type IN (
      'roam_marketplace', 'org_fleet', 'client_fleet', 'third_party'
    )),
  assignee_driver_id UUID,
  assignee_vehicle_id UUID,
  client_fleet_asset_id UUID REFERENCES freight.client_fleet_assets(id) ON DELETE SET NULL,
  third_party_carrier_id UUID REFERENCES freight.carriers(id) ON DELETE SET NULL,
  hub_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  pod_token TEXT UNIQUE,
  pod_token_expires_at TIMESTAMPTZ,
  offered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_freight_batches_org_status
  ON freight.delivery_batches (organization_id, status);

ALTER TABLE freight.fulfillment_orders
  DROP CONSTRAINT IF EXISTS freight_fulfillment_orders_delivery_batch_id_fkey;
ALTER TABLE freight.fulfillment_orders
  ADD CONSTRAINT freight_fulfillment_orders_delivery_batch_id_fkey
  FOREIGN KEY (delivery_batch_id) REFERENCES freight.delivery_batches(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS freight.delivery_batch_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES freight.delivery_batches(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES freight.packages(id) ON DELETE CASCADE,
  stop_order INT NOT NULL CHECK (stop_order >= 1),
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'loaded', 'delivered', 'failed', 'skipped')),
  delivered_at TIMESTAMPTZ,
  pod_note TEXT,
  pod_photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, package_id),
  UNIQUE (batch_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_freight_batch_stops_pkg
  ON freight.delivery_batch_stops (package_id);

-- ---------------------------------------------------------------------------
-- Extend documents.kind for package invoices (nullable shipment for package docs)
-- ---------------------------------------------------------------------------
ALTER TABLE freight.documents DROP CONSTRAINT IF EXISTS documents_kind_check;
ALTER TABLE freight.documents
  ADD CONSTRAINT documents_kind_check
  CHECK (kind IN ('bol', 'pod', 'invoice', 'packing_list', 'customs_export', 'other'));

ALTER TABLE freight.documents
  ALTER COLUMN shipment_id DROP NOT NULL;

ALTER TABLE freight.documents
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES freight.packages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_freight_documents_package
  ON freight.documents (package_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'facilities', 'suites', 'packages', 'package_scan_events',
    'manifests', 'manifest_packages', 'customs_cases',
    'client_fleet_assets', 'fulfillment_orders',
    'delivery_batches', 'delivery_batch_stops'
  ]
  LOOP
    EXECUTE format('ALTER TABLE freight.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS freight_%s_select ON freight.%I', t, t);
    EXECUTE format(
      $pol$
      CREATE POLICY freight_%s_select ON freight.%I
        FOR SELECT TO authenticated
        USING (freight.user_owns_org(organization_id))
      $pol$,
      t, t
    );

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
