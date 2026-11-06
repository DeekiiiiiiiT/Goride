-- Part cross-references / approvals import: "Part not in master catalog" did not say how to fix it.
-- A cross-reference can only attach to a part that already exists; the part is created by its area import
-- (e.g. Brakes) with at least one car it fits. Say that in the row error. Message text only — no logic change.

DO $$
DECLARE
  r record;
  v_def text;
  v_old text := '''Part not in master catalog''';
  v_new text := '''Part not in the parts database yet — upload it through its area import (e.g. Brakes) first, then upload this file again''';
  v_hits int := 0;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'part_import%'
      AND p.prosrc LIKE '%' || v_old || '%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    EXECUTE replace(v_def, v_old, v_new);
    v_hits := v_hits + 1;
  END LOOP;
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'part_import functions: message "Part not in master catalog" not found; not changed';
  END IF;
END;
$$;
