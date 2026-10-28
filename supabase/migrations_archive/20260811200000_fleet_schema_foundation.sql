-- Fleet relational schema foundation + domain tables (KV strangler program).
-- Pattern: hot columns + payload_json + organization_id + legacy_kv_id + RLS edge-only writes.

CREATE SCHEMA IF NOT EXISTS fleet;

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION fleet.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Org-owner / platform SELECT helper (reuses public.rbac_is_platform_user)
CREATE OR REPLACE FUNCTION fleet.can_read_org(p_org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, fleet
AS $$
  SELECT
    public.rbac_is_platform_user(auth.uid())
    OR (
      p_org_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id::text = p_org_id AND o.owner_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION fleet.can_read_org(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet.can_read_org(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wave 1 — Identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.drivers (
  id text PRIMARY KEY,
  organization_id text,
  name text,
  email text,
  phone text,
  status text,
  assigned_vehicle_id text,
  uber_driver_id text,
  indrive_driver_id text,
  license_front_url text,
  license_back_url text,
  proof_of_address_url text,
  fuel_scenario_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_legacy_kv_uidx ON fleet.drivers (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_drivers_org_idx ON fleet.drivers (organization_id);
CREATE INDEX IF NOT EXISTS fleet_drivers_status_idx ON fleet.drivers (status);

CREATE TABLE IF NOT EXISTS fleet.vehicles (
  id text PRIMARY KEY,
  organization_id text,
  license_plate text,
  vin text,
  make text,
  model text,
  year int,
  color text,
  status text,
  current_driver_id text,
  toll_tag_id text,
  vehicle_catalog_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_legacy_kv_uidx ON fleet.vehicles (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_vehicles_org_idx ON fleet.vehicles (organization_id);
CREATE INDEX IF NOT EXISTS fleet_vehicles_plate_idx ON fleet.vehicles (license_plate);

CREATE TABLE IF NOT EXISTS fleet.driver_metrics (
  id text PRIMARY KEY,
  organization_id text,
  driver_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_driver_metrics_legacy_kv_uidx ON fleet.driver_metrics (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_driver_metrics_driver_idx ON fleet.driver_metrics (driver_id);

CREATE TABLE IF NOT EXISTS fleet.vehicle_metrics (
  id text PRIMARY KEY,
  organization_id text,
  vehicle_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_metrics_legacy_kv_uidx ON fleet.vehicle_metrics (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_vehicle_metrics_vehicle_idx ON fleet.vehicle_metrics (vehicle_id);

-- ---------------------------------------------------------------------------
-- Wave 2 — Trips + imports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.trips (
  id text PRIMARY KEY,
  organization_id text,
  date date,
  driver_id text,
  vehicle_id text,
  platform text,
  status text,
  amount numeric,
  batch_id text,
  payment_method text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_trips_legacy_kv_uidx ON fleet.trips (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_trips_org_date_idx ON fleet.trips (organization_id, date);
CREATE INDEX IF NOT EXISTS fleet_trips_driver_date_idx ON fleet.trips (driver_id, date);
CREATE INDEX IF NOT EXISTS fleet_trips_batch_idx ON fleet.trips (batch_id);
CREATE INDEX IF NOT EXISTS fleet_trips_status_idx ON fleet.trips (status);

CREATE TABLE IF NOT EXISTS fleet.import_batches (
  id text PRIMARY KEY,
  organization_id text,
  file_name text,
  upload_date timestamptz,
  status text,
  record_count int,
  type text,
  period_start date,
  period_end date,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_import_batches_legacy_kv_uidx ON fleet.import_batches (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_import_batches_org_idx ON fleet.import_batches (organization_id);

CREATE TABLE IF NOT EXISTS fleet.import_metadata (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_import_metadata_legacy_kv_uidx ON fleet.import_metadata (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.import_insights (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_import_insights_legacy_kv_uidx ON fleet.import_insights (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.payment_ledger_lines (
  id text PRIMARY KEY,
  organization_id text,
  platform text,
  trip_id text,
  driver_id text,
  batch_id text,
  idempotency_key text,
  reporting_at timestamptz,
  paid_to_you numeric,
  earnings_gross numeric,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_pll_legacy_kv_uidx ON fleet.payment_ledger_lines (legacy_kv_id);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_pll_idem_uidx ON fleet.payment_ledger_lines (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_pll_batch_idx ON fleet.payment_ledger_lines (batch_id);
CREATE INDEX IF NOT EXISTS fleet_pll_driver_idx ON fleet.payment_ledger_lines (driver_id);

CREATE TABLE IF NOT EXISTS fleet.driver_period_snapshots (
  id text PRIMARY KEY,
  organization_id text,
  driver_id text,
  batch_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_dps_legacy_kv_uidx ON fleet.driver_period_snapshots (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_dps_driver_batch_idx ON fleet.driver_period_snapshots (driver_id, batch_id);

-- ---------------------------------------------------------------------------
-- Wave 3 — Tolls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.toll_ledger (
  id text PRIMARY KEY,
  organization_id text,
  vehicle_id text,
  driver_id text,
  toll_tag_id text,
  plaza text,
  plaza_id text,
  date date,
  type text,
  amount numeric,
  payment_method text,
  status text,
  resolution text,
  is_reconciled boolean,
  trip_id text,
  batch_id text,
  legacy_kv_id text NOT NULL,
  audit_trail jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_toll_ledger_legacy_kv_uidx ON fleet.toll_ledger (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_toll_ledger_org_date_idx ON fleet.toll_ledger (organization_id, date);
CREATE INDEX IF NOT EXISTS fleet_toll_ledger_trip_idx ON fleet.toll_ledger (trip_id);
CREATE INDEX IF NOT EXISTS fleet_toll_ledger_status_idx ON fleet.toll_ledger (status);

CREATE TABLE IF NOT EXISTS fleet.toll_tags (
  id text PRIMARY KEY,
  organization_id text,
  tag_number text,
  vehicle_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_toll_tags_legacy_kv_uidx ON fleet.toll_tags (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.toll_plazas (
  id text PRIMARY KEY,
  organization_id text,
  name text,
  highway text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_toll_plazas_legacy_kv_uidx ON fleet.toll_plazas (legacy_kv_id);

-- ---------------------------------------------------------------------------
-- Wave 4 — Fuel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.fuel_entries (
  id text PRIMARY KEY,
  organization_id text,
  date date,
  vehicle_id text,
  driver_id text,
  card_id text,
  amount numeric,
  liters numeric,
  type text,
  entry_mode text,
  payment_source text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuel_entries_legacy_kv_uidx ON fleet.fuel_entries (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_fuel_entries_org_date_idx ON fleet.fuel_entries (organization_id, date);
CREATE INDEX IF NOT EXISTS fleet_fuel_entries_vehicle_idx ON fleet.fuel_entries (vehicle_id);

CREATE TABLE IF NOT EXISTS fleet.fuel_cards (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuel_cards_legacy_kv_uidx ON fleet.fuel_cards (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.stations (
  id text PRIMARY KEY,
  organization_id text,
  name text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_stations_legacy_kv_uidx ON fleet.stations (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.fuel_adjustments (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuel_adjustments_legacy_kv_uidx ON fleet.fuel_adjustments (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.fuel_disputes (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuel_disputes_legacy_kv_uidx ON fleet.fuel_disputes (legacy_kv_id);

-- ---------------------------------------------------------------------------
-- Wave 5 — Expenses + banking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.expense_documents (
  id text PRIMARY KEY,
  organization_id text,
  status text,
  category text,
  description text,
  vendor_id text,
  incurred_date date,
  gross_amount numeric,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_docs_legacy_kv_uidx ON fleet.expense_documents (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_expense_docs_org_idx ON fleet.expense_documents (organization_id);

CREATE TABLE IF NOT EXISTS fleet.expense_payments (
  id text PRIMARY KEY,
  organization_id text,
  document_id text,
  amount numeric,
  payment_date date,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_payments_legacy_kv_uidx ON fleet.expense_payments (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.transactions (
  id text PRIMARY KEY,
  organization_id text,
  date date,
  driver_id text,
  vehicle_id text,
  trip_id text,
  type text,
  category text,
  amount numeric,
  status text,
  batch_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_transactions_legacy_kv_uidx ON fleet.transactions (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_transactions_org_date_idx ON fleet.transactions (organization_id, date);

CREATE TABLE IF NOT EXISTS fleet.fixed_expenses (
  id text PRIMARY KEY,
  organization_id text,
  vehicle_id text,
  name text,
  category text,
  amount numeric,
  frequency text,
  is_active boolean,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fixed_expenses_legacy_kv_uidx ON fleet.fixed_expenses (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.expense_rule_groups (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_rule_groups_legacy_kv_uidx ON fleet.expense_rule_groups (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.expense_rule_assignments (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_rule_assignments_legacy_kv_uidx ON fleet.expense_rule_assignments (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.expense_journal (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_journal_legacy_kv_uidx ON fleet.expense_journal (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.bank_statements (
  id text PRIMARY KEY,
  organization_id text,
  file_name text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_bank_statements_legacy_kv_uidx ON fleet.bank_statements (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.bank_confirmations (
  id text PRIMARY KEY,
  organization_id text,
  driver_id text,
  week_start_ymd date,
  status text,
  amount_received numeric,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_bank_confirmations_legacy_kv_uidx ON fleet.bank_confirmations (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.platform_vendors (
  id text PRIMARY KEY,
  organization_id text,
  name text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_platform_vendors_legacy_kv_uidx ON fleet.platform_vendors (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.expense_categories (
  id text PRIMARY KEY,
  organization_id text,
  name text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_categories_legacy_kv_uidx ON fleet.expense_categories (legacy_kv_id);

-- ---------------------------------------------------------------------------
-- Wave 6 — Policy + support
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.claims (
  id text PRIMARY KEY,
  organization_id text,
  type text,
  status text,
  driver_id text,
  trip_id text,
  amount numeric,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_claims_legacy_kv_uidx ON fleet.claims (legacy_kv_id);
CREATE INDEX IF NOT EXISTS fleet_claims_driver_idx ON fleet.claims (driver_id);

CREATE TABLE IF NOT EXISTS fleet.earnings_policies (
  id text PRIMARY KEY,
  organization_id text,
  name text,
  is_default boolean,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_earnings_policies_legacy_kv_uidx ON fleet.earnings_policies (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.equipment (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_equipment_legacy_kv_uidx ON fleet.equipment (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.inventory (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_inventory_legacy_kv_uidx ON fleet.inventory (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.checkins (
  id text PRIMARY KEY,
  organization_id text,
  vehicle_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_checkins_legacy_kv_uidx ON fleet.checkins (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.odometer_readings (
  id text PRIMARY KEY,
  organization_id text,
  vehicle_id text,
  reading numeric,
  reading_date date,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_odometer_readings_legacy_kv_uidx ON fleet.odometer_readings (legacy_kv_id);

-- ---------------------------------------------------------------------------
-- Wave 7 — Config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.organization_settings (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_org_settings_legacy_kv_uidx ON fleet.organization_settings (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.preferences (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_preferences_legacy_kv_uidx ON fleet.preferences (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.integrations (
  id text PRIMARY KEY,
  organization_id text,
  provider text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_integrations_legacy_kv_uidx ON fleet.integrations (legacy_kv_id);

CREATE TABLE IF NOT EXISTS fleet.ledger_config (
  id text PRIMARY KEY,
  organization_id text,
  legacy_kv_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_ledger_config_legacy_kv_uidx ON fleet.ledger_config (legacy_kv_id);

-- Dual-write metrics (observability)
CREATE TABLE IF NOT EXISTS fleet.dual_write_metrics (
  id bigserial PRIMARY KEY,
  domain text NOT NULL,
  status text NOT NULL,
  reason text,
  legacy_kv_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_dual_write_metrics_domain_idx ON fleet.dual_write_metrics (domain, created_at DESC);

-- Apply updated_at triggers to all entity tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drivers','vehicles','driver_metrics','vehicle_metrics','trips','import_batches',
    'import_metadata','import_insights','payment_ledger_lines','driver_period_snapshots',
    'toll_ledger','toll_tags','toll_plazas','fuel_entries','fuel_cards','stations',
    'fuel_adjustments','fuel_disputes','expense_documents','expense_payments','transactions',
    'fixed_expenses','expense_rule_groups','expense_rule_assignments','expense_journal',
    'bank_statements','bank_confirmations','platform_vendors','expense_categories',
    'claims','earnings_policies','equipment','inventory','checkins','odometer_readings',
    'organization_settings','preferences','integrations','ledger_config'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON fleet.%I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON fleet.%I FOR EACH ROW EXECUTE FUNCTION fleet.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- RLS: block direct authenticated writes; allow org-scoped SELECT
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drivers','vehicles','driver_metrics','vehicle_metrics','trips','import_batches',
    'import_metadata','import_insights','payment_ledger_lines','driver_period_snapshots',
    'toll_ledger','toll_tags','toll_plazas','fuel_entries','fuel_cards','stations',
    'fuel_adjustments','fuel_disputes','expense_documents','expense_payments','transactions',
    'fixed_expenses','expense_rule_groups','expense_rule_assignments','expense_journal',
    'bank_statements','bank_confirmations','platform_vendors','expense_categories',
    'claims','earnings_policies','equipment','inventory','checkins','odometer_readings',
    'organization_settings','preferences','integrations','ledger_config'
  ]
  LOOP
    EXECUTE format('ALTER TABLE fleet.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON fleet.%I;', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I_select ON fleet.%I FOR SELECT TO authenticated USING (fleet.can_read_org(organization_id));',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_no_direct_write ON fleet.%I;', t || '_no_direct_write', t);
    EXECUTE format(
      'CREATE POLICY %I_no_direct_write ON fleet.%I FOR ALL TO authenticated USING (false) WITH CHECK (false);',
      t || '_no_direct_write', t
    );
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA fleet TO service_role, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA fleet TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA fleet TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA fleet TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA fleet GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA fleet GRANT SELECT ON TABLES TO authenticated;

-- PostgREST-friendly public views (service_role writes go through to fleet.*)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drivers','vehicles','driver_metrics','vehicle_metrics','trips','import_batches',
    'import_metadata','import_insights','payment_ledger_lines','driver_period_snapshots',
    'toll_ledger','toll_tags','toll_plazas','fuel_entries','fuel_cards','stations',
    'fuel_adjustments','fuel_disputes','expense_documents','expense_payments','transactions',
    'fixed_expenses','expense_rule_groups','expense_rule_assignments','expense_journal',
    'bank_statements','bank_confirmations','platform_vendors','expense_categories',
    'claims','earnings_policies','equipment','inventory','checkins','odometer_readings',
    'organization_settings','preferences','integrations','ledger_config','dual_write_metrics'
  ]
  LOOP
    EXECUTE format('CREATE OR REPLACE VIEW public.fleet_%I AS SELECT * FROM fleet.%I;', t, t);
    EXECUTE format('GRANT SELECT ON public.fleet_%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.fleet_%I TO service_role;', t);
  END LOOP;
END $$;
