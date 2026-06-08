-- Three-party chat: booker sender role + passenger read access.

ALTER TABLE public.ride_messages DROP CONSTRAINT IF EXISTS ride_messages_sender_role_check;

ALTER TABLE public.ride_messages
  ADD CONSTRAINT ride_messages_sender_role_check
  CHECK (sender_role IN ('rider', 'driver', 'booker'));

DROP POLICY IF EXISTS ride_messages_participant_select ON public.ride_messages;
CREATE POLICY ride_messages_participant_select ON public.ride_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (
          r.rider_user_id = auth.uid()
          OR r.assigned_driver_user_id = auth.uid()
          OR r.passenger_user_id = auth.uid()
        )
    )
  );

NOTIFY pgrst, 'reload schema';
