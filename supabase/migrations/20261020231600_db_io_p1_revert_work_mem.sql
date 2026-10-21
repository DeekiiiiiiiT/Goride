-- INCIDENT 2026-10-20 22:50–23:16 UTC: full PostgREST outage caused by 20261020224911.
-- PostgREST applies impersonated-role settings via set_config and lowercased '8MB' to '8mb',
-- which Postgres rejects ("invalid value for parameter work_mem") → every service_role /
-- authenticated request returned 400. Reverted by hand at ~23:16 UTC; this file records it.
-- Do NOT re-add a unit-suffixed GUC to an API role. If retried, use a unitless integer
-- (work_mem = 8192, kB) and verify with a real REST request immediately after.
alter role service_role  reset work_mem;
alter role authenticated reset work_mem;
notify pgrst, 'reload config';
