-- GCT engine foundation (Dominion Accounting)
-- Append-only rates; entity register; output/input ledgers; lockable periods.
-- Live customer rate cutover remains gated on accountant sign-off (dual-read in gctRate.ts).

CREATE SCHEMA IF NOT EXISTS accounting;

GRANT USAGE ON SCHEMA accounting TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Supply classes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.gct_supply_classes (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  taxable BOOLEAN NOT NULL DEFAULT true,
  credit_allowed BOOLEAN NOT NULL DEFAULT true,
  statute_ref TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Rates (append-only — never UPDATE rate_percent; insert a new row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.gct_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_class TEXT NOT NULL REFERENCES accounting.gct_supply_classes(code),
  rate_percent NUMERIC(6, 3) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  effective_from DATE NOT NULL,
  effective_to DATE,
  authority TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gct_rates_effective_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS idx_gct_rates_class_from
  ON accounting.gct_rates (supply_class, effective_from DESC);

-- ---------------------------------------------------------------------------
-- Registered entities (merchants, couriers, Roam entities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.gct_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('merchant', 'courier', 'partner', 'roam_entity')
  ),
  entity_id TEXT NOT NULL,
  trn TEXT,
  registered BOOLEAN NOT NULL DEFAULT false,
  registered_from DATE,
  registered_to DATE,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  evidence_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gct_entities_trn_when_registered CHECK (
    registered = false OR (trn IS NOT NULL AND length(trim(trn)) > 0)
  ),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_gct_entities_type_registered
  ON accounting.gct_entities (entity_type, registered);

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.gct_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'filed')),
  output_total_jmd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  input_total_jmd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_payable_jmd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  filed_at TIMESTAMPTZ,
  filed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  form_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end),
  CONSTRAINT gct_periods_range CHECK (period_end >= period_start)
);

