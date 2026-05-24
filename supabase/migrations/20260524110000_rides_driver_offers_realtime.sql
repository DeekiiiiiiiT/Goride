-- Enable Realtime on driver_offers for instant offer pings in the driver app.

ALTER TABLE rides.driver_offers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'rides'
        AND tablename = 'driver_offers'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE rides.driver_offers;
    END IF;
  END IF;
END $$;
