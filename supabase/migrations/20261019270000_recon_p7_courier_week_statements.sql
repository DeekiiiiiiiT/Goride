-- P7: courier delivery earnings lane on ledger.week_statements (WR-H5 / audit §7).

ALTER TABLE ledger.week_statements
  DROP CONSTRAINT IF EXISTS week_statements_kind_check;

ALTER TABLE ledger.week_statements
  ADD CONSTRAINT week_statements_kind_check
  CHECK (kind IN ('fuel', 'toll', 'earnings', 'courier_earnings'));

COMMENT ON COLUMN ledger.week_statements.kind IS
  'fuel|toll|earnings (rideshare driver-week) or courier_earnings (delivery lane).';

NOTIFY pgrst, 'reload schema';
