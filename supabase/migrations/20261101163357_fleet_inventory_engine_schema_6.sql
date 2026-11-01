
-- Counts, alerts, approvals, audit
CREATE TABLE IF NOT EXISTS fleet.inv_count_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  code text NOT NULL,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  bins uuid[] NOT NULL DEFAULT '{}'::uuid[],
  blind boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'under_audit', 'reconciled', 'closed')),
  submitted_by uuid,
  submitted_role text,
  clerk_id text,
  device_terminal text,
  submitted_at timestamptz,
  approved_by uuid,
  audit_hash text,
  movement_id uuid REFERENCES fleet.inv_movement (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_count_session_org_code_uidx ON fleet.inv_count_session (organization_id, code);

CREATE TABLE IF NOT EXISTS fleet.inv_count_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES fleet.inv_count_session (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  bin_id uuid REFERENCES fleet.inv_bin (id) ON DELETE SET NULL,
  expected_qty numeric(14, 3),
  counted_qty numeric(14, 3),
  reason text CHECK (reason IS NULL OR reason IN ('lost', 'found', 'damaged', 'miscounted')),
  unit_value numeric(14, 2),
  variance_value numeric(14, 2),
  line_status text NOT NULL DEFAULT 'exact'
    CHECK (line_status IN ('exact', 'pre_approved', 'needs_approval', 'recount'))
);

CREATE TABLE IF NOT EXISTS fleet.inv_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  type text NOT NULL,
  chip_label text,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  assignee_id uuid,
  snoozed_until timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  resolved_by uuid,
  resolved_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_alert_org_status_idx ON fleet.inv_alert (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS fleet.inv_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('adjust', 'write_off', 'count', 'po')),
  subject_id uuid NOT NULL,
  amount numeric(14, 2),
  rule_code text,
  rule_name text,
  requested_by uuid NOT NULL,
  approved_by uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS fleet.inv_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet.inv_driver_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  report_no text NOT NULL,
  vehicle_id text NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  kit_line_id uuid REFERENCES fleet.kit_template_line (id) ON DELETE SET NULL,
  asset_id uuid REFERENCES fleet.inv_asset (id) ON DELETE SET NULL,
  item_id uuid REFERENCES fleet.inv_item (id) ON DELETE SET NULL,
  issue text NOT NULL CHECK (issue IN ('damaged', 'missing', 'not_working')),
  note text,
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  gps_lat double precision,
  gps_lng double precision,
  queued_area text,
  client_key text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'fixed')),
  seen_at timestamptz,
  seen_by uuid,
  fixed_at timestamptz,
  fleet_reply text,
  resolution_movement_id uuid REFERENCES fleet.inv_movement (id) ON DELETE SET NULL,
  driver_liability boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_driver_report_org_no_uidx ON fleet.inv_driver_report (organization_id, report_no);
CREATE UNIQUE INDEX IF NOT EXISTS inv_driver_report_client_key_uidx
  ON fleet.inv_driver_report (organization_id, client_key)
  WHERE client_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS fleet.inv_driver_report_update (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  report_id uuid NOT NULL REFERENCES fleet.inv_driver_report (id) ON DELETE CASCADE,
  by_role text NOT NULL CHECK (by_role IN ('driver', 'fleet')),
  kind text NOT NULL CHECK (kind IN (
    'found_it', 'got_replacement', 'still_missing', 'replacement_en_route',
    'hub_collection_ready', 'urgent_safety_item'
  )),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);;
