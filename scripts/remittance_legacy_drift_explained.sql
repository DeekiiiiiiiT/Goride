-- R-10: Phase 2 soak gate — unexplained legacy↔remittance drift must be empty.
-- Explained drift = remittance ahead because legacy skipped (payment_status was not
-- pending_collection at delivery). Unexplained = fail soak.
--
-- Unexplained rows (must return 0 before starting / during soak):
SELECT d.*
FROM delivery.v_remittance_legacy_drift d
WHERE NOT EXISTS (
  SELECT 1
  FROM delivery.orders o
  WHERE o.courier_id = d.courier_id
    AND o.payment_method IN ('cash', 'cod')
    AND o.status IN ('delivered', 'completed')
    AND coalesce(o.payment_status, '') <> 'pending_collection'
    AND EXISTS (
      SELECT 1 FROM delivery.courier_remittance_events e
      WHERE e.order_id = o.id AND e.event_type = 'collected'
    )
    AND NOT EXISTS (
      SELECT 1 FROM delivery.courier_cash_events ce
      WHERE ce.order_id = o.id
    )
);

-- Ops note: expected legacy drift during dual-write is OK only when every row is
-- explained by the under-fire fix above. Do not require zero rows on
-- v_remittance_legacy_drift itself.
