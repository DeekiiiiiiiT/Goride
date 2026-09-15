-- W-1: write_off must reduce receivable (never invent debt).
ALTER TABLE delivery.courier_remittance_events
  DROP CONSTRAINT IF EXISTS remittance_write_off_sign;

ALTER TABLE delivery.courier_remittance_events
  ADD CONSTRAINT remittance_write_off_sign
  CHECK (event_type <> 'write_off' OR amount_minor <= 0);

COMMENT ON CONSTRAINT remittance_write_off_sign ON delivery.courier_remittance_events IS
  'W-1: write_off amounts must be <= 0 (forgiveness); positive would invent debt.';
