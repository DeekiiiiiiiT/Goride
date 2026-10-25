-- Settlement corrections, finance-week locks visible to the server, and a sealed settlement statement.

ALTER TABLE ledger.settlement_movements
  DROP CONSTRAINT IF EXISTS settlement_movements_kind_check;

ALTER TABLE ledger.settlement_movements
  ADD CONSTRAINT settlement_movements_kind_check
  CHECK (kind IN ('collect', 'pay', 'write_off', 'reverse', 'verify', 'correction'));

CREATE OR REPLACE VIEW public.finance_period_locks
WITH (security_invoker = true) AS
SELECT organization_id, week_start, locked_at
FROM fleet.finance_period_locks;

GRANT SELECT ON public.finance_period_locks TO service_role;

ALTER TABLE ledger.week_statements
  DROP CONSTRAINT IF EXISTS week_statements_kind_check;

ALTER TABLE ledger.week_statements
  ADD CONSTRAINT week_statements_kind_check
  CHECK (kind IN ('fuel', 'toll', 'earnings', 'courier_earnings', 'settlement'));
