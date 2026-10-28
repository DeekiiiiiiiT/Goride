-- RLS Wave 1: security_invoker on wrapper views + ledger grant hygiene + driver GPS policy

-- ---------------------------------------------------------------------------
-- 1. Enable security_invoker on public wrapper views (definer bypass fix)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND (
        c.relname LIKE 'rides_%'
        OR c.relname IN (
          'ledger_accounts', 'ledger_entries', 'ledger_source_receipts',
          'financial_events', 'financial_allocations', 'financial_outbox',
          'driver_financial_periods', 'driver_financial_period_lines',
          'driver_directory_stats', 'toll_brain_policies', 'fuel_brain_policies'
        )
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip view %: %', r.name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Driver locations: own row OR active-trip rider/passenger
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rides_driver_locations_own_select ON rides.driver_locations;
CREATE POLICY rides_driver_locations_own_select ON rides.driver_locations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.assigned_driver_user_id = rides.driver_locations.user_id
        AND (r.rider_user_id = auth.uid() OR r.passenger_user_id = auth.uid())
        AND r.status IN (
          'driver_assigned',
          'driver_en_route_pickup',
          'driver_arrived_pickup',
          'on_trip'
        )
    )
  );

DROP VIEW IF EXISTS public.rides_driver_locations;
CREATE VIEW public.rides_driver_locations
WITH (security_invoker = true)
AS
SELECT
  user_id,
  lat,
  lng,
  heading_degrees,
  available_for_rides,
  body_type_slug,
  h3_cell,
  updated_at
FROM rides.driver_locations;

REVOKE ALL ON public.rides_driver_locations FROM anon;
GRANT SELECT ON public.rides_driver_locations TO authenticated, service_role;

-- Ensure ride_requests view is invoker (recreate preserves SELECT *)
DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests
WITH (security_invoker = true)
AS
SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Bare ledger views: clients must use ledger_scoped_* instead
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.ledger_accounts FROM authenticated;
REVOKE SELECT ON public.ledger_entries FROM authenticated;
REVOKE SELECT ON public.ledger_source_receipts FROM authenticated;

NOTIFY pgrst, 'reload schema';
