-- Production remittance cutover (no dual-write soak).
-- Authority: delivery.courier_remittance_* ; legacy courier_cash_* audit-only.
-- Emergency legacy writes: DELIVERY_COD_LEGACY_WRITE=1
-- Kill remittance: DELIVERY_REMITTANCE_OFF=1
--
-- Cutover checks (not "legacy drift empty"):
--   v_remittance_drift = 0
--   v_remittance_missing_collections = 0 (or triaged exceptions)
--   unresolved exceptions = 0
--   v_remittance_stale_pending = 0
-- Later optional: rename courier_cash_* → *_legacy (do not drop).

CREATE OR REPLACE VIEW delivery.v_remittance_stale_pending AS
SELECT id, reference, courier_id, amount_minor, method, created_at
FROM delivery.courier_remittance_settlements
WHERE status = 'pending'
  AND created_at < now() - interval '15 minutes';

GRANT SELECT ON delivery.v_remittance_stale_pending TO service_role;

COMMENT ON VIEW delivery.v_remittance_stale_pending IS
  'N-2: pending settlements older than 15m — operator believed settle posted but event never landed.';
