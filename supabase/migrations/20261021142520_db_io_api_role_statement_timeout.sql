-- Disk IO closeout (docs/supabase-disk-io-optimization-plan.md).
-- authenticator was raised to 120000 by hand after the 22:48 reset so a schema
-- reload (3.4–4.3s) cannot time out. service_role had no timeout of its own and
-- inherited that 2-minute cap, so one stuck edge-function query could hold the
-- API pool. Give service_role a 30s cap. Unitless integers only — PostgREST
-- lowercases unit suffixes (8MB → 8mb) and Postgres rejects them.
-- Rollback: alter role service_role reset statement_timeout;
-- Do not reset authenticator; a rebuild must keep 120000, not the old 8s.
alter role authenticator set statement_timeout = 120000;
alter role service_role set statement_timeout = 30000;
notify pgrst, 'reload config';
