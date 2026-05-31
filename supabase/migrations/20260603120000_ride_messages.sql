-- P2P rider–driver chat messages for active trips (writes via rides edge only).

CREATE TABLE rides.ride_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('rider', 'driver')),
  body TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ride_messages_ride_created_idx
  ON rides.ride_messages (ride_request_id, created_at ASC);

COMMENT ON TABLE rides.ride_messages IS 'In-app text messages between rider and assigned driver during active trips.';

ALTER TABLE rides.ride_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rides_messages_participant_select ON rides.ride_messages;
CREATE POLICY rides_messages_participant_select ON rides.ride_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (r.rider_user_id = auth.uid() OR r.assigned_driver_user_id = auth.uid())
    )
  );

GRANT SELECT ON rides.ride_messages TO authenticated;

ALTER TABLE rides.ride_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'rides'
        AND tablename = 'ride_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE rides.ride_messages;
    END IF;
  END IF;
END $$;
