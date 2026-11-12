-- Toll rebuild Phase 1, R0: read-only look at real Roam ride toll data. Changes NOTHING. One result row.
SELECT jsonb_pretty(jsonb_build_object(
  -- crossings detected by the Roam app
  'crossings_total', (SELECT count(*) FROM rides.ride_toll_crossings),
  'crossings_by_month', (SELECT coalesce(jsonb_object_agg(m, n), '{}'::jsonb) FROM (
      SELECT to_char(date_trunc('month', crossed_at), 'YYYY-MM') AS m, count(*) AS n
      FROM rides.ride_toll_crossings GROUP BY 1 ORDER BY 1) x),
  'rides_with_crossings_by_fleet_payment_status', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT r.organization_id, r.attribution_mode, r.payment_method, r.status, r.cash_settlement_outcome,
             count(DISTINCT r.id) AS rides, sum(r.actual_tolls_minor) AS actual_tolls_minor
      FROM rides.ride_requests r
      WHERE EXISTS (SELECT 1 FROM rides.ride_toll_crossings c WHERE c.ride_request_id = r.id)
      GROUP BY 1, 2, 3, 4, 5 ORDER BY rides DESC LIMIT 30) x),
  -- the rider pays the ESTIMATED toll in the quote, plus any extra if actual is higher
  'estimate_vs_actual_on_completed_rides', (SELECT jsonb_build_object(
      'rides_with_estimate', count(*) FILTER (WHERE est > 0),
      'rides_with_actual', count(*) FILTER (WHERE actual > 0),
      'estimate_but_no_crossing', count(*) FILTER (WHERE est > 0 AND actual = 0),
      'actual_above_estimate', count(*) FILTER (WHERE actual > est),
      'actual_below_estimate', count(*) FILTER (WHERE actual > 0 AND actual < est))
    FROM (SELECT coalesce((r.fare_breakdown ->> 'estimated_tolls_minor')::bigint, 0) AS est,
                 coalesce(r.actual_tolls_minor, 0) AS actual
          FROM rides.ride_requests r WHERE r.status = 'completed') y),
  -- card money goes to the fleet only when this is on; otherwise to the driver's wallet
  'fleets_with_fleet_payout_on', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]'::jsonb)
      FROM public.organizations WHERE fleet_org_payout_enabled),
  -- cash rides still waiting for their cash
  'rides_awaiting_cash_settlement', (SELECT count(*) FROM rides.ride_requests WHERE status = 'awaiting_cash_settlement'),
  'rides_currency', (SELECT coalesce(jsonb_object_agg(currency, n), '{}'::jsonb) FROM (
      SELECT currency, count(*) AS n FROM rides.ride_requests GROUP BY 1) z)
)) AS phase1_roam_live_look;
