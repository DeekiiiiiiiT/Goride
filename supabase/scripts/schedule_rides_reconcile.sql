-- Optional: reference for scheduling matching reconciliation.
-- Requires RIDES_CRON_SECRET on the rides Edge function (redeploy after auth header fix).

-- curl example (use your anon key + cron secret; rotate secret if ever exposed):
-- curl -X POST "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/rides/v1/internal/reconcile-matching" \
--   -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
--   -H "apikey: YOUR_SUPABASE_ANON_KEY" \
--   -H "X-Rides-Cron-Secret: YOUR_RIDES_CRON_SECRET"

-- Expected response: {"ok":true,"processed":0}

-- Active ride watchdog (stale GPS alerts + optional no-show cancel):
-- curl -X POST "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/rides/v1/internal/reconcile-active-rides" \
--   -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
--   -H "apikey: YOUR_SUPABASE_ANON_KEY" \
--   -H "X-Rides-Cron-Secret: YOUR_RIDES_CRON_SECRET"

-- Expected response: {"ok":true,"rides":0,"no_show_cancelled":0,"stale_alerts":0}
