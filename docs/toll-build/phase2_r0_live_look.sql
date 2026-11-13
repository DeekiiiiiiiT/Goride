-- Toll rebuild Phase 2, R0: read-only look at the real toll data the v2 importers will read. Changes NOTHING.
-- One query, one result row.
SELECT jsonb_pretty(jsonb_build_object(
  -- the old toll ledger: what kinds of rows exist, per company
  'toll_ledger_by_kind', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'organization_id', x ->> 'type'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('organization_id', organization_id, 'type', type, 'payment_method', payment_method,
                                'rows', count(*), 'first', min(date), 'last', max(date),
                                'with_trip', count(*) FILTER (WHERE trip_id IS NOT NULL),
                                'with_ref', count(*) FILTER (WHERE coalesce(provider_ref, '') <> '')) AS x
      FROM fleet.toll_ledger
      WHERE coalesce(status, '') <> 'voided'
      GROUP BY organization_id, type, payment_method) t),
  -- rows per week (last 12 weeks), to see the weekly volume
  'toll_ledger_last_12_weeks', (SELECT coalesce(jsonb_object_agg(wk, n), '{}'::jsonb) FROM (
      SELECT date_trunc('week', date)::date::text AS wk, count(*) AS n FROM fleet.toll_ledger
      WHERE date >= current_date - 84 AND coalesce(status, '') <> 'voided' GROUP BY 1 ORDER BY 1) w),
  -- how often the same tag statement fingerprint appears twice (two genuine crossings that look alike)
  'tag_rows_same_vehicle_day_amount_plaza', (SELECT count(*) FROM (
      SELECT vehicle_id, date, amount, plaza FROM fleet.toll_ledger
      WHERE type = 'usage' AND payment_method ILIKE '%tag%' AND coalesce(status, '') <> 'voided'
      GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) d),
  -- trips that carry a platform toll payback, by platform and payment method
  'trips_with_toll_by_platform_payment', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('platform', platform, 'payment_method', payment_method, 'trips', count(*),
                                'toll_sum', sum(coalesce((payload_json ->> 'tollCharges')::numeric, 0)),
                                'negative_toll', count(*) FILTER (WHERE (payload_json ->> 'tollCharges')::numeric < 0)) AS x
      FROM fleet.trips
      WHERE coalesce((payload_json ->> 'tollCharges')::numeric, 0) <> 0
      GROUP BY platform, payment_method) t),
  -- Uber trips: do request and pickup times ever differ (is there a real pickup time)?
  'uber_trips_with_pickup_time', (SELECT count(*) FROM fleet.trips
      WHERE platform ILIKE 'uber' AND payload_json ? 'pickupTime'),
  -- Uber support adjustments (dispute refunds) in KV: count, and any negative amounts
  'dispute_refunds', (SELECT jsonb_build_object('rows', count(*),
                                                'negative', count(*) FILTER (WHERE (value ->> 'amount')::numeric < 0),
                                                'with_trip', count(*) FILTER (WHERE coalesce(value ->> 'tripId', '') <> ''))
                      FROM public.kv_store_37f42386 WHERE key LIKE 'dispute-refund:%' AND key NOT LIKE 'dispute-refund-dedup:%'),
  -- driver cash toll submissions waiting for approval
  'driver_cash_tolls_pending', (SELECT count(*) FROM fleet.toll_ledger
      WHERE payment_method ILIKE 'cash' AND coalesce(status, '') = 'pending'),
  'driver_cash_tolls_with_receipt', (SELECT count(*) FROM fleet.toll_ledger
      WHERE payment_method ILIKE 'cash' AND coalesce(payload_json ->> 'receiptUrl', '') <> '')
)) AS phase2_live_look;
