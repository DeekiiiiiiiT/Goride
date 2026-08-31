-- Toll round-trip cooldown as SSOT on dispatch settings (Toll Settings UI).
-- Also mirrored onto matching.policies when present.
--
-- NOTE: public.rides_dispatch_settings and public.matching_policies are VIEWS —
-- never ALTER TABLE them. Alter the base tables, then refresh the views.

ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS toll_round_trip_cooldown_ms INTEGER NOT NULL DEFAULT 300000
    CHECK (toll_round_trip_cooldown_ms BETWEEN 0 AND 3600000);

COMMENT ON COLUMN rides.dispatch_settings.toll_round_trip_cooldown_ms IS
  'Min ms between charging the same plaza again on one trip (round-trip / dwell guard).';

-- Expose new (+ any missing) columns through the public view used by edge functions.
DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings
  WITH (security_invoker = true)
AS
  SELECT * FROM rides.dispatch_settings;

GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

ALTER TABLE matching.policies
  ADD COLUMN IF NOT EXISTS toll_round_trip_cooldown_ms INTEGER NOT NULL DEFAULT 300000
    CHECK (toll_round_trip_cooldown_ms BETWEEN 0 AND 3600000);

DROP VIEW IF EXISTS public.matching_policies;
CREATE VIEW public.matching_policies
  WITH (security_invoker = true)
AS
  SELECT * FROM matching.policies;

GRANT SELECT, UPDATE ON public.matching_policies TO service_role;

NOTIFY pgrst, 'reload schema';
