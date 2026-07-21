-- Per-driver dispatch pilot allowlist for staged fleet rollout.
-- When rides.dispatch_settings.independent_only_matching is TRUE, a fleet
-- driver with dispatch_pilot = TRUE can still go online / receive offers.

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS dispatch_pilot BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.driver_profiles.dispatch_pilot IS
  'Staged rollout: allows this driver into Roam passenger dispatch even while independent_only_matching is on. Set by platform admins only.';

-- Client updates must not be able to self-enroll into dispatch: freeze the
-- column for end-user (authenticated/anon) sessions; service_role admin paths pass through.
CREATE OR REPLACE FUNCTION public.driver_profiles_freeze_dispatch_pilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IN ('authenticated', 'anon')
     AND NEW.dispatch_pilot IS DISTINCT FROM OLD.dispatch_pilot THEN
    NEW.dispatch_pilot := OLD.dispatch_pilot;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_profiles_freeze_dispatch_pilot ON public.driver_profiles;
CREATE TRIGGER trg_driver_profiles_freeze_dispatch_pilot
  BEFORE UPDATE ON public.driver_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.driver_profiles_freeze_dispatch_pilot();

NOTIFY pgrst, 'reload schema';
