-- Phase 4: org backfill on driver_financial_periods + RLS so dropped org params fail closed.
-- DFP.organization_id is UUID; fleet.drivers.organization_id may be text — cast safely.

-- Backfill organization_id from fleet.drivers where missing.
UPDATE ledger.driver_financial_periods dfp
SET organization_id = d.organization_id::uuid
FROM fleet.drivers d
WHERE dfp.organization_id IS NULL
  AND d.id::text = dfp.driver_id
  AND d.organization_id IS NOT NULL
  AND trim(d.organization_id::text) <> ''
  AND d.organization_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Also try public.drivers if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drivers'
  ) THEN
    UPDATE ledger.driver_financial_periods dfp
    SET organization_id = d.organization_id::uuid
    FROM public.drivers d
    WHERE dfp.organization_id IS NULL
      AND d.id::text = dfp.driver_id
      AND d.organization_id IS NOT NULL
      AND trim(d.organization_id::text) <> ''
      AND d.organization_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'public.drivers org backfill skipped: %', SQLERRM;
END $$;

ALTER TABLE ledger.driver_financial_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dfp_service_role_all ON ledger.driver_financial_periods;
CREATE POLICY dfp_service_role_all ON ledger.driver_financial_periods
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated readers: own org only (JWT claim). Platform bypasses via service role in edge.
DROP POLICY IF EXISTS dfp_org_select ON ledger.driver_financial_periods;
CREATE POLICY dfp_org_select ON ledger.driver_financial_periods
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id::text = COALESCE(
      auth.jwt() ->> 'organization_id',
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      ''
    )
  );

COMMENT ON TABLE ledger.settlement_movements IS
  'Append-only settlement desk movements — Collect/Pay/Write-off/Reverse/Verify';
