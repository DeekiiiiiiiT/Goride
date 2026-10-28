-- Route-based toll estimation flag (additive; defaults OFF)
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS route_toll_estimation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rides.dispatch_settings.route_toll_estimation_enabled IS
  'When enabled, fare quotes use route polyline intersection with toll plazas instead of static fare-rule estimated_tolls_minor';

DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

NOTIFY pgrst, 'reload schema';
