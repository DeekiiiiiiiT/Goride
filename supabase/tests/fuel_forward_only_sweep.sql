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
-- Fingerprint of everything up to 9 Nov (read-only). Re-run after go-live: every value must match.
-- Baseline on production, 22 Nov 2026 (before any push):
--   periods 44, locked 41, periods_fp e3c19541158649aeee24e955c5a74002,
--   fills_to_15nov 579, fills_fp 26729c0e7701fade3c46a2dbeabca7ae,
--   fuel_statements 137, statements_fp d5bd6e00872d2f2b51a486fe4ae2dd8e.
SELECT
  (SELECT count(*) FROM public.fuel_reconciliation_period WHERE week_start <= DATE '2026-11-09') AS periods,
  (SELECT count(*) FROM public.fuel_reconciliation_period WHERE status = 'locked' AND week_start <= DATE '2026-11-09') AS locked,
  (SELECT md5(string_agg(concat_ws('|', p.id, p.week_start, p.service_line, p.status, p.locked_at,
            p.total_spend, p.company_share, p.driver_share, s.version, s.inputs_hash), ',' ORDER BY p.id))
     FROM public.fuel_reconciliation_period p
     LEFT JOIN LATERAL (SELECT version, inputs_hash FROM public.fuel_week_snapshot x
                        WHERE x.period_id = p.id ORDER BY version DESC LIMIT 1) s ON true
     WHERE p.week_start <= DATE '2026-11-09') AS periods_fp,
  (SELECT count(*) FROM fleet.fuel_entries WHERE date <= DATE '2026-11-15') AS fills_to_15nov,
  (SELECT md5(string_agg(concat_ws('|', id, amount, liters, type), ',' ORDER BY id))
     FROM fleet.fuel_entries WHERE date <= DATE '2026-11-15') AS fills_fp,
  (SELECT count(*) FROM ledger.week_statements WHERE kind ILIKE '%fuel%' AND week_key <= '2026-11-09') AS fuel_statements,
  (SELECT md5(string_agg(concat_ws('|', id, version, status, amounts_minor::text, source_hash), ',' ORDER BY id))
     FROM ledger.week_statements WHERE kind ILIKE '%fuel%' AND week_key <= '2026-11-09') AS statements_fp;
