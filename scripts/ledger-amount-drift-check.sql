-- amount / recon mirror drift: typed column vs payload (F-26)
-- Expect all mismatch counts = 0 (or investigate non-zero rows).

-- Trips: amount + net_to_driver
SELECT
  'trips' AS domain,
  count(*) FILTER (WHERE amount IS DISTINCT FROM NULLIF(payload_json->>'amount', '')::numeric) AS amount_mismatch,
  count(*) FILTER (
    WHERE net_to_driver IS DISTINCT FROM NULLIF(payload_json->>'netToDriver', '')::numeric
  ) AS net_mismatch,
  NULL::bigint AS is_reconciled_mismatch,
  NULL::bigint AS trip_id_mismatch,
  count(*) AS total_rows
FROM fleet.trips
WHERE payload_json ? 'amount' OR payload_json ? 'netToDriver'

UNION ALL

-- Toll: is_reconciled / trip_id (payload vs typed — label/filter parity)
SELECT
  'toll_ledger' AS domain,
  NULL::bigint AS amount_mismatch,
  NULL::bigint AS net_mismatch,
  count(*) FILTER (
    WHERE is_reconciled IS DISTINCT FROM (
      CASE
        WHEN payload_json ? 'isReconciled' THEN (payload_json->>'isReconciled')::boolean
        ELSE NULL
      END
    )
  ) AS is_reconciled_mismatch,
  count(*) FILTER (
    WHERE COALESCE(NULLIF(BTRIM(trip_id::text), ''), NULL)
      IS DISTINCT FROM
      COALESCE(NULLIF(BTRIM(COALESCE(payload_json->>'tripId', payload_json->>'trip_id')), ''), NULL)
  ) AS trip_id_mismatch,
  count(*) AS total_rows
FROM fleet.toll_ledger
WHERE payload_json ? 'isReconciled'
   OR payload_json ? 'tripId'
   OR payload_json ? 'trip_id';
