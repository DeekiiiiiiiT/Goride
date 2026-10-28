-- Expose platform schema on hosted PostgREST (needed for identities, RBAC, invites).
-- Local: supabase/config.toml schemas list.

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform';

GRANT USAGE ON SCHEMA platform TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA platform TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA platform TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA platform TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA platform TO service_role;
GRANT SELECT ON platform.identity_personas TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA platform
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA platform
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA platform
  GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA platform
  GRANT ALL ON SEQUENCES TO service_role;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
