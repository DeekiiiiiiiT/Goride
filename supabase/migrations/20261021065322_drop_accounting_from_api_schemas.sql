-- Stop PostgREST from loading the unused accounting schema on every reload.
-- recon stays. Role timeouts are unchanged.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon';

notify pgrst, 'reload config';
