-- Manual evidence cleanup trigger (run when pg_cron cannot call edge functions directly).
-- Requires FLEET_CRON_SECRET and deployed evidence-cleanup function OR make-server internal route.
--
-- Example (replace URL and secret):
-- curl -X POST "$SUPABASE_URL/functions/v1/evidence-cleanup?dryRun=true" \
--   -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET"
--
-- Or via fleet server:
-- curl -X POST "$SUPABASE_URL/functions/v1/make-server-37f42386/internal/evidence-cleanup?dryRun=true" \
--   -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET"

SELECT 'Schedule evidence-cleanup via Supabase Dashboard → Edge Functions → Cron (0 3 * * *)' AS notice;
