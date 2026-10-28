-- These three views were recreated after the invoker hotfix and lost the flag.
-- Match every other public.fleet_* view so callers use their own permissions.
alter view if exists public.fleet_expense_journal set (security_invoker = true);
alter view if exists public.fleet_fuel_entries set (security_invoker = true);
alter view if exists public.fleet_vehicles set (security_invoker = true);

notify pgrst, 'reload schema';
