-- Hybrid catalog matching: enrich pending requests with drivetrain / transmission /
-- fuel type so platform admins see exactly what the fleet operator entered.
--
-- These mirror the columns on `vehicle_catalog` and let the picker in the fleet UI
-- send the same disambiguators that the matcher already uses on the server side.

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD COLUMN IF NOT EXISTS proposed_drivetrain text,
  ADD COLUMN IF NOT EXISTS proposed_transmission text,
  ADD COLUMN IF NOT EXISTS proposed_fuel_type text;

COMMENT ON COLUMN public.vehicle_catalog_pending_requests.proposed_drivetrain
  IS 'Drivetrain hint from fleet operator (e.g. FWD, RWD, AWD, 4WD).';
COMMENT ON COLUMN public.vehicle_catalog_pending_requests.proposed_transmission
  IS 'Transmission hint from fleet operator (e.g. CVT, AT, MT, DCT).';
COMMENT ON COLUMN public.vehicle_catalog_pending_requests.proposed_fuel_type
  IS 'Fuel type hint from fleet operator (e.g. Gasoline, Diesel, Hybrid, EV).';
