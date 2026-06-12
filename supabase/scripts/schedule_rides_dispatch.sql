-- Manual cron fallback when pg_cron is unavailable.
-- Edge: POST /v1/internal/dispatch-scheduled-rides (X-Rides-Cron-Secret)
-- Also runs matching for activated ride IDs.

SELECT public.rides_dispatch_due_scheduled_rides();
