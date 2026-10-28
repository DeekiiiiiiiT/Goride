-- Lock dates are dates only, but they were readable across companies.
-- The server uses the service role, which bypasses row security.

REVOKE ALL ON TABLE public.finance_period_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.finance_period_locks TO service_role;

ALTER TABLE fleet.finance_period_locks ENABLE ROW LEVEL SECURITY;
