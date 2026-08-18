-- C2: Uber trip tolls are reimbursements, not a second plaza bill.
-- Backup then reclassify. Do not reverse amounts. Do not emit offsets.

CREATE TABLE IF NOT EXISTS ledger.entries_c2_reclassify_backup_20260818 AS
SELECT * FROM ledger.entries WHERE false;

ALTER TABLE ledger.entries_c2_reclassify_backup_20260818 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ledger.entries_c2_reclassify_backup_20260818 FROM PUBLIC;
GRANT SELECT ON TABLE ledger.entries_c2_reclassify_backup_20260818 TO service_role;

INSERT INTO ledger.entries_c2_reclassify_backup_20260818
SELECT e.*
FROM ledger.entries e
WHERE e.entry_type = 'toll_charge'
  AND (e.idempotency_key LIKE '%:trip:%' OR e.idempotency_key LIKE 'trip:%')
  AND NOT EXISTS (
    SELECT 1 FROM ledger.entries_c2_reclassify_backup_20260818 b WHERE b.id = e.id
  );

UPDATE ledger.entries e
SET
  entry_type = 'toll_reimbursement',
  metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
    'reclassifiedFrom', 'toll_charge',
    'reclassifiedAt', '2026-08-18',
    'reclassifiedReason', 'finance_lock_c2_uber_trip_reimbursement',
    'role', 'uber_toll_reimbursement',
    'sourceType', 'trip'
  )
WHERE e.entry_type = 'toll_charge'
  AND (e.idempotency_key LIKE '%:trip:%' OR e.idempotency_key LIKE 'trip:%');

INSERT INTO ledger.cutover_meta (key, value)
VALUES ('finance_lock_c2_reclassify_at', now()::text)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
