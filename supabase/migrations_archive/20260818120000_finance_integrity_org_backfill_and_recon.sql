-- Financial integrity: backfill period org ids + nightly recon log.
-- Duplicate share_cash migrations (20260717180000 vs stub 20260717221350) are historical no-ops after this.

DO $$
BEGIN
  IF to_regclass('fleet.drivers') IS NOT NULL THEN
    UPDATE ledger.driver_financial_periods p
    SET organization_id = d.organization_id::uuid
    FROM fleet.drivers d
    WHERE p.organization_id IS NULL
      AND d.organization_id IS NOT NULL
      AND d.organization_id ~ '^[0-9a-fA-F-]{36}$'
      AND p.driver_id = d.id;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ledger.finance_recon_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week_from DATE,
  week_to DATE,
  period_count INTEGER NOT NULL DEFAULT 0,
  drift_count INTEGER NOT NULL DEFAULT 0,
  null_org_count INTEGER NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE ledger.finance_recon_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON ledger.finance_recon_runs TO service_role;
