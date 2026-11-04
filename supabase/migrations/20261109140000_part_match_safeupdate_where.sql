-- Part matching under PostgREST.
-- The authenticator role preloads `safeupdate`, which rejects any DELETE without a WHERE clause
-- ("DELETE requires a WHERE clause", 21000) - including DELETEs inside PL/pgSQL. The matcher clears
-- its session temp tables (_pm_scope, _pm_batch_scope) with bare `DELETE FROM _pm_x;`, so every
-- app/API write that triggers a recompute failed. The SQL editor has no safeupdate, which is why
-- parts_auto_match_checks.sql never saw it. Add `WHERE true` to each of those deletes.
-- Rewrites the live function bodies in place so nothing else in them changes.

DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'part_match%'
      AND p.prosrc ~* 'DELETE\s+FROM\s+_pm_[a-z_]+\s*;'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '(DELETE\s+FROM\s+_pm_[a-z_]+)\s*;', '\1 WHERE true;', 'gi');
    EXECUTE v_new;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname LIKE 'part_match%'
      AND p.prosrc ~* 'DELETE\s+FROM\s+_pm_[a-z_]+\s*;'
  ) THEN
    RAISE EXCEPTION 'part_match functions still contain a DELETE without WHERE';
  END IF;
END;
$$;
