
CREATE TABLE IF NOT EXISTS fleet.kit_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  classification text CHECK (classification IN ('rideshare', 'delivery', 'executive')),
  applies_text text,
  body_type text,
  compliance_badge text,
  compliance_text text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kit_template_org_code_uidx ON fleet.kit_template (organization_id, lower(code));

CREATE TABLE IF NOT EXISTS fleet.kit_template_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  template_id uuid NOT NULL REFERENCES fleet.kit_template (id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_sync', 'production', 'archived')),
  change_note text,
  author uuid,
  revision_hash text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS fleet.kit_template_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  version_id uuid NOT NULL REFERENCES fleet.kit_template_version (id) ON DELETE CASCADE,
  line_type text NOT NULL DEFAULT 'item'
    CHECK (line_type IN ('item', 'linked_toll_tag', 'linked_fuel_card')),
  item_id uuid REFERENCES fleet.inv_item (id) ON DELETE SET NULL,
  qty_required numeric(14, 3) NOT NULL DEFAULT 1 CHECK (qty_required > 0),
  required boolean NOT NULL DEFAULT true,
  blocks_road_clearance boolean NOT NULL DEFAULT false,
  install_position text,
  variant_note text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fleet.vehicle_kit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL REFERENCES fleet.vehicles (id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES fleet.kit_template (id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES fleet.kit_template_version (id) ON DELETE RESTRICT,
  home_location_id uuid REFERENCES fleet.inv_location (id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'pending_verification'
    CHECK (verification_status IN ('verified', 'pending_verification')),
  last_inspected_at timestamptz,
  last_inspected_by uuid,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS fleet.inv_kit_compliance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  snapshot_date date NOT NULL,
  vehicles integer NOT NULL DEFAULT 0,
  vehicles_complete integer NOT NULL DEFAULT 0,
  lines_required integer NOT NULL DEFAULT 0,
  lines_present integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, snapshot_date)
);;
