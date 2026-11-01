-- chunk 1
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS fleet.inv_settings (
  organization_id text PRIMARY KEY,
  fleet_support_phone text,
  safety_notice_text text,
  monthly_procurement_cap_jmd numeric(14, 2),
  fiscal_year_start_month smallint NOT NULL DEFAULT 4
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  approval_threshold_jmd numeric(14, 2) NOT NULL DEFAULT 20000,
  approval_rule_code text,
  approval_rule_name text,
  write_off_rule_code text,
  scrap_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet.inv_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  parent_id uuid REFERENCES fleet.inv_category (id) ON DELETE SET NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_category_org_idx ON fleet.inv_category (organization_id, sort_order);

CREATE TABLE IF NOT EXISTS fleet.inv_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  sku text NOT NULL,
  short_code text,
  name text NOT NULL,
  description text,
  model text,
  category_id uuid REFERENCES fleet.inv_category (id) ON DELETE SET NULL,
  tracking text NOT NULL DEFAULT 'quantity'
    CHECK (tracking IN ('quantity', 'serial')),
  uom text NOT NULL DEFAULT 'ea',
  part_master_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  universal_part_id uuid,
  default_vendor_id uuid,
  default_unit_cost numeric(14, 2),
  warranty_months integer,
  warranty_type text,
  inspection_interval_days integer,
  inspection_kind text,
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text,
  photo_path text,
  lifecycle text,
  superseded_by_item_id uuid REFERENCES fleet.inv_item (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inv_item_one_catalog_target CHECK (
    NOT (part_master_id IS NOT NULL AND universal_part_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_item_org_sku_uidx ON fleet.inv_item (organization_id, lower(sku));
CREATE INDEX IF NOT EXISTS inv_item_org_part_idx ON fleet.inv_item (organization_id, part_master_id)
  WHERE part_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inv_item_org_universal_idx ON fleet.inv_item (organization_id, universal_part_id)
  WHERE universal_part_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fleet.inv_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('warehouse', 'vehicle', 'person', 'virtual')),
  region_code text,
  vehicle_id text REFERENCES fleet.vehicles (id) ON DELETE SET NULL,
  user_id uuid,
  address text,
  lat double precision,
  lng double precision,
  photo_path text,
  is_default boolean NOT NULL DEFAULT false,
  is_secure boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_location_org_code_uidx ON fleet.inv_location (organization_id, lower(code));

CREATE TABLE IF NOT EXISTS fleet.inv_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE CASCADE,
  code text NOT NULL,
  zone text,
  capacity_units numeric(14, 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_bin_location_code_uidx ON fleet.inv_bin (location_id, lower(code));

CREATE TABLE IF NOT EXISTS fleet.inv_vendor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  name text NOT NULL,
  phone text,
  description text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  dominion_supplier_id uuid REFERENCES public.supplier (id) ON DELETE SET NULL,
  lead_time_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_vendor_org_idx ON fleet.inv_vendor (organization_id, is_active);

CREATE TABLE IF NOT EXISTS fleet.inv_reorder_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE CASCADE,
  reorder_point numeric(14, 3) NOT NULL DEFAULT 0,
  reorder_qty numeric(14, 3) NOT NULL DEFAULT 0,
  safety_stock numeric(14, 3) NOT NULL DEFAULT 0,
  preferred_vendor_id uuid REFERENCES fleet.inv_vendor (id) ON DELETE SET NULL,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, item_id, location_id)
);

CREATE TABLE IF NOT EXISTS fleet.inv_scan_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('rfid_gate', 'handheld', 'usb', 'phone')),
  location_id uuid REFERENCES fleet.inv_location (id) ON DELETE SET NULL,
  pairing_code text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  reads_ok bigint NOT NULL DEFAULT 0,
  reads_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
