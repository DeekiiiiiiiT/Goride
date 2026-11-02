-- Repo parity for part_import RPC privileges (prod already had these; CI reads migration files).
REVOKE ALL ON FUNCTION public.part_import_number_shape_unusual(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_promote(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_undo(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_validate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_validate_postprocess(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_import_validate_rows(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_import_number_shape_unusual(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_promote(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_undo(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_validate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_validate_postprocess(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_import_validate_rows(uuid, integer) TO service_role;
