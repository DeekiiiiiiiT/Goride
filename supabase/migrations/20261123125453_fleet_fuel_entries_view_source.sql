-- Fix (F-14 follow-up, 23 Nov 2026): 20261122165023 added fleet.fuel_entries.source, but the
-- public view the server writes through (public.fleet_fuel_entries, explicit column list) was
-- never given the column. Every fuel write sends `source` (fleet_domains.ts), so PostgREST
-- refused all fuel saves: "Could not find the 'source' column of 'fleet_fuel_entries'".
-- CREATE OR REPLACE keeps the same columns in the same order and adds `source` at the end;
-- grants, owner and security_invoker stay as they are.

CREATE OR REPLACE VIEW public.fleet_fuel_entries WITH (security_invoker = 'true') AS
 SELECT id,
    organization_id,
    date,
    vehicle_id,
    driver_id,
    card_id,
    amount,
    liters,
    type,
    entry_mode,
    payment_source,
    legacy_kv_id,
    payload_json,
    created_at,
    updated_at,
    odometer,
    transaction_id,
    service_line,
    service_line_source,
    service_line_set_at,
    service_line_set_by,
    source
   FROM fleet.fuel_entries;

NOTIFY pgrst, 'reload schema';
