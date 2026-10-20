-- Week Reconciliation P0: import_batches coverage + semantic dedupe metadata.
-- See WEEK_RECONCILIATION_WIZARD_AUDIT.md §4.4 / WR-H2.

ALTER TABLE fleet.import_batches
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS service_line text,
  ADD COLUMN IF NOT EXISTS coverage_start date,
  ADD COLUMN IF NOT EXISTS coverage_end date,
  ADD COLUMN IF NOT EXISTS data_start date,
  ADD COLUMN IF NOT EXISTS data_end date,
  ADD COLUMN IF NOT EXISTS week_keys date[],
  ADD COLUMN IF NOT EXISTS file_sha256 text,
  ADD COLUMN IF NOT EXISTS semantic_key text,
  ADD COLUMN IF NOT EXISTS rows_parsed int,
  ADD COLUMN IF NOT EXISTS rows_committed int,
  ADD COLUMN IF NOT EXISTS rows_duplicate int,
  ADD COLUMN IF NOT EXISTS rows_rejected int,
  ADD COLUMN IF NOT EXISTS rows_spilled int,
  ADD COLUMN IF NOT EXISTS supersedes text REFERENCES fleet.import_batches (id);

COMMENT ON COLUMN fleet.import_batches.period_start IS
  'Deprecated for reconciliation coverage (Delete Center still uses period_start/period_end). Prefer coverage_start/coverage_end and data_start/data_end.';
COMMENT ON COLUMN fleet.import_batches.period_end IS
  'Deprecated for reconciliation coverage (Delete Center still uses period_start/period_end). Prefer coverage_start/coverage_end and data_start/data_end.';

CREATE INDEX IF NOT EXISTS fleet_import_batches_org_source_id_idx
  ON fleet.import_batches (organization_id, source_id)
  INCLUDE (week_keys);

-- Live semantic dedupe: code uses status=completed today; committed reserved for staged pipeline.
CREATE UNIQUE INDEX IF NOT EXISTS import_batches_semantic_live
  ON fleet.import_batches (organization_id, semantic_key)
  WHERE status IN ('completed', 'committed')
    AND semantic_key IS NOT NULL;

-- Parse YYYY-MM-DD from payload (camelCase + snake_case); Mon week_keys = fleet week (ADR 0007).
WITH parsed AS (
  SELECT
    b.id,
    b.organization_id,
    b.status,
    b.upload_date,
    b.created_at,
    b.record_count,
    coalesce(
      CASE
        WHEN NULLIF(b.payload_json->>'dataPeriodStart', '') ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(b.payload_json->>'dataPeriodStart', 10)::date
      END,
      CASE
        WHEN NULLIF(b.payload_json->>'data_period_start', '') ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(b.payload_json->>'data_period_start', 10)::date
      END,
      b.period_start
    ) AS data_start,
    coalesce(
      CASE
        WHEN NULLIF(b.payload_json->>'dataPeriodEnd', '') ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(b.payload_json->>'dataPeriodEnd', 10)::date
      END,
      CASE
        WHEN NULLIF(b.payload_json->>'data_period_end', '') ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(b.payload_json->>'data_period_end', 10)::date
      END,
      b.period_end
    ) AS data_end
  FROM fleet.import_batches b
  WHERE b.type = 'merged_import'
),
enriched AS (
  SELECT
    p.*,
    'uber_bundle'::text AS source_id,
    p.data_start AS coverage_start,
    p.data_end AS coverage_end,
    CASE
      WHEN p.organization_id IS NOT NULL
        AND p.data_start IS NOT NULL
        AND p.data_end IS NOT NULL
      THEN
        'uber:'
        || p.organization_id
        || ':'
        || p.data_start::text
        || ':'
        || p.data_end::text
      ELSE NULL
    END AS semantic_key_candidate,
    CASE
      WHEN p.data_start IS NOT NULL AND p.data_end IS NOT NULL
      THEN (
        SELECT array_agg(wk ORDER BY wk)
        FROM (
          SELECT generate_series(
            p.data_start - (EXTRACT(ISODOW FROM p.data_start)::int - 1),
            p.data_end - (EXTRACT(ISODOW FROM p.data_end)::int - 1),
            interval '7 days'
          )::date AS wk
        ) series
      )
      ELSE NULL
    END AS week_keys
  FROM parsed p
),
ranked AS (
  SELECT
    e.id,
    row_number() OVER (
      PARTITION BY e.organization_id, e.semantic_key_candidate
      ORDER BY coalesce(e.upload_date, e.created_at) DESC NULLS LAST, e.id DESC
    ) AS sk_rn
  FROM enriched e
  WHERE e.semantic_key_candidate IS NOT NULL
    AND e.status IN ('completed', 'committed')
)
UPDATE fleet.import_batches b
SET
  source_id = e.source_id,
  coverage_start = e.coverage_start,
  coverage_end = e.coverage_end,
  data_start = e.data_start,
  data_end = e.data_end,
  week_keys = e.week_keys,
  semantic_key = CASE
    WHEN e.semantic_key_candidate IS NULL THEN b.semantic_key
    WHEN e.status IN ('completed', 'committed') AND r.sk_rn = 1 THEN e.semantic_key_candidate
    ELSE NULL
  END,
  rows_committed = coalesce(b.rows_committed, b.record_count)
FROM enriched e
LEFT JOIN ranked r ON r.id = e.id
WHERE b.id = e.id;

CREATE OR REPLACE VIEW public.fleet_import_batches
WITH (security_invoker = true) AS
  SELECT * FROM fleet.import_batches;

GRANT SELECT ON public.fleet_import_batches TO authenticated;
GRANT ALL ON public.fleet_import_batches TO service_role;

NOTIFY pgrst, 'reload schema';
