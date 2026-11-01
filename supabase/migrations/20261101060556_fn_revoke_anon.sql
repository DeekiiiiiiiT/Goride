REVOKE ALL ON FUNCTION public.next_maintenance_log_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_maintenance_schedule(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_maintenance_nightly_check(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_parts_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.universal_section_for_variant(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
