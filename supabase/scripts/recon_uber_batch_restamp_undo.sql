-- Undo WRA-09 re-stamp using coverage_*_before columns.

BEGIN;

UPDATE fleet.import_batches b
SET
  coverage_start = b.coverage_start_before,
  coverage_end = b.coverage_end_before
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND b.coverage_start_before IS NOT NULL;

COMMIT;

\echo '--- Restored rows with _before set ---'
SELECT count(*) AS restored_rows
FROM fleet.import_batches b
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.coverage_start_before IS NOT NULL;
