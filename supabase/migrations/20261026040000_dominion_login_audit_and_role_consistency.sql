-- Dominion login history, and a check that platform roles match the trusted app record.
-- The nightly job writes one audit row when they drift. It does not change any account.

CREATE TABLE IF NOT EXISTS platform.portal_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  portal text NOT NULL,
  email text,
  user_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('success', 'bad_password', 'no_platform_role')),
  ip_address text
);

CREATE INDEX IF NOT EXISTS portal_login_events_created_idx
  ON platform.portal_login_events (portal, created_at DESC);

ALTER TABLE platform.portal_login_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.portal_login_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE platform.portal_login_events TO service_role;

CREATE OR REPLACE FUNCTION platform.jwt_role_texts(meta jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT array_agg(DISTINCT role_name)
    FROM (
      SELECT btrim(meta->>'role') AS role_name
      WHERE COALESCE(btrim(meta->>'role'), '') <> ''
      UNION ALL
      SELECT btrim(elem) AS role_name
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(meta->'roles') = 'array' THEN meta->'roles'
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE COALESCE(btrim(elem), '') <> ''
    ) s
    WHERE role_name IS NOT NULL AND role_name <> ''
  ), '{}'::text[]);
$$;

-- Adds roles and removes roles. Never replaces the list with a single role.
CREATE OR REPLACE FUNCTION platform.merge_app_metadata_roles(
  meta jsonb,
  add_roles text[],
  remove_roles text[]
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  roles text[];
  primary_role text;
BEGIN
  roles := ARRAY(
    SELECT DISTINCT role_name
    FROM (
      SELECT unnest(platform.jwt_role_texts(meta)) AS role_name
      UNION ALL
      SELECT unnest(COALESCE(add_roles, '{}'::text[]))
    ) s
    WHERE role_name IS NOT NULL
      AND role_name <> ''
      AND NOT (role_name = ANY (COALESCE(remove_roles, '{}'::text[])))
  );

  primary_role := COALESCE(btrim(meta->>'role'), '');
  IF primary_role = ''
     OR primary_role = ANY (COALESCE(remove_roles, '{}'::text[]))
     OR NOT (primary_role = ANY (roles)) THEN
    primary_role := COALESCE(NULLIF(add_roles[1], ''), roles[1], '');
  END IF;

  RETURN jsonb_set(
    jsonb_set(COALESCE(meta, '{}'::jsonb), '{roles}', to_jsonb(roles), true),
    '{role}',
    to_jsonb(primary_role),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION platform.role_consistency_problems()
RETURNS TABLE(email text, jwt_roles text[], table_roles text[], problem text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = platform, auth, public
AS $$
  WITH per_user AS (
    SELECT u.email::text AS email,
           platform.jwt_role_texts(u.raw_app_meta_data) AS jwt_roles,
           COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS table_roles
    FROM auth.users u
    LEFT JOIN platform.user_roles ur
      ON ur.user_id = u.id
     AND (ur.expires_at IS NULL OR ur.expires_at > now())
    LEFT JOIN platform.roles r
      ON r.id = ur.role_id
     AND r.product_key IS NULL
    GROUP BY u.id, u.email, u.raw_app_meta_data
  ),
  drift AS (
    SELECT email, jwt_roles, table_roles,
           'platform role in the role table is missing from the trusted app record'::text AS problem
    FROM per_user
    WHERE (
      jwt_roles && ARRAY['platform_owner','platform_support','platform_analyst','superadmin']::text[]
      OR table_roles <> '{}'::text[]
    )
    AND NOT (table_roles <@ jwt_roles)
  ),
  owners AS (
    SELECT COUNT(DISTINCT ur.user_id)::int AS n
    FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE r.name = 'platform_owner'
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  )
  SELECT * FROM drift
  UNION ALL
  SELECT NULL::text, NULL::text[], NULL::text[],
         'expected exactly one platform_owner, found ' || n
  FROM owners
  WHERE n <> 1;
$$;

CREATE OR REPLACE FUNCTION platform.assert_role_consistency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, auth, public
AS $$
DECLARE
  problems text;
BEGIN
  SELECT string_agg(COALESCE(email, '(owner count)') || ': ' || problem, '; ')
  INTO problems
  FROM platform.role_consistency_problems();
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'Platform role consistency failed: %', problems;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION platform.record_role_consistency_nightly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, auth, public
AS $$
DECLARE
  problems text;
BEGIN
  SELECT string_agg(COALESCE(email, '(owner count)') || ': ' || problem, '; ')
  INTO problems
  FROM platform.role_consistency_problems();
  IF problems IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO platform.permission_audit_log (action, metadata)
  VALUES (
    'role.consistency_failed',
    jsonb_build_object('source', 'platform-role-consistency-nightly', 'problems', problems)
  );
END;
$$;

REVOKE ALL ON FUNCTION platform.jwt_role_texts(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.merge_app_metadata_roles(jsonb, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.role_consistency_problems() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform.assert_role_consistency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform.record_role_consistency_nightly() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.jwt_role_texts(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION platform.merge_app_metadata_roles(jsonb, text[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION platform.role_consistency_problems() TO service_role;
GRANT EXECUTE ON FUNCTION platform.assert_role_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION platform.record_role_consistency_nightly() TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('platform-role-consistency-nightly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'platform-role-consistency-nightly',
      '20 4 * * *',
      $cmd$SELECT platform.record_role_consistency_nightly();$cmd$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule platform-role-consistency-nightly manually.';
END;
$cron$;
