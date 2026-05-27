-- Backfill rides.ledger_lines for completed rides that predate the completion hook.
-- Run once after deploying ledger_lines migration + ride completion hook.

INSERT INTO rides.ledger_lines (
  ride_request_id,
  line_kind,
  description,
  reporting_at,
  paid_to_you_minor,
  earnings_gross_minor,
  cash_collected_minor,
  bank_transferred_minor,
  fare_breakdown,
  payment_method,
  driver_user_id,
  rider_user_id,
  idempotency_key
)
SELECT
  r.id,
  'fare_earning',
  'Roam trip fare (backfill)',
  COALESCE(r.completed_at, r.updated_at, r.created_at),
  COALESCE(r.driver_net_minor, r.fare_final_minor, r.fare_estimate_minor, 0),
  COALESCE(r.fare_final_minor, r.fare_estimate_minor, 0),
  CASE WHEN COALESCE(r.payment_method, 'cash') = 'cash'
    THEN -COALESCE(r.fare_final_minor, r.fare_estimate_minor, 0)
    ELSE 0 END,
  CASE WHEN r.payment_method = 'card'
    THEN COALESCE(r.fare_final_minor, r.fare_estimate_minor, 0)
    ELSE 0 END,
  COALESCE(r.fare_final_breakdown, r.fare_breakdown, '{}'::jsonb),
  r.payment_method,
  r.assigned_driver_user_id,
  r.rider_user_id,
  'ride:' || r.id::text || '|fare_earning'
FROM rides.ride_requests r
WHERE r.status = 'completed'
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE rides.ride_requests r
SET
  fare_final_breakdown = COALESCE(r.fare_final_breakdown, r.fare_breakdown),
  platform_fee_minor = COALESCE(r.platform_fee_minor, 0),
  tip_minor = COALESCE(r.tip_minor, 0),
  driver_net_minor = COALESCE(
    r.driver_net_minor,
    r.fare_final_minor,
    r.fare_estimate_minor
  )
WHERE r.status = 'completed';

-- Cancelled rides: audit lines at $0
INSERT INTO rides.ledger_lines (
  ride_request_id,
  line_kind,
  description,
  reporting_at,
  paid_to_you_minor,
  earnings_gross_minor,
  cash_collected_minor,
  bank_transferred_minor,
  fare_breakdown,
  payment_method,
  driver_user_id,
  rider_user_id,
  idempotency_key
)
SELECT
  r.id,
  'trip_cancelled',
  'Roam trip cancelled (backfill) — ' || COALESCE(r.cancelled_by::text, 'unknown'),
  COALESCE(r.updated_at, r.created_at),
  0, 0, 0, 0,
  '{}'::jsonb,
  r.payment_method,
  r.assigned_driver_user_id,
  r.rider_user_id,
  'ride:' || r.id::text || '|cancelled'
FROM rides.ride_requests r
WHERE r.status = 'cancelled'
ON CONFLICT (idempotency_key) DO NOTHING;
