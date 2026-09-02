-- Mailbox retail orders: Order → line items → packages (one tracking # per box).
-- Shared commercial invoice lives on the order; packages remain the custody / HAWB unit.

-- ---------------------------------------------------------------------------
-- retail_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.retail_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  suite_id UUID REFERENCES freight.suites(id) ON DELETE SET NULL,
  retailer TEXT,
  external_order_number TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  order_total_usd_minor BIGINT,
  intended_facility_id UUID REFERENCES freight.facilities(id) ON DELETE SET NULL,
  invoice_storage_path TEXT,
  invoice_file_name TEXT,
  invoice_verified_at TIMESTAMPTZ,
  invoice_verified_by UUID,
  invoice_unobtainable_at TIMESTAMPTZ,
  invoice_unobtainable_by UUID,
  invoice_unobtainable_note TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

UPDATE freight.retail_orders
SET owner_org_id = organization_id
WHERE owner_org_id IS NULL;

ALTER TABLE freight.retail_orders
  ALTER COLUMN owner_org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_freight_retail_orders_org
  ON freight.retail_orders (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_retail_orders_suite
  ON freight.retail_orders (suite_id);
CREATE INDEX IF NOT EXISTS idx_freight_retail_orders_external
  ON freight.retail_orders (organization_id, external_order_number)
  WHERE external_order_number IS NOT NULL;

COMMENT ON TABLE freight.retail_orders IS
  'Customer retail purchase (Amazon/Shein/etc). Groups line items + packages; holds shared commercial invoice.';

-- ---------------------------------------------------------------------------
-- packages → retail_order
-- ---------------------------------------------------------------------------
ALTER TABLE freight.packages
  ADD COLUMN IF NOT EXISTS retail_order_id UUID;

ALTER TABLE freight.packages
  DROP CONSTRAINT IF EXISTS packages_retail_order_id_fkey;
ALTER TABLE freight.packages
  ADD CONSTRAINT packages_retail_order_id_fkey
  FOREIGN KEY (retail_order_id) REFERENCES freight.retail_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_freight_packages_retail_order
  ON freight.packages (retail_order_id)
  WHERE retail_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- retail_order_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.retail_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES freight.retail_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1
    CHECK (quantity > 0),
  unit_value_usd_minor BIGINT,
  line_total_usd_minor BIGINT,
  package_id UUID REFERENCES freight.packages(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_retail_order_lines_order
  ON freight.retail_order_lines (order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_freight_retail_order_lines_package
  ON freight.retail_order_lines (package_id)
  WHERE package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_freight_retail_order_lines_unassigned
  ON freight.retail_order_lines (organization_id, order_id)
  WHERE package_id IS NULL;

COMMENT ON TABLE freight.retail_order_lines IS
  'Merchandise lines on a retail order. package_id assigns the line to a physical inbound box.';

-- ---------------------------------------------------------------------------
-- RLS + grants (edge writes via service_role; authenticated read)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'retail_orders',
    'retail_order_lines'
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

GRANT SELECT ON freight.retail_orders TO authenticated;
GRANT SELECT ON freight.retail_order_lines TO authenticated;
GRANT ALL ON freight.retail_orders TO service_role;
GRANT ALL ON freight.retail_order_lines TO service_role;
