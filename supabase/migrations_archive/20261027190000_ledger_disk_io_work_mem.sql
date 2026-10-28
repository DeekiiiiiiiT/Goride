-- Unified ledger Disk IO audit Phase 0 / L-11.
-- Persist unitless work_mem on API roles (kB). Never use unit suffixes — PostgREST
-- lowercases them ('8MB' → '8mb') and Postgres rejects the GUC → full API outage.
-- Verify with a real REST request within 60s of apply (audit rule 1).

alter role service_role set work_mem = 8192;
alter role authenticated set work_mem = 8192;

notify pgrst, 'reload config';
