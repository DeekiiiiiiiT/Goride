-- Optional: schedule matching reconciliation via pg_cron (requires extension + RIDES_CRON_SECRET on rides Edge).
-- Deploy rides function first, set RIDES_CRON_SECRET, then run this manually if pg_cron is enabled.

-- Example external curl (every 15s via your scheduler):
-- curl -X POST "$SUPABASE_URL/functions/v1/rides/v1/internal/reconcile-matching" \
--   -H "Authorization: Bearer $RIDES_CRON_SECRET"

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
  END IF;
END $$;
