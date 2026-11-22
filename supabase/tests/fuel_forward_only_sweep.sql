-- Done-test 10 (T10): production read-only sweep — weeks up to 9 Nov 2026 must show 0 fuel.week_lines.
-- Run manually on production only; not part of pnpm test:fuel (no _test.sql suffix).

SELECT
  p.id AS period_id,
  p.week_start,
  p.service_line,
  p.status,
  p.locked_at,
  p.total_spend,
  p.company_share,
  p.driver_share,
  snap.version AS snapshot_version,
  snap.inputs_hash AS snapshot_inputs_hash,
  COALESCE(
    snap.provenance ->> 'engineVersion',
    snap.provenance ->> 'engine_version',
    ''
  ) AS snapshot_engine_version,
  (
    SELECT count(*)::bigint
    FROM fuel.week_lines wl
    WHERE wl.period_id = p.id
  ) AS week_lines_count
FROM public.fuel_reconciliation_period p
LEFT JOIN LATERAL (
  SELECT s.version, s.inputs_hash, s.provenance
  FROM public.fuel_week_snapshot s
  WHERE s.org_id = p.org_id::text
    AND s.period_id = p.id
  ORDER BY s.version DESC
  LIMIT 1
) snap ON true
WHERE p.week_start <= DATE '2026-11-09'
ORDER BY p.week_start, p.service_line, p.id;