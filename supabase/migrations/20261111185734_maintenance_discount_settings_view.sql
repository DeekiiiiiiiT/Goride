-- R-03 (service discount audit Rev 7): fleet-ops reads org settings through
-- public.fleet_organization_settings (the fleet schema is not exposed to PostgREST).
-- That view was built before maintenance_discount_enabled existed, so the switch
-- always read as off. Add the column at the end; CREATE OR REPLACE keeps grants.

CREATE OR REPLACE VIEW public.fleet_organization_settings
  WITH (security_invoker = true) AS
 SELECT id,
    organization_id,
    legacy_kv_id,
    payload_json,
    created_at,
    updated_at,
    maintenance_discount_enabled
   FROM fleet.organization_settings;

NOTIFY pgrst, 'reload schema';
