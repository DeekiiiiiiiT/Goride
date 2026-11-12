-- Week Reconciliation data rules 1–8 (Rev 15 §5). Empty result = pass for each query.

-- Rule 1: every ended Monday since first data week has a run per active line.
WITH orgs AS (
  SELECT DISTINCT organization_id::text AS org_id
  FROM recon.week_runs
),
grid AS (
  SELECT
    o.org_id,
    gs.week_key::date AS week_key,
    al.line
  FROM orgs o
  CROSS JOIN LATERAL (
    SELECT generate_series(
      recon.first_data_week(o.org_id),
      recon.last_ended_week_monday(),
      interval '7 days'
    )::date AS week_key
  ) gs
  CROSS JOIN LATERAL recon.active_recon_lines(o.org_id) al(line)
)
SELECT 'rule_1_missing_run' AS rule, g.*
FROM grid g
WHERE g.week_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM recon.week_runs wr
    WHERE wr.organization_id = g.org_id
      AND wr.service_line = g.line
      AND wr.week_key = g.week_key
  );

-- Rule 2 (corrected in Round 2a): step counts agree with the stored blockers.
-- The code list is SERVER_STEP_BY_BLOCKER (packages/finance-core/src/closeBlockerSteps.ts);
-- recon_data_checks_codemap.test.ts fails if the two differ.
--  * trips_earnings, settlement_preview, close: count = blocking rows (driver + whole-week)
--    once the week has calculator units.
--  * tolls, fuel: count >= blocking rows (they also count "statement not sealed yet").
--  * hidden steps: count = 0.
WITH code_step AS (
  SELECT * FROM (VALUES
('SOURCE_MISSING', 'sources'),
    ('SOURCE_PARTIAL', 'sources'),
    ('SOURCE_WAITING_EXTERNAL', 'sources'),
    ('SOURCE_WAIVED', 'sources'),
    ('SOURCE_ATTESTED_NONE', 'sources'),
    ('STEP_STALE', 'sources'),
    ('LINE_UNATTRIBUTED', 'attribution'),
    ('EARNINGS_STATEMENT_MISSING', 'trips_earnings'),
    ('EARNINGS_STATEMENT_UNVERIFIED', 'trips_earnings'),
    ('EARNINGS_ENGINE_DRIFT', 'trips_earnings'),
    ('EARNINGS_GROSS_IDENTITY', 'trips_earnings'),
    ('CASH_SOURCE_MISMATCH', 'trips_earnings'),
    ('CASH_COLLECTED_MISMATCH', 'trips_earnings'),
    ('TOLL_STATEMENT_MISSING', 'tolls'),
    ('TOLL_STATEMENT_UNVERIFIED', 'tolls'),
    ('TOLL_SPEND_MISMATCH', 'tolls'),
    ('TOLL_CHARGED_MISMATCH', 'tolls'),
    ('TOLL_IDENTITY_UNBALANCED', 'tolls'),
    ('TOLL_SPEND_SPLIT', 'tolls'),
    ('TOLL_EVENT_ORPHANED', 'tolls'),
    ('TOLL_EVENT_MISSING', 'tolls'),
    ('TOLL_EVENT_INELIGIBLE', 'tolls'),
    ('TOLL_EVENT_AMOUNT_MISMATCH', 'tolls'),
    ('TOLL_PAYMENT_METHOD_UNKNOWN', 'tolls'),
    ('TOLL_ENGINE_DRIFT', 'tolls'),
    ('TOLL_STALE_ZERO_SEAL', 'tolls'),
    ('FUEL_STATEMENT_MISSING', 'fuel'),
    ('FUEL_STATEMENT_UNVERIFIED', 'fuel'),
    ('FUEL_DRIVER_SHARE_MISMATCH', 'fuel'),
    ('FUEL_FLEET_SHARE_MISMATCH', 'fuel'),
    ('FUEL_ENGINE_DRIFT', 'fuel'),
    ('FUEL_CARD_STATEMENT_DRIFT', 'fuel'),
    ('SETTLEMENT_FLEET_OWES', 'settlement_preview'),
    ('SETTLEMENT_DRIVER_OWES', 'settlement_preview'),
    ('SETTLEMENT_CASH_HELD', 'settlement_preview'),
    ('CASH_HELD_OVER_RETURNED', 'settlement_preview'),
    ('STATEMENT_ACCOUNTS_UNBALANCED', 'close'),
    ('SETTLEMENT_PNL_MISMATCH', 'close'),
    ('BUSINESS_WEEK_PNL_UNAVAILABLE', 'close'),
    ('CUSTODY_NO_OPEN_TARGET', 'close'),
    ('PRIOR_CLOSE_HASH_CHANGED', 'close'),
    ('PERIOD_REBUILD_FAILED', 'close'),
    ('COVERAGE_WIDER_THAN_DATA', 'close'),
    ('EARLIER_WEEK_OPEN', 'close')
  ) AS t(code, step_id)
),
per_run AS (
  SELECT
    wr.id AS run_id,
    wr.organization_id,
    wr.week_key,
    wr.service_line,
    rs.step_id,
    rs.actionable,
    rs.hidden,
    EXISTS (
      SELECT 1 FROM recon.projection_state ps
      WHERE ps.organization_id = wr.organization_id AND ps.week_key = wr.week_key
    ) AS has_units,
    (
      SELECT count(*)::int
      FROM recon.week_blockers wb
      JOIN code_step cs ON cs.code = wb.code AND cs.step_id = rs.step_id
      WHERE wb.organization_id = wr.organization_id
        AND wb.week_key = wr.week_key
        AND wb.service_line = wr.service_line
        AND wb.severity = 'block'
    ) AS blocking_count
  FROM recon.week_runs wr
  JOIN recon.run_steps rs ON rs.run_id = wr.id
  WHERE wr.desk_snapshot IS NOT NULL
    AND wr.state IS DISTINCT FROM 'closed'
)
SELECT 'rule_2_step_blocker_mismatch' AS rule, *
FROM per_run
WHERE (hidden AND actionable <> 0)
   OR (NOT hidden AND has_units
       AND step_id IN ('trips_earnings', 'settlement_preview', 'close')
       AND actionable IS DISTINCT FROM blocking_count)
   OR (NOT hidden AND step_id IN ('tolls', 'fuel') AND actionable < blocking_count);

