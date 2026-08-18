-- Nightly finance lock controls (pg_cron + pg_net).
-- Applied on GoRide as:
--   fleet-finance-recon-nightly  0 4 * * * UTC
--   fleet-finance-doctor-nightly 10 4 * * * UTC
-- Secret lives in private.fleet_ops_secrets (name = fleet_cron_secret).
--
-- Immediate:
--   SELECT private.invoke_finance_recon();
--   SELECT private.invoke_finance_doctor();
--
-- Confirm:
--   SELECT ran_at, ok, drift_count FROM ledger.finance_recon_runs ORDER BY ran_at DESC LIMIT 5;
--   SELECT ran_at, ok, blocking, c1_clusters FROM ledger.finance_doctor_runs ORDER BY ran_at DESC LIMIT 5;

SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname IN ('fleet-finance-recon-nightly', 'fleet-finance-doctor-nightly')
ORDER BY jobname;
