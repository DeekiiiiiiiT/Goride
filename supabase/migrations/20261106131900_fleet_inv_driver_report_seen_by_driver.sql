-- P7: driver fixed-unseen tracking (audit Stage S)
ALTER TABLE fleet.inv_driver_report
  ADD COLUMN IF NOT EXISTS seen_by_driver_at timestamptz;

-- Refresh PostgREST bridge views so new columns are visible (SELECT * views do not auto-expand).
CREATE OR REPLACE VIEW public.fleet_inv_inv_driver_report WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_driver_report;

CREATE OR REPLACE VIEW public.fleet_inv_driver_report WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_driver_report;

REVOKE ALL ON public.fleet_inv_inv_driver_report, public.fleet_inv_driver_report
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_inv_driver_report, public.fleet_inv_driver_report
  TO service_role;