-- Rule 3: closed run must have closed_at and no whole-week blockers.
SELECT 'rule_3_closed_run_blockers' AS rule, wr.*
FROM recon.week_runs wr
WHERE wr.state = 'closed'
  AND (wr.closed_at IS NULL OR EXISTS (
    SELECT 1
    FROM recon.week_blockers wb
    WHERE wb.organization_id = wr.organization_id
      AND wb.week_key = wr.week_key
      AND wb.service_line = wr.service_line
      AND wb.driver_id IS NULL
      AND wb.severity = 'block'
  ));

-- Rule 4: completed statement uber batches should be Mon–Sun of week_keys[1].
SELECT 'rule_4_uber_coverage_span' AS rule, b.id, b.coverage_start, b.coverage_end, b.week_keys
FROM fleet.import_batches b
WHERE b.source_id = 'uber_bundle'
  AND b.status IN ('completed', 'committed')
  AND cardinality(b.week_keys) = 1
  AND (
    b.coverage_start IS DISTINCT FROM b.week_keys[1]
    OR b.coverage_end IS DISTINCT FROM (b.week_keys[1] + 6)
  );

-- Rule 5: every version a run reaches has a history row at that version.
-- Round 2b: a calculator publish ('calculator_publish') or a change claimed through
-- recon.claim_week_change (any other kind) both write one.
SELECT 'rule_5_version_without_event' AS rule, wr.id, wr.version
FROM recon.week_runs wr
WHERE wr.version > 1
  AND NOT EXISTS (
    SELECT 1
    FROM recon.run_events re
    WHERE re.run_id = wr.id
      AND re.version_at_send = wr.version::int
  );

-- Rule 6: append-only trigger — exercised in week_recon_round1_local_proof.sql

-- Rule 7: desk snapshot should carry inputsHash when computed.
SELECT 'rule_7_missing_inputs_hash' AS rule, wr.id
FROM recon.week_runs wr
WHERE wr.desk_snapshot IS NOT NULL
  AND wr.desk_computed_at IS NOT NULL
  AND NOT (
    (wr.desk_snapshot ? 'inputsHash')
    OR (wr.desk_snapshot ? 'inputs_hash')
  );

-- Rule 8: run open/closed vs driver period freeze (WRA-39).
SELECT 'rule_8_period_run_mismatch' AS rule,
  wr.organization_id,
  wr.service_line,
  wr.week_key,
  wr.state,
  recon.line_periods_all_frozen(wr.organization_id, wr.week_key, wr.service_line) AS periods_all_closed
FROM recon.week_runs wr
-- Only weeks that HAVE money periods are compared: a week with none (e.g. the
-- 4 old Delivery runs closed by legacy_cleanup) has nothing to disagree with.
WHERE (
  wr.state = 'closed'
  AND NOT recon.line_periods_all_frozen(wr.organization_id, wr.week_key, wr.service_line)
  AND EXISTS (
    SELECT 1
    FROM public.driver_financial_periods p
    WHERE p.organization_id::text = wr.organization_id
      AND p.period_anchor = wr.week_key
      AND public.dfp_service_line_matches(p.metadata, wr.service_line)
  )
) OR (
  wr.state IS DISTINCT FROM 'closed'
  AND recon.line_periods_all_frozen(wr.organization_id, wr.week_key, wr.service_line)
  AND EXISTS (
    SELECT 1
    FROM public.driver_financial_periods p
    WHERE p.organization_id::text = wr.organization_id
      AND p.period_anchor = wr.week_key
      AND public.dfp_service_line_matches(p.metadata, wr.service_line)
  )
);
