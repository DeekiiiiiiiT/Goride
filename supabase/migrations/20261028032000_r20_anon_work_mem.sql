-- R20. Anonymous API must not inherit authenticator work_mem (65536 kB).
-- PostgREST connects as authenticator, then SET ROLE anon. Without its own
-- setting, every anonymous request can use 64 MB per sort on Nano (~0.5 GB RAM).
-- Rule 1: unitless kB only. Never '8MB' — PostgREST lowercases that to 8mb.

alter role anon set work_mem = 8192;

notify pgrst, 'reload config';