-- ---------------------------------------------------------------------------
-- Output tax ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.gct_output_tax (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_point TIMESTAMPTZ NOT NULL,
  source_doc_type TEXT NOT NULL,
  source_doc_id TEXT NOT NULL,
  supplier_entity_id UUID REFERENCES accounting.gct_entities(id) ON DELETE SET NULL,
  recipient_ref TEXT,
  supply_class TEXT NOT NULL REFERENCES accounting.gct_supply_classes(code),
  base_amount_jmd NUMERIC(14, 2) NOT NULL,
  rate_percent NUMERIC(6, 3) NOT NULL,
  tax_amount_jmd NUMERIC(14, 2) NOT NULL,
  period_id UUID REFERENCES accounting.gct_periods(id) ON DELETE SET NULL,
  reversal_of_id UUID REFERENCES accounting.gct_output_tax(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gct_output_tax_point
  ON accounting.gct_output_tax (tax_point DESC);
CREATE INDEX IF NOT EXISTS idx_gct_output_tax_period
  ON accounting.gct_output_tax (period_id);
CREATE INDEX IF NOT EXISTS idx_gct_output_tax_source
  ON accounting.gct_output_tax (source_doc_type, source_doc_id);

-- ---------------------------------------------------------------------------
-- Input tax ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.gct_input_tax (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_point TIMESTAMPTZ NOT NULL,
  supplier_trn TEXT,
  base_amount_jmd NUMERIC(14, 2) NOT NULL,
  rate_percent NUMERIC(6, 3) NOT NULL,
  tax_amount_jmd NUMERIC(14, 2) NOT NULL,
  credit_restriction TEXT NOT NULL DEFAULT 'none' CHECK (
    credit_restriction IN (
      'none', 'entertainment', 'motor_vehicle', 'capital_24m', 'apportioned', 'de_minimis'
    )
  ),
  creditable_amount_jmd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  period_id UUID REFERENCES accounting.gct_periods(id) ON DELETE SET NULL,
  evidence_url TEXT,
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gct_input_tax_period
  ON accounting.gct_input_tax (period_id);

-- ---------------------------------------------------------------------------
-- Seed supply classes + rates (15% standard from 2020-04-01)
-- ---------------------------------------------------------------------------
INSERT INTO accounting.gct_supply_classes (code, label, taxable, credit_allowed, statute_ref)
VALUES
  ('standard', 'Standard-rated', true, true, 's.4(1)(a)'),
  ('tourism', 'Tourism', true, true, '1st Sch Pt V'),
  ('telephone', 'Telephone', true, true, 'telephone schedule'),
  ('zero_rated', 'Zero-rated', true, true, '1st Sch Pt II'),
  ('exempt', 'Exempt', false, false, '3rd Sch Pt II'),
  ('out_of_scope', 'Out of scope', false, false, 'n/a')
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounting.gct_rates (supply_class, rate_percent, effective_from, effective_to, authority)
VALUES
  ('standard', 15, '2020-04-01', NULL, 's.4(1)(a) / L.N. rate change 1 Apr 2020'),
  ('tourism', 10, '2020-04-01', NULL, '1st Sch Pt V'),
  ('telephone', 25, '2020-04-01', NULL, 'telephone schedule'),
  ('zero_rated', 0, '2020-04-01', NULL, '1st Sch Pt II'),
  ('exempt', 0, '2020-04-01', NULL, '3rd Sch Pt II'),
  ('out_of_scope', 0, '2020-04-01', NULL, 'n/a');

-- Placeholder Roam entity — TRN filled after accountant sign-off
INSERT INTO accounting.gct_entities (
  entity_type, entity_id, trn, registered, needs_review, notes
) VALUES (
  'roam_entity',
  'roam_rush',
  NULL,
  false,
  true,
  'Placeholder — set TRN and registered after accountant confirmation'
) ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- Backfill merchants that have a TRN (do not trust status-only gct_registered)
INSERT INTO accounting.gct_entities (
  entity_type, entity_id, trn, registered, registered_from, needs_review, notes
)
SELECT
  'merchant',
  m.id::text,
  NULLIF(trim(m.tax_id), ''),
  CASE
    WHEN m.gct_registered = true
      AND m.tax_id IS NOT NULL
      AND length(trim(m.tax_id)) > 0
    THEN true
    ELSE false
  END,
  CASE
    WHEN m.gct_registered = true
      AND m.tax_id IS NOT NULL
      AND length(trim(m.tax_id)) > 0
    THEN CURRENT_DATE
    ELSE NULL
  END,
  CASE
    WHEN m.gct_registered = true
      AND (m.tax_id IS NULL OR length(trim(m.tax_id)) = 0)
    THEN true
    ELSE false
  END,
  CASE
    WHEN m.gct_registered = true
      AND (m.tax_id IS NULL OR length(trim(m.tax_id)) = 0)
    THEN 'Status-only registration — needs ops review (blank TRN)'
    ELSE NULL
  END
FROM delivery.merchants m
ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- Sync: when gct_entities merchant registration changes, mirror to delivery.merchants
CREATE OR REPLACE FUNCTION accounting.sync_merchant_gct_registered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = accounting, delivery, public
AS $$
BEGIN
  IF NEW.entity_type = 'merchant' THEN
    UPDATE delivery.merchants
    SET gct_registered = (NEW.registered = true AND NEW.trn IS NOT NULL AND length(trim(NEW.trn)) > 0),
        tax_id = COALESCE(NULLIF(trim(NEW.trn), ''), tax_id)
    WHERE id::text = NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_merchant_gct_registered ON accounting.gct_entities;
CREATE TRIGGER trg_sync_merchant_gct_registered
  AFTER INSERT OR UPDATE OF registered, trn ON accounting.gct_entities
  FOR EACH ROW
  EXECUTE FUNCTION accounting.sync_merchant_gct_registered();

-- Dual-read cutover flag (KV-style in accounting)
CREATE TABLE IF NOT EXISTS accounting.gct_engine_flags (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO accounting.gct_engine_flags (key, value)
VALUES (
  'resolver',
  '{"prefer_db": true, "kv_fallback": true, "db_authoritative": false}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Grants + RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA accounting TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA accounting TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA accounting TO service_role;

ALTER TABLE accounting.gct_supply_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.gct_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.gct_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.gct_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.gct_output_tax ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.gct_input_tax ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.gct_engine_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY gct_supply_classes_service ON accounting.gct_supply_classes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY gct_rates_service ON accounting.gct_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY gct_entities_service ON accounting.gct_entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY gct_periods_service ON accounting.gct_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY gct_output_tax_service ON accounting.gct_output_tax
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY gct_input_tax_service ON accounting.gct_input_tax
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY gct_engine_flags_service ON accounting.gct_engine_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read for Dominion admin clients using user JWT + RLS via service path preferred
CREATE POLICY gct_rates_auth_select ON accounting.gct_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY gct_classes_auth_select ON accounting.gct_supply_classes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY gct_entities_auth_select ON accounting.gct_entities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY gct_periods_auth_select ON accounting.gct_periods
  FOR SELECT TO authenticated USING (true);
CREATE POLICY gct_output_auth_select ON accounting.gct_output_tax
  FOR SELECT TO authenticated USING (true);
CREATE POLICY gct_input_auth_select ON accounting.gct_input_tax
  FOR SELECT TO authenticated USING (true);

COMMENT ON SCHEMA accounting IS 'GCT engine — rates, entities, liability ledger, remittance periods';
