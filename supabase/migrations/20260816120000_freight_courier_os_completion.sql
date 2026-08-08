-- Courier OS completion (additive): duty, tariffs, filings, clearance, dual-ledger billing
-- Does not drop or rewrite existing freight tables.

-- ---------------------------------------------------------------------------
-- packages columns for duty / audit readiness
-- ---------------------------------------------------------------------------
ALTER TABLE freight.packages
  ADD COLUMN IF NOT EXISTS hs_tariff_code_id UUID,
  ADD COLUMN IF NOT EXISTS item_category TEXT,
  ADD COLUMN IF NOT EXISTS freight_fee_usd_minor BIGINT,
  ADD COLUMN IF NOT EXISTS insurance_usd_minor BIGINT,
  ADD COLUMN IF NOT EXISTS bin_location TEXT,
  ADD COLUMN IF NOT EXISTS invoice_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_verified_by UUID,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12, 3);

ALTER TABLE freight.suites
  ADD COLUMN IF NOT EXISTS trn_valid BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- hs_tariff_codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.hs_tariff_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  cet_rate NUMERIC(8, 6) NOT NULL DEFAULT 0
    CHECK (cet_rate >= 0 AND cet_rate <= 1),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_freight_hs_tariff_org
  ON freight.hs_tariff_codes (organization_id, active);

ALTER TABLE freight.packages
  DROP CONSTRAINT IF EXISTS packages_hs_tariff_code_id_fkey;
ALTER TABLE freight.packages
  ADD CONSTRAINT packages_hs_tariff_code_id_fkey
  FOREIGN KEY (hs_tariff_code_id) REFERENCES freight.hs_tariff_codes(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- package_duty (1:1 snapshot of landed-cost computation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.package_duty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES freight.packages(id) ON DELETE CASCADE,
  item_cost_usd_minor BIGINT NOT NULL DEFAULT 0,
  freight_usd_minor BIGINT NOT NULL DEFAULT 0,
  insurance_usd_minor BIGINT NOT NULL DEFAULT 0,
  cif_usd_minor BIGINT NOT NULL DEFAULT 0,
  above_threshold BOOLEAN NOT NULL DEFAULT false,
  cet_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
  import_duty_usd_minor BIGINT NOT NULL DEFAULT 0,
  scf_usd_minor BIGINT NOT NULL DEFAULT 0,
  env_usd_minor BIGINT NOT NULL DEFAULT 0,
  gct_usd_minor BIGINT NOT NULL DEFAULT 0,
  stamp_jmd_minor BIGINT NOT NULL DEFAULT 0,
  caf_jmd_minor BIGINT NOT NULL DEFAULT 0,
  total_duty_usd_minor BIGINT NOT NULL DEFAULT 0,
  total_duty_jmd_minor BIGINT NOT NULL DEFAULT 0,
  fx_usd_jmd NUMERIC(12, 6) NOT NULL DEFAULT 155.5,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_package_duty_org
  ON freight.package_duty (organization_id);

-- ---------------------------------------------------------------------------
-- customs_filings (AWBOLDS/CSV audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.customs_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manifest_id UUID NOT NULL REFERENCES freight.manifests(id) ON DELETE CASCADE,
  format TEXT NOT NULL DEFAULT 'awbolds'
    CHECK (format IN ('awbolds', 'csv')),
  payload TEXT,
  payload_path TEXT,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'generated', 'queued', 'accepted', 'rejected', 'stubbed'
    )),
  jca_ref TEXT,
  submitted_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_customs_filings_manifest
  ON freight.customs_filings (manifest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_customs_filings_org
  ON freight.customs_filings (organization_id, status);

-- ---------------------------------------------------------------------------
-- clearance_events (lane outcomes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.clearance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  manifest_id UUID REFERENCES freight.manifests(id) ON DELETE SET NULL,
  package_id UUID REFERENCES freight.packages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('green', 'yellow', 'red')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'feed', 'webhook')),
  note TEXT,
  actor_user_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_clearance_events_pkg
  ON freight.clearance_events (package_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_clearance_events_org
  ON freight.clearance_events (organization_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- consolidated_invoices + invoice_lines (dual ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.consolidated_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  suite_id UUID REFERENCES freight.suites(id) ON DELETE SET NULL,
  package_id UUID REFERENCES freight.packages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'void')),
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_usd_jmd NUMERIC(12, 6) NOT NULL DEFAULT 155.5,
  courier_total_usd_minor BIGINT NOT NULL DEFAULT 0,
  government_total_usd_minor BIGINT NOT NULL DEFAULT 0,
  grand_total_usd_minor BIGINT NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_freight_consol_inv_org
  ON freight.consolidated_invoices (organization_id, status);

CREATE TABLE IF NOT EXISTS freight.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES freight.consolidated_invoices(id) ON DELETE CASCADE,
  ledger TEXT NOT NULL CHECK (ledger IN ('courier_revenue', 'government_passthrough')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_usd_minor BIGINT NOT NULL DEFAULT 0,
  amount_jmd_minor BIGINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_invoice_lines_inv
  ON freight.invoice_lines (invoice_id, sort_order);

-- ---------------------------------------------------------------------------
-- RLS (mirror existing freight pattern)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hs_tariff_codes',
    'package_duty',
    'customs_filings',
    'clearance_events',
    'consolidated_invoices',
    'invoice_lines'
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

GRANT SELECT ON freight.hs_tariff_codes TO authenticated;
GRANT SELECT ON freight.package_duty TO authenticated;
GRANT SELECT ON freight.customs_filings TO authenticated;
GRANT SELECT ON freight.clearance_events TO authenticated;
GRANT SELECT ON freight.consolidated_invoices TO authenticated;
GRANT SELECT ON freight.invoice_lines TO authenticated;

GRANT ALL ON freight.hs_tariff_codes TO service_role;
GRANT ALL ON freight.package_duty TO service_role;
GRANT ALL ON freight.customs_filings TO service_role;
GRANT ALL ON freight.clearance_events TO service_role;
GRANT ALL ON freight.consolidated_invoices TO service_role;
GRANT ALL ON freight.invoice_lines TO service_role;
