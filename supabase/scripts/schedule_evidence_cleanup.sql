-- Evidence cleanup daily schedule (pg_cron + pg_net).
-- Applied on GoRide as job `fleet-evidence-cleanup-daily` at 0 3 * * * UTC.
-- Secret lives in private.fleet_ops_secrets (name = fleet_cron_secret).
-- Edge function also accepts RIDES_CRON_SECRET / FLEET_CRON_SECRET via X-Fleet-Cron-Secret.
--
-- Manual dry-run:
--   curl -X POST "$SUPABASE_URL/functions/v1/evidence-cleanup?dryRun=true" \
--     -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET" \
--     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
--
-- Or via fleet server:
--   curl -X POST "$SUPABASE_URL/functions/v1/make-server-37f42386/internal/evidence-cleanup?dryRun=true" \
--     -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET"
--
-- Re-schedule (ops):
--   SELECT private.invoke_evidence_cleanup();  -- immediate
--   SELECT cron.schedule('fleet-evidence-cleanup-daily', '0 3 * * *', $$SELECT private.invoke_evidence_cleanup();$$);

SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'fleet-evidence-cleanup-daily';
