-- service_line was added to fleet.* tables in 20260901130200 without refreshing
-- public.fleet_* views. PostgREST writes through the stale views reject service_line
-- and drop new fuel fill-ups (Transaction Logs empty for current week).

CREATE OR REPLACE VIEW public.fleet_fuel_entries AS
  SELECT * FROM fleet.fuel_entries;

CREATE OR REPLACE VIEW public.fleet_expense_journal AS
  SELECT * FROM fleet.expense_journal;

CREATE OR REPLACE VIEW public.fleet_toll_ledger AS
  SELECT * FROM fleet.toll_ledger;

CREATE OR REPLACE VIEW public.fleet_trips AS
  SELECT * FROM fleet.trips;

GRANT SELECT ON public.fleet_fuel_entries TO authenticated;
GRANT ALL ON public.fleet_fuel_entries TO service_role;

GRANT SELECT ON public.fleet_expense_journal TO authenticated;
GRANT ALL ON public.fleet_expense_journal TO service_role;

GRANT SELECT ON public.fleet_toll_ledger TO authenticated;
GRANT ALL ON public.fleet_toll_ledger TO service_role;

GRANT SELECT ON public.fleet_trips TO authenticated;
GRANT ALL ON public.fleet_trips TO service_role;
