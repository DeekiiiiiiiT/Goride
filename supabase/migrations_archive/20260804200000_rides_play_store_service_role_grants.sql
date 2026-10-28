-- Edge rides admin uses service_role on the rides schema directly.
-- Original play_store migration only granted public views.

GRANT SELECT, INSERT, UPDATE, DELETE ON rides.play_store_launch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON rides.play_store_releases TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_play_store_launch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_play_store_releases TO service_role;

NOTIFY pgrst, 'reload schema';
