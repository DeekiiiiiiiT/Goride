-- Irreversible wipe of ALL delivery.orders + related Rush money (pre-launch).
-- Does NOT touch GoRide fleet ledger, merchants, menus, or pricing profiles.
-- Run once against production before the pricing architecture rebuild.

BEGIN;

CREATE TEMP TABLE _wipe_orders ON COMMIT DROP AS
SELECT id::text AS id_text, id
FROM delivery.orders;

-- 1) Unlock courier availability
UPDATE delivery.courier_availability
SET active_order_id = NULL
WHERE active_order_id IN (SELECT id FROM _wipe_orders);

-- 2) COD events + reset balances for affected couriers
CREATE TEMP TABLE _wipe_couriers ON COMMIT DROP AS
SELECT DISTINCT courier_id
FROM delivery.courier_cash_events
WHERE order_id IN (SELECT id FROM _wipe_orders)
  AND courier_id IS NOT NULL;

DELETE FROM delivery.courier_cash_events
WHERE order_id IN (SELECT id FROM _wipe_orders);

UPDATE delivery.courier_cash_balances b
SET
  balance_jmd = 0,
  is_paused = false,
  paused_at = NULL,
  updated_at = now()
WHERE b.courier_id IN (SELECT courier_id FROM _wipe_couriers);

-- 3) Unified ledger entries for Dash order captures
SELECT public.ledger_delete_entries(
  'order',
  (SELECT coalesce(array_agg(id_text), ARRAY[]::text[]) FROM _wipe_orders),
  NULL,
  NULL,
  'dash_payments'
);

-- 4) GCT output tax soft refs
DELETE FROM accounting.gct_output_tax
WHERE source_doc_type IN ('delivery_order', 'delivery_order_platform')
  AND source_doc_id = ANY (SELECT id_text FROM _wipe_orders);

-- 5) Idempotency keys (no FK)
DELETE FROM delivery.order_idempotency_keys
WHERE order_id IN (SELECT id FROM _wipe_orders);

-- 6) Orders (CASCADE: payments, events, chat, offers, etc.)
DELETE FROM delivery.orders
WHERE id IN (SELECT id FROM _wipe_orders);

COMMIT;

-- Verify (run after COMMIT)
-- SELECT (SELECT count(*) FROM delivery.orders) AS orders_left,
--   (SELECT count(*) FROM delivery.courier_cash_events WHERE order_id IS NOT NULL) AS cash_events_with_order,
--   (SELECT count(*) FROM delivery.order_idempotency_keys) AS idempotency_keys,
--   (SELECT count(*) FROM accounting.gct_output_tax
--     WHERE source_doc_type IN ('delivery_order', 'delivery_order_platform')) AS gct_delivery_rows,
--   (SELECT count(*) FROM ledger.entries WHERE reference_type = 'order') AS order_ledger_entries;
