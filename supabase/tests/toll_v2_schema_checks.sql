-- Toll v2 R1: schema, RLS, grants, current_company, append-only, week_statements.

BEGIN;

INSERT INTO auth.users (id, email)
SELECT 'b1111111-1111-4111-8111-111111111111'::uuid, 'toll-v2-schema-check@example.com'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = 'b1111111-1111-4111-8111-111111111111'::uuid
);

DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'charges', 'charge_changes', 'platform_trips', 'paybacks', 'allocations',
    'carried_facts', 'payback_unlinked_decisions', 'duplicate_reviews', 'decisions',
    'suggestions', 'tag_accounts', 'tag_topups', 'platform_settings', 'plaza_rules',
    'staff_company_access', 'switch_state', 'audit_log', 'match_queue'
  ];
  t text;
  missing text[];
  rel oid;
  v_nullable text;
  v_oid oid;
  v_priv text := 'SELECT,INSERT,UPDATE,DELETE';
  v_company uuid;
  v_test_org uuid := 'a1111111-1111-4111-8111-111111111101';
  v_decision_id uuid;
  v_org_b uuid := 'a2222222-2222-4222-8222-222222222202';
  v_decision_b_id uuid;
  v_charge_a_id uuid;
  v_fk record;
  v_first_fk_col text;
  v_caught boolean;
  v_idx record;
  v_attnum smallint;
  v_first_col text;
  v_key_cols int;
