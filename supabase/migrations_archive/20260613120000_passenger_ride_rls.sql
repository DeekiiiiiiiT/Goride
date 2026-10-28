-- Delegated passengers can read their active ride rows (Realtime + direct select).

DROP POLICY IF EXISTS rides_requests_passenger_select ON rides.ride_requests;
CREATE POLICY rides_requests_passenger_select ON rides.ride_requests
  FOR SELECT TO authenticated
  USING (
    rider_user_id = auth.uid()
    OR assigned_driver_user_id = auth.uid()
    OR passenger_user_id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
