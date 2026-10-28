-- Grant schema and table permissions for delivery + payments
-- to the Supabase API roles. RLS policies still control row-level access.
-- Created: 2026-05-12

-- DELIVERY SCHEMA
GRANT USAGE ON SCHEMA delivery TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA delivery TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA delivery TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA delivery TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA delivery
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA delivery
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA delivery
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- PAYMENTS SCHEMA
GRANT USAGE ON SCHEMA payments TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA payments TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA payments TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA payments TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA payments
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA payments
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA payments
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
