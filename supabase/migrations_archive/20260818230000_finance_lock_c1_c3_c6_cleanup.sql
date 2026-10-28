-- Permanent finance lock Phase 2: snapshot weeks, backup+remove C1/C3/C6 junk, tag remaining C4.
-- C2 trip tolls are reimbursements — not touched. Sole-copy org |payout|CASH rows are kept.

CREATE TABLE IF NOT EXISTS ledger.driver_financial_periods_backup_20260818 AS
SELECT * FROM ledger.driver_financial_periods;

ALTER TABLE ledger.driver_financial_periods_backup_20260818 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ledger.driver_financial_periods_backup_20260818 FROM PUBLIC;
GRANT SELECT ON TABLE ledger.driver_financial_periods_backup_20260818 TO service_role;

CREATE TABLE IF NOT EXISTS ledger.entries_cleanup_backup_20260818 (
  LIKE ledger.entries INCLUDING DEFAULTS,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  cleanup_class text NOT NULL
);

ALTER TABLE ledger.entries_cleanup_backup_20260818 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ledger.entries_cleanup_backup_20260818 FROM PUBLIC;
GRANT SELECT ON TABLE ledger.entries_cleanup_backup_20260818 TO service_role;

CREATE TABLE IF NOT EXISTS ledger.source_receipts_cleanup_backup_20260818 AS
SELECT * FROM ledger.source_receipts WHERE false;

ALTER TABLE ledger.source_receipts_cleanup_backup_20260818 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ledger.source_receipts_cleanup_backup_20260818 FROM PUBLIC;
GRANT SELECT ON TABLE ledger.source_receipts_cleanup_backup_20260818 TO service_role;

INSERT INTO ledger.entries_cleanup_backup_20260818
SELECT e.*, now(),
  CASE
    WHEN e.entry_type = 'payout_cash'
      AND e.idempotency_key LIKE '%|payout|CASH'
      AND e.idempotency_key NOT LIKE '%|payout|cash|%'
      THEN 'C1_org_fallback_twin'
    WHEN e.entry_type = 'payout_cash'
      AND coalesce(trim(e.metadata->>'platform'), '') = ''
      THEN 'C1_untagged_twin'
    WHEN e.entry_type = 'toll_support_adjustment'
      AND lower(coalesce(e.metadata->>'description', '')) LIKE '%trip completed order%'
      THEN 'C3_trip_completed_order'
    ELSE 'C6_case_duplicate'
  END
FROM ledger.entries e
WHERE
  (
    e.entry_type = 'payout_cash'
    AND e.idempotency_key LIKE '%|payout|CASH'
    AND e.idempotency_key NOT LIKE '%|payout|cash|%'
    AND EXISTS (
      SELECT 1 FROM ledger.entries k
      WHERE k.entry_type = 'payout_cash'
        AND k.id <> e.id
        AND k.idempotency_key LIKE '%|payout|cash|%'
        AND (k.effective_at AT TIME ZONE 'UTC')::date = (e.effective_at AT TIME ZONE 'UTC')::date
        AND k.amount_minor = e.amount_minor
    )
  )
  OR (
    e.entry_type = 'payout_cash'
    AND coalesce(trim(e.metadata->>'platform'), '') = ''
    AND EXISTS (
      SELECT 1 FROM ledger.entries k
      WHERE k.entry_type = 'payout_cash'
        AND k.id <> e.id
        AND (k.effective_at AT TIME ZONE 'UTC')::date = (e.effective_at AT TIME ZONE 'UTC')::date
        AND k.amount_minor = e.amount_minor
        AND coalesce(trim(k.metadata->>'platform'), '') <> ''
    )
  )
  OR (
    e.entry_type = 'toll_support_adjustment'
    AND lower(coalesce(e.metadata->>'description', '')) LIKE '%trip completed order%'
  )
  OR (
    e.entry_type = 'toll_support_adjustment'
    AND coalesce(e.metadata->>'supportCaseId', '') ILIKE '91bae090%'
    AND e.idempotency_key NOT LIKE '%payment_line:uber_tx:%'
  );

INSERT INTO ledger.source_receipts_cleanup_backup_20260818
SELECT r.*
FROM ledger.source_receipts r
WHERE r.ledger_entry_id IN (SELECT id FROM ledger.entries_cleanup_backup_20260818);

DELETE FROM ledger.financial_allocations
WHERE financial_event_id IN (
  SELECT id FROM ledger.financial_events
  WHERE ledger_entry_id IN (SELECT id FROM ledger.entries_cleanup_backup_20260818)
);

DELETE FROM ledger.financial_events
WHERE ledger_entry_id IN (SELECT id FROM ledger.entries_cleanup_backup_20260818);

DELETE FROM ledger.entries
WHERE id IN (SELECT id FROM ledger.entries_cleanup_backup_20260818);

UPDATE ledger.entries
SET metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object('platform', 'Uber')
  || CASE
    WHEN entry_type = 'payout_bank' THEN jsonb_build_object(
      'recipient', coalesce(metadata->>'recipient', 'org'),
      'bankRole', coalesce(metadata->>'bankRole', 'org_deposit'),
      'source', coalesce(metadata->>'source', 'payments_organization')
    )
    ELSE '{}'::jsonb
  END
WHERE entry_type IN ('payout_bank', 'statement_line', 'fare_earning', 'promotion')
  AND coalesce(trim(metadata->>'platform'), '') = '';

INSERT INTO ledger.cutover_meta (key, value)
VALUES (
  'finance_lock_c1_c3_c6_at',
  now()::text
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
