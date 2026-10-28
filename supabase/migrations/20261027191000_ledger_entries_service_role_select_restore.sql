-- L-10 soft landing: service_role still needs SELECT on public.ledger_entries for
-- single-row / count / keyset doctor paths. Bulk select("*") + OFFSET is banned in CI (L-14).
-- Authenticated remains revoked.

grant select on public.ledger_entries to service_role;
