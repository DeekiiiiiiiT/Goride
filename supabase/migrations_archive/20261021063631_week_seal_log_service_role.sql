-- Week close sync returned 500: the seal log view runs as the caller, and the
-- service role could read the view but not the table underneath it.
-- Grant the same read and write the view already intended. No role timeouts.

grant select, insert, update on table ledger.week_seal_log to service_role;
