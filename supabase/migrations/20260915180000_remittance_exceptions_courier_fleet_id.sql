-- Remittance exceptions: stamp courier fleet when parking COD failures (CI fleet-stamp rule).
ALTER TABLE delivery.courier_remittance_exceptions
  ADD COLUMN IF NOT EXISTS courier_fleet_id uuid;

COMMENT ON COLUMN delivery.courier_remittance_exceptions.courier_fleet_id IS
  'Fleet org id when courier is fleet-mode; null for independent / unknown.';
