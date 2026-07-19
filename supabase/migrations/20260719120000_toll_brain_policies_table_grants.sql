-- Fix Toll Brain policies load after RLS Wave 1 security_invoker.
-- public.toll_brain_policies is security_invoker, so service_role must have
-- table privileges on toll.brain_policies (fuel.brain_policies already had these).
-- Without this, Dominion Toll Brain page shows:
-- "Could not load Toll Brain policies — deploy toll-brain Edge and apply migration."

GRANT SELECT, INSERT, UPDATE, DELETE ON toll.brain_policies TO service_role;
GRANT SELECT ON toll.brain_policies TO authenticated;

REVOKE ALL ON public.toll_brain_policies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.toll_brain_policies TO service_role;
GRANT SELECT ON public.toll_brain_policies TO authenticated;
