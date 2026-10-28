-- Phase 6: Enroute toll detection setting
-- Additive, defaults FALSE so existing behavior is unchanged.

ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS toll_detect_enroute BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rides.dispatch_settings.toll_detect_enroute IS
  'When true, also detect tolls crossed while en route to pickup (deadhead), not only on-trip.';

-- Refresh the public view so the new column is exposed.
DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

NOTIFY pgrst, 'reload schema';
