-- Passenger-owned saved places (Home, Work, favourites) for booking shortcuts.

CREATE TABLE IF NOT EXISTS rides.passenger_saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  address TEXT NOT NULL CHECK (char_length(trim(address)) > 0),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  icon TEXT NOT NULL DEFAULT 'saved' CHECK (icon IN (
    'home', 'work', 'saved', 'star', 'gym', 'school', 'coffee', 'hospital', 'location'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_saved_places_owner
  ON rides.passenger_saved_places(owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_passenger_saved_places_owner_home
  ON rides.passenger_saved_places(owner_user_id)
  WHERE icon = 'home';

CREATE UNIQUE INDEX IF NOT EXISTS idx_passenger_saved_places_owner_work
  ON rides.passenger_saved_places(owner_user_id)
  WHERE icon = 'work';

ALTER TABLE rides.passenger_saved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS passenger_saved_places_owner ON rides.passenger_saved_places;
CREATE POLICY passenger_saved_places_owner ON rides.passenger_saved_places
  FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE OR REPLACE VIEW public.rides_passenger_saved_places AS
  SELECT * FROM rides.passenger_saved_places;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_passenger_saved_places TO service_role;
