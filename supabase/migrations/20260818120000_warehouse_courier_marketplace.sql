-- Warehouse ↔ Courier marketplace: dual package ownership + partnership links.
-- See docs/products/WAREHOUSE_COURIER_MODEL.md

-- ---------------------------------------------------------------------------
-- Links (many-to-many; self-link = in-house warehouse)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.warehouse_courier_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'paused', 'revoked')),
  initiated_by TEXT NOT NULL
    CHECK (initiated_by IN ('warehouse', 'courier')),
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_org_id, courier_org_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_wcl_warehouse_status
  ON freight.warehouse_courier_links (warehouse_org_id, status);
CREATE INDEX IF NOT EXISTS idx_freight_wcl_courier_status
  ON freight.warehouse_courier_links (courier_org_id, status);

COMMENT ON TABLE freight.warehouse_courier_links IS
  'Marketplace partnership. Self-link (warehouse_org_id = courier_org_id) = in-house floor.';

-- ---------------------------------------------------------------------------
-- Dual ownership on packages
-- ---------------------------------------------------------------------------
ALTER TABLE freight.packages
  ADD COLUMN IF NOT EXISTS owner_org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE freight.packages
  ADD COLUMN IF NOT EXISTS operating_warehouse_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Backfill: existing rows are in-house (same org owns + operates)
UPDATE freight.packages
SET owner_org_id = organization_id
WHERE owner_org_id IS NULL;

UPDATE freight.packages
SET operating_warehouse_org_id = organization_id
WHERE operating_warehouse_org_id IS NULL
  AND status IN (
    'expected', 'received_at_warehouse', 'received_miami'
  );

ALTER TABLE freight.packages
  ALTER COLUMN owner_org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_freight_packages_owner_status
  ON freight.packages (owner_org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_freight_packages_ops_wh_status
  ON freight.packages (operating_warehouse_org_id, status, created_at DESC)
  WHERE operating_warehouse_org_id IS NOT NULL;

-- Keep organization_id = owner_org_id for transition (courier-owned API filters)
CREATE OR REPLACE FUNCTION freight.sync_package_owner_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_org_id IS NULL THEN
    NEW.owner_org_id := NEW.organization_id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM NEW.owner_org_id THEN
    NEW.organization_id := NEW.owner_org_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freight_packages_sync_owner ON freight.packages;
CREATE TRIGGER trg_freight_packages_sync_owner
  BEFORE INSERT OR UPDATE OF owner_org_id, organization_id
  ON freight.packages
  FOR EACH ROW
  EXECUTE FUNCTION freight.sync_package_owner_org();

-- ---------------------------------------------------------------------------
-- Self-links for orgs that already have warehouse facilities (in-house)
-- ---------------------------------------------------------------------------
INSERT INTO freight.warehouse_courier_links (
  warehouse_org_id,
  courier_org_id,
  status,
  initiated_by,
  accepted_at
)
SELECT DISTINCT
  f.organization_id,
  f.organization_id,
  'active',
  'courier',
  now()
FROM freight.facilities f
WHERE f.facility_type = 'warehouse'
  AND f.status = 'active'
ON CONFLICT (warehouse_org_id, courier_org_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Storage / handling billing scaffold (warehouse → courier)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.warehouse_storage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID REFERENCES freight.packages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('receive', 'storage_day', 'handoff', 'adjustment')),
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit_amount_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  occurred_on DATE NOT NULL DEFAULT (CURRENT_DATE),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_wsl_wh_courier_day
  ON freight.warehouse_storage_ledger (warehouse_org_id, courier_org_id, occurred_on DESC);

COMMENT ON TABLE freight.warehouse_storage_ledger IS
  'Scaffold for warehouse charging couriers per receive / storage day / handoff.';

-- ---------------------------------------------------------------------------
-- Bin / putaway master (future depth; used by receive bin_location)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.warehouse_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES freight.facilities(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  zone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id, code)
);

CREATE INDEX IF NOT EXISTS idx_freight_warehouse_bins_org
  ON freight.warehouse_bins (warehouse_org_id, status);

-- ---------------------------------------------------------------------------
-- Org product entitlements helper columns (subscription scaffold)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscribed_products JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.organizations.subscribed_products IS
  'JSON array of product keys, e.g. ["courier","warehouse"]. Empty = infer from business_type.';

