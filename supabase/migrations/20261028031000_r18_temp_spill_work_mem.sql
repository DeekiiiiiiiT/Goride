-- R18. Named spill that pg_stat_statements cannot see.
-- In the 24h before this change, cancelled statements were:
--   65  supabase_admin  metrics exporter scan of pg_stat_statements
--   33  supabase_admin  metrics exporter sum(calls)
--   16  authenticator   PostgREST schema-cache base_types / _pg_truetypid
-- Those time out after writing temp, so the bytes never land in statement stats.
-- supabase_admin is a reserved role; the migration role cannot change it.
-- The schema-cache queries run as authenticator, which we can set.
-- 65536 kB = 64MB, unitless (Rule 1). Per-request work stays on authenticated (8192).
-- reload config only. reload schema is itself one of these spills.

alter role authenticator set work_mem = 65536;

notify pgrst, 'reload config';
