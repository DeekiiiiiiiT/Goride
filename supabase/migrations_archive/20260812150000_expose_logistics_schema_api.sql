-- Expose logistics schema on hosted PostgREST (PGRST106 if missing).
-- Local: supabase/config.toml already lists logistics under [api].schemas.

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics';

GRANT USAGE ON SCHEMA logistics TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA logistics TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA logistics TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA logistics TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA logistics TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA logistics
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA logistics
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA logistics
  GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA logistics
  GRANT ALL ON SEQUENCES TO service_role;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
