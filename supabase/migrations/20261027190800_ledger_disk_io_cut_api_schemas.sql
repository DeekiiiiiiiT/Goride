-- Phase 7 / L-9: cut PostgREST exposed schemas to ones edge/browser actually call via REST.
-- Removed (no schema-scoped client usage found): freight, logistics, rush_money, risk,
-- rush_config, places, explorer.
-- Kept: public, graphql_public, delivery, payments, rides, platform, recon, geo.
-- Edge continues to use service-role clients for kept schemas; ledger stays unexposed.

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, platform, recon, geo';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
