-- One-time: older unsigned week statements are history.
-- Keep the newest version of each driver-week lane. Signed rows stay signed.
-- Version matches the migration already applied on prod (20261021151239).

UPDATE ledger.week_statements older
SET status = 'restated'
WHERE older.status = 'draft'
  AND EXISTS (
    SELECT 1
    FROM ledger.week_statements newer
    WHERE newer.organization_id = older.organization_id
      AND newer.driver_id = older.driver_id
      AND newer.week_key = older.week_key
      AND newer.kind = older.kind
      AND newer.version > older.version
  );
