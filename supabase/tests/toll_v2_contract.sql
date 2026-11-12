-- Toll v2 R6: database contract guards (B7, B7.3, toll_system, search_path).

BEGIN;

DO $$
DECLARE
  r record;
  arg text;
BEGIN
  -- 1. No company/org parameter on authenticated-callable user entry points (B7).
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.proargnames
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (
        n.nspname IN ('toll_read', 'toll_write')
        OR (n.nspname = 'public' AND p.proname LIKE 'toll_v2\_%' ESCAPE '\')
      )
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    IF r.proargnames IS NULL THEN
      CONTINUE;
    END IF;
    FOREACH arg IN ARRAY r.proargnames
    LOOP
      IF lower(arg) LIKE '%company%'
        OR lower(arg) LIKE '%organization%'
        OR lower(arg) LIKE '%org%' THEN
        RAISE EXCEPTION 'contract B7: authenticated may EXECUTE %.% with company-like arg %',
          r.schema_name, r.func_name, arg;
      END IF;
    END LOOP;
  END LOOP;

  -- 2. service_role must not EXECUTE toll_write or public.toll_v2_% (B7.3).
  FOR r IN
    SELECT n.nspname, p.proname, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'toll_write'
       OR (n.nspname = 'public' AND p.proname LIKE 'toll_v2\_%' ESCAPE '\')
  LOOP
    IF has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'contract B7.3: service_role must not EXECUTE %.%', r.nspname, r.proname;
    END IF;
  END LOOP;

  -- 3. toll_system closed to authenticated and anon.
  FOR r IN
    SELECT p.proname, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'toll_system'
  LOOP
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'contract: authenticated must not EXECUTE toll_system.%', r.proname;
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'contract: anon must not EXECUTE toll_system.%', r.proname;
    END IF;
  END LOOP;

  -- 4. SECURITY DEFINER functions must set search_path (allow toll.tg_append_only only if non-definer).
  FOR r IN
    SELECT n.nspname, p.proname, p.proconfig, p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('toll', 'toll_read', 'toll_write', 'toll_system')
  LOOP
    IF r.nspname = 'toll' AND r.proname = 'tg_append_only' THEN
      IF r.prosecdef THEN
        RAISE EXCEPTION 'contract: toll.tg_append_only is SECURITY DEFINER — review allow-list';
      END IF;
      CONTINUE;
    END IF;
    IF NOT r.prosecdef THEN
      CONTINUE;
    END IF;
    IF r.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(r.proconfig) cfg WHERE cfg LIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION 'contract: SECURITY DEFINER %.% missing search_path in proconfig',
        r.nspname, r.proname;
    END IF;
  END LOOP;

  RAISE NOTICE 'toll_v2_contract: ok';
END;
$$;

ROLLBACK;
