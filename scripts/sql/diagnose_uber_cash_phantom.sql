-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnose phantom Uber "Cash Collected" (Fleet driver overview)
-- Table: public.kv_store_37f42386
-- Run each section separately in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A) Driver profile ─────────────────────────────────────────────────────
SELECT
  key,
  value->>'name' AS name,
  value->>'uberDriverId' AS uber_driver_id,
  value->>'inDriveDriverId' AS indrive_driver_id
FROM kv_store_37f42386
WHERE key = 'driver:73e5b1dc-01b4-45ee-a34a-25a3256b9841';


-- ── B) Driver import metrics (CSV cash override — most common culprit) ───
-- Change range_start / range_end to match the UI picker.
SELECT
  key,
  lower(value->>'driverId') AS driver_id,
  left(value->>'periodStart', 10) AS period_start,
  left(value->>'periodEnd', 10) AS period_end,
  (value->>'cashCollected')::numeric AS cash_collected,
  (value->>'uberPaymentsTransactionCashColumnSum')::numeric AS uber_tx_cash_sum,
  value->'dataSources' AS data_sources,
  CASE
    WHEN left(value->>'periodStart', 10)::date <= DATE '2026-06-20'
     AND left(value->>'periodEnd', 10)::date >= DATE '2026-06-16'
    THEN 'overlaps_old_rule'
    ELSE 'no_overlap'
  END AS old_overlap,
  CASE
    WHEN left(value->>'periodStart', 10)::date BETWEEN DATE '2026-06-16' AND DATE '2026-06-20'
    THEN 'matches_fixed_rule'
    ELSE 'no_match'
  END AS fixed_rule
FROM kv_store_37f42386
WHERE key LIKE 'driver_metric:%'
  AND lower(value->>'driverId') IN (
    '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
    lower((SELECT value->>'uberDriverId' FROM kv_store_37f42386 WHERE key = 'driver:73e5b1dc-01b4-45ee-a34a-25a3256b9841'))
  )
  AND (
    abs(coalesce((value->>'cashCollected')::numeric, 0)) > 100
    OR abs(coalesce((value->>'uberPaymentsTransactionCashColumnSum')::numeric, 0)) > 100
  )
ORDER BY left(value->>'periodStart', 10) DESC;


-- ── C) Canonical ledger Uber payout_cash / statement rows ─────────────────
SELECT
  key,
  value->>'eventType' AS event_type,
  left(value->>'date', 10) AS event_date,
  left(value->>'periodStart', 10) AS period_start,
  left(value->>'periodEnd', 10) AS period_end,
  (value->>'netAmount')::numeric AS net_amount,
  lower(value->>'driverId') AS driver_id,
  value->>'idempotencyKey' AS idempotency_key
FROM kv_store_37f42386
WHERE key LIKE 'ledger_event:%'
  AND value->>'platform' = 'Uber'
  AND value->>'eventType' IN ('payout_cash', 'payout_bank', 'statement_line')
  AND lower(value->>'driverId') IN (
    '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
    lower((SELECT value->>'uberDriverId' FROM kv_store_37f42386 WHERE key = 'driver:73e5b1dc-01b4-45ee-a34a-25a3256b9841'))
  )
ORDER BY left(coalesce(value->>'periodStart', value->>'date'), 10) DESC
LIMIT 30;


-- ── D) Find rows near $20,624.84 (the amount on your screenshot) ───────────
SELECT
  key,
  value->>'eventType' AS event_type,
  left(value->>'periodStart', 10) AS period_start,
  left(value->>'periodEnd', 10) AS period_end,
  left(value->>'date', 10) AS event_date,
  coalesce((value->>'cashCollected')::numeric, (value->>'netAmount')::numeric) AS amount
FROM kv_store_37f42386
WHERE lower(value->>'driverId') IN (
    '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
    lower((SELECT value->>'uberDriverId' FROM kv_store_37f42386 WHERE key = 'driver:73e5b1dc-01b4-45ee-a34a-25a3256b9841'))
  )
  AND abs(
    coalesce((value->>'cashCollected')::numeric, (value->>'netAmount')::numeric, 0) - 20624.84
  ) < 50
ORDER BY key;


-- ── E) Uber trips in Jun 16–20 (should be empty if no import for that week) ─
SELECT
  key,
  left(value->>'date', 10) AS trip_date,
  value->>'status' AS status,
  (value->>'amount')::numeric AS amount,
  (value->>'cashCollected')::numeric AS cash_collected
FROM kv_store_37f42386
WHERE key LIKE 'trip:%'
  AND value->>'platform' = 'Uber'
  AND lower(value->>'driverId') IN (
    '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
    lower((SELECT value->>'uberDriverId' FROM kv_store_37f42386 WHERE key = 'driver:73e5b1dc-01b4-45ee-a34a-25a3256b9841'))
  )
  AND left(value->>'date', 10)::date BETWEEN DATE '2026-06-16' AND DATE '2026-06-20';


-- ── OPTIONAL: delete a bad row after you identify `key` from B, C, or D ───
-- DELETE FROM kv_store_37f42386 WHERE key = 'driver_metric:REPLACE_ME';
-- DELETE FROM kv_store_37f42386 WHERE key = 'ledger_event:REPLACE_ME';
