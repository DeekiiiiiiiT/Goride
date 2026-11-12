-- WRA-09 rehearsal: re-stamp Uber merged_import batches to Mon–Sun of their week_keys week.
-- Run on a private copy first. Not applied by migrations.

ALTER TABLE fleet.import_batches
  ADD COLUMN IF NOT EXISTS coverage_start_before date,
  ADD COLUMN IF NOT EXISTS coverage_end_before date;

\echo '--- Before: completed uber_bundle batches whose coverage is not Mon–Sun of week_keys[1] ---'
SELECT count(*) AS not_mon_sun_before
FROM fleet.import_batches b
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) >= 1
  AND (
    b.coverage_start IS DISTINCT FROM b.week_keys[1]
    OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6)
  );

\echo '--- Single-week batch count (expect 42 on prod snapshot) ---'
SELECT count(*) AS single_week_batches
FROM fleet.import_batches b
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) = 1;

\echo '--- Two-week batch count (expect 1: 16–23 Feb 2026) ---'
SELECT count(*) AS two_week_batches
FROM fleet.import_batches b
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) > 1;

BEGIN;

-- Preserve originals once.
UPDATE fleet.import_batches b
SET
  coverage_start_before = b.coverage_start,
  coverage_end_before = b.coverage_end
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) >= 1
  AND b.coverage_start_before IS NULL;

-- 42 one-week batches: anchor week = week_keys[1].
UPDATE fleet.import_batches b
SET
  coverage_start = b.week_keys[1],
  coverage_end = b.week_keys[1] + 6
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) = 1;

-- Spanning 16–23 Feb 2026 → week of 16 Feb 2026.
UPDATE fleet.import_batches b
SET
  coverage_start = date '2026-02-16',
  coverage_end = date '2026-02-22'
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) > 1
  AND b.week_keys @> ARRAY[date '2026-02-16']::date[];

COMMIT;

\echo '--- After: not Mon–Sun (expect 0) ---'
SELECT count(*) AS not_mon_sun_after
FROM fleet.import_batches b
WHERE b.source_id = 'uber_bundle'
  AND b.type = 'merged_import'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) >= 1
  AND (
    b.coverage_start IS DISTINCT FROM b.week_keys[1]
    OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6)
  );
