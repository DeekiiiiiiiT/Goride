-- A-11: backfill ledger.driver_settlement_transactions from fleet.transactions
-- Applied 2026-09-01 via MCP (715 rows, parity misses=0).
-- Re-runnable / idempotent.

WITH src AS (
  SELECT
    COALESCE(payload_json->>'driverId', driver_id) AS driver_id,
    COALESCE(payload_json->>'id', id) AS transaction_id,
    COALESCE(
      NULLIF(payload_json->'metadata'->>'workPeriodStart',''),
      NULLIF(payload_json->'metadata'->>'periodAnchor',''),
      NULLIF(payload_json->'metadata'->>'settlementWeek',''),
      to_char(date_trunc('week', COALESCE((payload_json->>'date')::date, date))::date, 'YYYY-MM-DD')
    ) AS period_anchor,
    COALESCE(payload_json, jsonb_build_object(
      'id', id,
      'driverId', driver_id,
      'date', date,
      'type', type,
      'category', category,
      'amount', amount,
      'status', status
    )) AS payload,
    COALESCE(payload_json->>'category', category) AS cat,
    COALESCE(payload_json->>'type', type) AS typ,
    COALESCE(payload_json->>'description', '') AS descr,
    COALESCE(payload_json->>'paymentMethod', '') AS pm,
    COALESCE((payload_json->>'amount')::numeric, amount, 0) AS amt
  FROM fleet.transactions
  WHERE driver_id IS NOT NULL
),
classified AS (
  SELECT * FROM src
  WHERE
    cat = 'Toll Charge'
    OR ((typ = 'Cash_Write_Off' OR cat = 'Cash Write Off') AND amt > 0)
    OR (typ = 'Payout' AND cat = 'Driver Payouts' AND amt > 0)
    OR (
      pm <> 'Tag Balance'
      AND lower(descr) NOT LIKE '%top-up%'
      AND lower(cat) NOT IN ('toll usage','toll','tolls')
      AND lower(cat) NOT LIKE '%fuel%'
      AND lower(descr) NOT LIKE '%fuel%'
      AND lower(typ) NOT LIKE '%fuel%'
      AND (
        cat = 'Cash Collection' OR typ = 'Payment_Received'
        OR (lower(typ) = 'revenue' AND lower(cat) LIKE '%cash%')
        OR lower(descr) LIKE '%cash payment from driver%'
        OR lower(descr) LIKE '%cash collection from driver%'
      )
      AND amt > 0
    )
)
INSERT INTO ledger.driver_settlement_transactions (driver_id, period_anchor, transaction_id, payload, updated_at)
SELECT driver_id, LEFT(period_anchor, 10)::date, transaction_id, payload, now()
FROM classified
WHERE driver_id IS NOT NULL AND transaction_id IS NOT NULL AND period_anchor IS NOT NULL
ON CONFLICT (driver_id, transaction_id) DO UPDATE SET
  period_anchor = EXCLUDED.period_anchor,
  payload = EXCLUDED.payload,
  updated_at = now();
