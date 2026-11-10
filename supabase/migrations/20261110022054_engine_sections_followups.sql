-- Engine service sections — follow-ups found by CI after go-live (10 Nov 2026).
--
-- 1. The three guard trigger functions from 20261110001951 were created in public without revoking
--    EXECUTE from anon/authenticated (R4-01 rule). Trigger functions don't need it, so lock them down.
-- 2. Jobs added by older tools and test fixtures don't send default_action, which the
--    "every job has a default action" rule now requires. Fill it on insert using the plan's own rule
--    (D5b: a part type is a part that gets replaced; anything else is "other"). Dominion's Add job
--    always sends a value, so this only catches callers that predate the field.

REVOKE ALL ON FUNCTION public.trg_mjsg_system_id_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_mjsg_system_id_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mjs_section_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_mjs_section_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_mjsm_member_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_mjsm_member_guard() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_msc_default_action_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind = 'component' AND NEW.default_action IS NULL THEN
    NEW.default_action := CASE WHEN NEW.is_part IS TRUE THEN 'replace' ELSE 'other' END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_msc_default_action_fill() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_msc_default_action_fill() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_msc_default_action_fill ON public.maintenance_service_categories;
CREATE TRIGGER trg_msc_default_action_fill
  BEFORE INSERT ON public.maintenance_service_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_msc_default_action_fill();
