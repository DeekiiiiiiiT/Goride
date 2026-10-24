-- Let the public catalog and explorer functions read their schemas through the API.
-- Anonymous clients still have no table grants. Fleet rows stay behind existing row security.

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon, geo, places, explorer, fleet, fuel';

NOTIFY pgrst, 'reload config';