BEGIN
  -- 1. All 18 tables exist in toll
  SELECT array_agg(x ORDER BY x)
  INTO missing
  FROM unnest(expected_tables) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'toll' AND c.relname = x AND c.relkind = 'r'
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing toll tables: %', missing;
  END IF;

  -- 2. organization_id NOT NULL rules
  FOREACH t IN ARRAY expected_tables
  LOOP
    IF t = 'plaza_rules' THEN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'toll' AND table_name = t AND column_name = 'organization_id'
      ) THEN
        RAISE EXCEPTION 'plaza_rules must not have organization_id';
      END IF;
    ELSIF t = 'audit_log' THEN
      SELECT is_nullable INTO v_nullable
      FROM information_schema.columns
      WHERE table_schema = 'toll' AND table_name = t AND column_name = 'organization_id';
      IF v_nullable <> 'YES' THEN
        RAISE EXCEPTION 'audit_log.organization_id must be nullable';
      END IF;
    ELSE
      SELECT is_nullable INTO v_nullable
      FROM information_schema.columns
      WHERE table_schema = 'toll' AND table_name = t AND column_name = 'organization_id';
      IF v_nullable <> 'NO' THEN
        RAISE EXCEPTION '%.organization_id must be NOT NULL', t;
      END IF;
    END IF;
  END LOOP;

  -- 3. RLS enabled
  FOREACH t IN ARRAY expected_tables
  LOOP
    SELECT c.oid INTO rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'toll' AND c.relname = t;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rel) THEN
      RAISE EXCEPTION 'RLS off on toll.%', t;
    END IF;
  END LOOP;

  -- 4. Table privileges
  FOREACH t IN ARRAY expected_tables
  LOOP
    v_oid := to_regclass('toll.' || t);
    IF has_table_privilege('anon', v_oid, v_priv) THEN
      RAISE EXCEPTION 'anon has privilege on toll.%', t;
    END IF;
    IF has_table_privilege('service_role', v_oid, v_priv) THEN
      RAISE EXCEPTION 'service_role has privilege on toll.%', t;
    END IF;
    IF t = 'audit_log' THEN
      IF has_table_privilege('authenticated', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'authenticated must not SELECT audit_log';
      END IF;
    ELSE
      IF NOT has_table_privilege('authenticated', v_oid, 'SELECT') THEN
        RAISE EXCEPTION 'authenticated missing SELECT on toll.%', t;
      END IF;
      IF has_table_privilege('authenticated', v_oid, 'INSERT')
        OR has_table_privilege('authenticated', v_oid, 'UPDATE')
        OR has_table_privilege('authenticated', v_oid, 'DELETE') THEN
        RAISE EXCEPTION 'authenticated has write privilege on toll.%', t;
      END IF;
    END IF;
  END LOOP;

  -- 5. Unique indexes / PKs start with organization_id (except plaza_rules)
  FOR v_idx IN
    SELECT c.relname AS tbl, i.relname AS idxname, ix.indrelid, ix.indexrelid, ix.indkey, ix.indisunique, ix.indisprimary
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'toll'
      AND c.relname = ANY(expected_tables)
      AND c.relname <> 'plaza_rules'
      AND (ix.indisunique OR ix.indisprimary)
  LOOP
    SELECT cardinality(string_to_array(trim(both ' ' from v_idx.indkey::text), ' ')::smallint[]),
           (
             SELECT a.attname
             FROM pg_attribute a
             WHERE a.attrelid = v_idx.indrelid
               AND a.attnum = (string_to_array(trim(both ' ' from v_idx.indkey::text), ' ')::smallint[])[1]
               AND NOT a.attisdropped
           )
    INTO v_key_cols, v_first_col;

    IF v_first_col IS NULL THEN
      RAISE EXCEPTION 'index % on % has no first column', v_idx.idxname, v_idx.tbl;
    END IF;

    IF v_idx.indisprimary AND v_key_cols = 1 AND v_first_col = 'id' THEN
      CONTINUE;
    END IF;

    IF v_first_col <> 'organization_id' THEN
      RAISE EXCEPTION 'index % on toll.% must start with organization_id', v_idx.idxname, v_idx.tbl;
    END IF;
  END LOOP;

  -- 6. toll_read.current_company()
  PERFORM set_config('request.jwt.claims', '', true);
  IF toll_read.current_company() IS NOT NULL THEN
    RAISE EXCEPTION 'current_company() should be NULL with no JWT';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('app_metadata', json_build_object('organizationId', v_test_org::text))::text,
    true
  );
  v_company := toll_read.current_company();
  IF v_company IS DISTINCT FROM v_test_org THEN
    RAISE EXCEPTION 'current_company() expected % got %', v_test_org, v_company;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('user_metadata', json_build_object('organizationId', v_test_org::text))::text,
    true
  );
  IF toll_read.current_company() IS NOT NULL THEN
    RAISE EXCEPTION 'current_company() must ignore user_metadata';
  END IF;

  -- 7. decisions append-only
  INSERT INTO toll.decisions (
    organization_id, command_id, intent, actor
  ) VALUES (
    v_test_org, 'toll-v2-schema-check-cmd', 'schema_check', 'user'
  ) RETURNING id INTO v_decision_id;

  v_caught := false;
  BEGIN
    UPDATE toll.decisions SET note = 'x' WHERE id = v_decision_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UPDATE on decisions should fail';
  END IF;

  v_caught := false;
  BEGIN
    DELETE FROM toll.decisions WHERE id = v_decision_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'DELETE on decisions should fail';
  END IF;

  -- 8. ledger.week_statements toll_week driver_id rule
  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (
    v_test_org,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    'toll-v2-schema-check-org',
    'toll-v2-schema-check',
    'fleet',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO ledger.week_statements (
    kind, organization_id, driver_id, week_key, version, status
  ) VALUES (
    'toll_week', v_test_org, '*', '2026-01-06', 1, 'draft'
  );

  v_caught := false;
  BEGIN
    INSERT INTO ledger.week_statements (
      kind, organization_id, driver_id, week_key, version, status
    ) VALUES (
      'toll_week', v_test_org, 'driver-real', '2026-01-06', 1, 'draft'
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'toll_week with real driver_id should fail';
  END IF;

  v_caught := false;
  BEGIN
    INSERT INTO ledger.week_statements (
      kind, organization_id, driver_id, week_key, version, status
    ) VALUES (
      'toll', v_test_org, '*', '2026-01-06', 1, 'draft'
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'toll kind with driver_id * should fail';
  END IF;

  -- 9. Composite foreign keys: cross-company allocation blocked; same-company succeeds
  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (
    v_org_b,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    'toll-v2-schema-check-org-b',
    'toll-v2-schema-check-b',
    'fleet',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO toll.charges (
    organization_id, occurred_at, week_key, time_precision, amount_minor,
    paid_by, source, source_ref
  ) VALUES (
    v_test_org, now(), '2026-01-06', 'exact', 500,
    'tag', 'manual', 'toll-v2-schema-charge-a'
  ) RETURNING id INTO v_charge_a_id;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor)
  VALUES (v_org_b, 'toll-v2-schema-check-cmd-b', 'schema_check', 'user')
  RETURNING id INTO v_decision_b_id;

  v_caught := false;
  BEGIN
    INSERT INTO toll.allocations (
      organization_id, charge_id, bearer, amount_minor, decision_id
    ) VALUES (
      v_org_b, v_charge_a_id, 'driver', 500, v_decision_b_id
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'allocation for company B pointing at company A charge must fail FK';
  END IF;

  INSERT INTO toll.allocations (
    organization_id, charge_id, bearer, amount_minor, decision_id
  ) VALUES (
    v_test_org, v_charge_a_id, 'driver', 500, v_decision_id
  );

  -- 9b. Every foreign key on the 17 toll tables is two-column with organization_id first
  FOR v_fk IN
    SELECT c.conname, c.conrelid, c.conkey, cl.relname AS tbl
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'toll'
      AND cl.relname = ANY (expected_tables)
  LOOP
    IF array_length(v_fk.conkey, 1) <> 2 THEN
      RAISE EXCEPTION 'FK % on toll.% must have 2 columns, has %',
        v_fk.conname, v_fk.tbl, array_length(v_fk.conkey, 1);
    END IF;

    SELECT a.attname INTO v_first_fk_col
    FROM pg_attribute a
    WHERE a.attrelid = v_fk.conrelid
      AND a.attnum = v_fk.conkey[1]
      AND NOT a.attisdropped;

    IF v_first_fk_col IS DISTINCT FROM 'organization_id' THEN
      RAISE EXCEPTION 'FK % on toll.% must start with organization_id, starts with %',
        v_fk.conname, v_fk.tbl, v_first_fk_col;
    END IF;
  END LOOP;

  RAISE NOTICE 'toll_v2_schema_checks: ok';
END;
$$;

ROLLBACK;