UPDATE public.organizations
SET subscribed_products = CASE
  WHEN business_type = 'warehouse' THEN '["warehouse"]'::jsonb
  WHEN business_type = 'freight_forwarding' THEN '["courier"]'::jsonb
  ELSE COALESCE(subscribed_products, '[]'::jsonb)
END
WHERE subscribed_products = '[]'::jsonb
   OR subscribed_products IS NULL;

-- Orgs that already have warehouse facilities also get warehouse product
UPDATE public.organizations o
SET subscribed_products = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(
    COALESCE(o.subscribed_products, '[]'::jsonb) || '["warehouse"]'::jsonb
  ) AS t(elem)
)
WHERE EXISTS (
  SELECT 1 FROM freight.facilities f
  WHERE f.organization_id = o.id AND f.facility_type = 'warehouse'
)
AND NOT (o.subscribed_products ? 'warehouse');

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION freight.org_has_active_link(
  p_warehouse_org UUID,
  p_courier_org UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, freight
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM freight.warehouse_courier_links l
    WHERE l.warehouse_org_id = p_warehouse_org
      AND l.courier_org_id = p_courier_org
      AND l.status = 'active'
  )
  OR p_warehouse_org = p_courier_org;
$$;

CREATE OR REPLACE FUNCTION freight.user_can_see_package(p_owner UUID, p_ops_wh UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, freight
AS $$
  SELECT freight.user_owns_org(p_owner)
    OR (p_ops_wh IS NOT NULL AND freight.user_owns_org(p_ops_wh));
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE freight.warehouse_courier_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.warehouse_storage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.warehouse_bins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS freight_warehouse_courier_links_select ON freight.warehouse_courier_links;
CREATE POLICY freight_warehouse_courier_links_select
  ON freight.warehouse_courier_links
  FOR SELECT TO authenticated
  USING (
    freight.user_owns_org(warehouse_org_id)
    OR freight.user_owns_org(courier_org_id)
  );

DROP POLICY IF EXISTS freight_warehouse_courier_links_no_write ON freight.warehouse_courier_links;
CREATE POLICY freight_warehouse_courier_links_no_write
  ON freight.warehouse_courier_links
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS freight_warehouse_courier_links_no_update ON freight.warehouse_courier_links;
CREATE POLICY freight_warehouse_courier_links_no_update
  ON freight.warehouse_courier_links
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS freight_warehouse_courier_links_no_delete ON freight.warehouse_courier_links;
CREATE POLICY freight_warehouse_courier_links_no_delete
  ON freight.warehouse_courier_links
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS freight_warehouse_storage_ledger_select ON freight.warehouse_storage_ledger;
CREATE POLICY freight_warehouse_storage_ledger_select
  ON freight.warehouse_storage_ledger
  FOR SELECT TO authenticated
  USING (
    freight.user_owns_org(warehouse_org_id)
    OR freight.user_owns_org(courier_org_id)
  );

DROP POLICY IF EXISTS freight_warehouse_storage_ledger_no_write ON freight.warehouse_storage_ledger;
CREATE POLICY freight_warehouse_storage_ledger_no_write
  ON freight.warehouse_storage_ledger
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS freight_warehouse_bins_select ON freight.warehouse_bins;
CREATE POLICY freight_warehouse_bins_select
  ON freight.warehouse_bins
  FOR SELECT TO authenticated
  USING (freight.user_owns_org(warehouse_org_id));

DROP POLICY IF EXISTS freight_warehouse_bins_no_write ON freight.warehouse_bins;
CREATE POLICY freight_warehouse_bins_no_write
  ON freight.warehouse_bins
  FOR INSERT TO authenticated WITH CHECK (false);

-- Packages: owner OR operating warehouse
DROP POLICY IF EXISTS freight_packages_select ON freight.packages;
CREATE POLICY freight_packages_select
  ON freight.packages
  FOR SELECT TO authenticated
  USING (
    freight.user_can_see_package(owner_org_id, operating_warehouse_org_id)
    OR freight.user_owns_org(organization_id)
  );

GRANT SELECT ON freight.warehouse_courier_links TO authenticated;
GRANT SELECT ON freight.warehouse_storage_ledger TO authenticated;
GRANT SELECT ON freight.warehouse_bins TO authenticated;
GRANT ALL ON freight.warehouse_courier_links TO service_role;
GRANT ALL ON freight.warehouse_storage_ledger TO service_role;
GRANT ALL ON freight.warehouse_bins TO service_role;
