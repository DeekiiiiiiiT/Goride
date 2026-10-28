-- R2: restore the seven schemas cut by 20261027190800.
-- Edge still calls freight, logistics, rush_money, risk, rush_config, places, explorer
-- (Plug signup → explorer.signup_intent; Rush money; places; freight; logistics).
-- Same 15-schema list as 20261025171000 (fleet/fuel stay off the public API).

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon, geo, places, explorer';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
