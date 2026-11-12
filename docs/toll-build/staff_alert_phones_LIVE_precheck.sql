-- S1 live pre-check (read-only, changes nothing): can the server's API reach the fleet schema,
-- and is the new table not there yet?
SELECT jsonb_pretty(jsonb_build_object(
  -- the schemas the API exposes (must include fleet)
  'api_exposed_schemas', (SELECT string_agg(c, ', ') FROM pg_roles r, unnest(r.rolconfig) c
                          WHERE r.rolname = 'authenticator' AND c LIKE 'pgrst.db_schemas=%'),
  'service_role_can_use_fleet', has_schema_privilege('service_role', 'fleet', 'USAGE'),
  'table_already_there', to_regclass('fleet.staff_alert_phones') IS NOT NULL,
  'migration_already_logged', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261112210943')
)) AS s1_live_precheck;
