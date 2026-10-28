-- N-01: restore security_invoker on views recreated bare by later migrations
-- N-05: re-backfill net_to_driver with correct decimal regex
-- Explicit ALTER lines (not only DO/EXECUTE) so assert-fleet-view-invoker can see them.

ALTER VIEW IF EXISTS public.fleet_ledger_entries SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_trips SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_delivery_details SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_expense_journal SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_fuel_entries SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_maintenance_logs SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_toll_ledger SET (security_invoker = true);
ALTER VIEW IF EXISTS public.fleet_workforce_invites SET (security_invoker = true);

REVOKE ALL ON TABLE public.fleet_ledger_entries FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_trips FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_delivery_details FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_expense_journal FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_fuel_entries FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_maintenance_logs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_toll_ledger FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_workforce_invites FROM PUBLIC, anon;

-- Decimal money must match (was \\. which required a literal backslash)
UPDATE fleet.trips
SET net_to_driver = (payload_json->>'netToDriver')::numeric
WHERE net_to_driver IS NULL
  AND payload_json->>'netToDriver' ~ '^-?[0-9]+(\.[0-9]+)?$';
