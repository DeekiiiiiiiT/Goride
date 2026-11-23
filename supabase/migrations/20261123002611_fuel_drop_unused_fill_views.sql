-- F-07 (fuel enterprise audit): drop two unused fuel views.
--
-- Both views run as their owner (no security_invoker), so they skip row security on
-- fleet.fuel_entries / fuel periods, and both are granted SELECT to anon and authenticated.
-- Checked on production 22 Nov 2026: the logged-out role read all 549 rows of
-- week_fuel_fills. No code, view or function uses either view (repo grep + pg_depend).
-- week_fuel_fills also read the statement marker from the wrong place (top-level
-- importSource instead of metadata.importSource). The money engine merges card pairs with
-- isJaaStatementLedgerRow instead, so nothing is lost.
--
-- No data is stored in a view; dropping one changes no week's numbers.
-- No CASCADE: if anything did depend on them this migration fails instead of removing it.

DROP VIEW IF EXISTS public.week_fuel_fills;
DROP VIEW IF EXISTS public.fuel_weeks_missing_period;
