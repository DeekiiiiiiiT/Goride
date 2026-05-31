-- Hosted Supabase Realtime only exposes schemas like public, delivery, payments (not rides).
-- Store trip chat in public.ride_messages so clients can subscribe without schema errors.

CREATE TABLE IF NOT EXISTS public.ride_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('rider', 'driver')),
  body TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_messages_public_ride_created_idx
  ON public.ride_messages (ride_request_id, created_at ASC);

-- Copy any rows created in rides schema before this migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'rides' AND table_name = 'ride_messages'
  ) THEN
    INSERT INTO public.ride_messages (id, ride_request_id, sender_user_id, sender_role, body, created_at)
    SELECT id, ride_request_id, sender_user_id, sender_role, body, created_at
    FROM rides.ride_messages
    ON CONFLICT (id) DO NOTHING;

    DROP TABLE rides.ride_messages;
  END IF;
END $$;

COMMENT ON TABLE public.ride_messages IS 'P2P rider–driver chat (public schema for Realtime + RLS).';

ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_messages_participant_select ON public.ride_messages;
CREATE POLICY ride_messages_participant_select ON public.ride_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (r.rider_user_id = auth.uid() OR r.assigned_driver_user_id = auth.uid())
    )
  );

GRANT SELECT ON public.ride_messages TO authenticated;

ALTER TABLE public.ride_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'ride_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
