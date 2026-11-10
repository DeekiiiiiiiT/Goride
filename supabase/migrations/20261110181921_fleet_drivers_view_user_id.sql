-- Rush road-clearance gate: delivery finds the courier's car through public.fleet_drivers,
-- but the view predates fleet.drivers.user_id. Append it (same columns, same order, + user_id).
CREATE OR REPLACE VIEW public.fleet_drivers
WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  name,
  email,
  phone,
  status,
  assigned_vehicle_id,
  uber_driver_id,
  indrive_driver_id,
  license_front_url,
  license_back_url,
  proof_of_address_url,
  fuel_scenario_id,
  legacy_kv_id,
  payload_json,
  created_at,
  updated_at,
  user_id
FROM fleet.drivers;
