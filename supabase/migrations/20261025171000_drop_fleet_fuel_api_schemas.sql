-- Take fleet and fuel off the public API. Money tables in those schemas have no row
-- security, so a Plug phone session could read them. places and explorer stay,
-- and only the service role can use them.

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon, geo, places, explorer';

NOTIFY pgrst, 'reload config';
