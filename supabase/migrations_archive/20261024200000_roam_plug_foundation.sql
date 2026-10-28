-- Roam Plug foundation.
-- Personal rows live in explorer. Island places live in places.
-- Gas stations stay in fleet.stations. Plug fills cannot enter fleet money tables.
-- Anonymous clients get no grants. Public reads go through platform-catalog.

ALTER TABLE fleet.stations
  ADD COLUMN IF NOT EXISTS origin_app text NOT NULL DEFAULT 'manual';

ALTER TABLE fleet.stations DROP CONSTRAINT IF EXISTS fleet_stations_origin_app_check;
ALTER TABLE fleet.stations
  ADD CONSTRAINT fleet_stations_origin_app_check
  CHECK (origin_app IN ('roam_fleet', 'roam_plug', 'manual'));

UPDATE fleet.stations
SET origin_app = 'roam_fleet'
WHERE COALESCE(payload_json->>'dataSource', '') = 'log'
  AND origin_app = 'manual';

CREATE INDEX IF NOT EXISTS fleet_stations_origin_app_idx ON fleet.stations (origin_app);

CREATE OR REPLACE FUNCTION fleet.reject_roam_plug_money_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  blob text := COALESCE(NEW.payload_json::text, '');
BEGIN
  IF blob LIKE '%"origin_app":"roam_plug"%'
     OR blob LIKE '%"originApp":"roam_plug"%'
     OR blob LIKE '%"source":"roam_plug"%' THEN
    RAISE EXCEPTION 'Roam Plug cannot write fleet money (%)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'fuel_entries',
    'fuel_cards',
    'fuel_adjustments',
    'fuel_disputes',
    'odometer_readings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_roam_plug_money ON fleet.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER reject_roam_plug_money BEFORE INSERT OR UPDATE ON fleet.%I
       FOR EACH ROW EXECUTE FUNCTION fleet.reject_roam_plug_money_write()',
      tbl
    );
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS explorer;
CREATE SCHEMA IF NOT EXISTS places;

CREATE TABLE IF NOT EXISTS explorer.profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone text,
  parish_pcode text,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.user_vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  catalog_variant_id uuid,
  pending_request_id uuid,
  year integer,
  nickname text,
  starting_odometer numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.pending_catalog_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  make text NOT NULL,
  model text,
  year integer,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.fuel_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES explorer.user_vehicle(id) ON DELETE CASCADE,
  litres numeric NOT NULL,
  amount numeric NOT NULL,
  price_per_litre numeric,
  grade text,
  odometer numeric,
  lat double precision,
  lng double precision,
  accuracy_m numeric,
  mock_location boolean NOT NULL DEFAULT false,
  station_id text,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS explorer.odometer_reading (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES explorer.user_vehicle(id) ON DELETE CASCADE,
  reading numeric NOT NULL,
  source text NOT NULL CHECK (source IN ('start', 'fuel', 'service')),
  reference_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.service_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES explorer.user_vehicle(id) ON DELETE CASCADE,
  op_code text NOT NULL,
  odometer numeric,
  done_on date NOT NULL,
  done_elsewhere boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.reminder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES explorer.user_vehicle(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('service', 'licence', 'registration', 'fitness', 'insurance')),
  due_on date,
  due_km numeric,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.trust (
  user_id uuid PRIMARY KEY REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  approved_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS explorer.flag_allowlist (
  flag_name text NOT NULL,
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  PRIMARY KEY (flag_name, user_id)
);

CREATE TABLE IF NOT EXISTS explorer.write_window (
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, window_start)
);

CREATE TABLE IF NOT EXISTS places.place (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  pcode text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'closed', 'duplicate', 'anomaly')),
  geofence_m integer NOT NULL DEFAULT 50,
  station_id text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_place_status_idx ON places.place (status, pcode);

CREATE TABLE IF NOT EXISTS places.place_capability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places.place(id) ON DELETE CASCADE,
  station_id text,
  kind text NOT NULL CHECK (kind IN (
    'air_pump', 'restroom', 'parts_store', 'mechanic', 'car_wash', 'ev_charging', 'tyre'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (place_id IS NOT NULL OR station_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS places.place_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places.place(id) ON DELETE CASCADE,
  station_id text,
  user_hash text NOT NULL,
  origin_app text NOT NULL DEFAULT 'roam_plug' CHECK (origin_app IN ('roam_fleet', 'roam_plug', 'manual')),
  lat double precision,
  lng double precision,
  accuracy_m numeric,
  photo_path text,
  mock_location boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_evidence_place_idx ON places.place_evidence (place_id, created_at);

CREATE TABLE IF NOT EXISTS places.place_change_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid REFERENCES places.place(id) ON DELETE CASCADE,
  station_id text,
  kind text NOT NULL CHECK (kind IN ('new', 'move', 'close', 'rename', 'merge')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  distinct_users integer NOT NULL DEFAULT 1,
  best_accuracy_m numeric,
  suggestion text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places.price_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id text NOT NULL,
  grade text NOT NULL,
  price_per_litre numeric NOT NULL,
  origin_app text NOT NULL CHECK (origin_app IN ('roam_fleet', 'roam_plug', 'manual')),
  user_hash text,
  in_band boolean NOT NULL,
  petrojam_effective_from date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places.price_current (
  station_id text NOT NULL,
  grade text NOT NULL,
  price_per_litre numeric NOT NULL,
  observed_at timestamptz NOT NULL,
  petrojam_effective_from date,
  PRIMARY KEY (station_id, grade)
);

CREATE TABLE IF NOT EXISTS places.public_station (
  id text PRIMARY KEY,
  name text NOT NULL,
  brand text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  pcode text,
  prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_updated_at timestamptz,
  capabilities text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places.public_place (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  brand text,
  kind text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  pcode text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places.demand_search (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid,
  query text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places.coverage_count (
  pcode text NOT NULL,
  kind text NOT NULL,
  verified_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pcode, kind)
);

CREATE TABLE IF NOT EXISTS places.usage_count (
  catalog_variant_id uuid PRIMARY KEY,
  vehicles integer NOT NULL DEFAULT 0,
  avg_km_per_day numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION places.parish_pcode(lat double precision, lng double precision)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT b.pcode
  FROM geo.boundaries b
  JOIN geo.boundary_versions v ON v.id = b.current_version_id
  WHERE b.admin_level = 1
    AND b.status = 'active'
    AND v.geom IS NOT NULL
    AND ST_Contains(v.geom, ST_SetSRID(ST_Point(lng, lat), 4326))
  LIMIT 1
$$;

INSERT INTO public.platform_feature_flags (name, enabled)
VALUES
  ('plug.explore', false),
  ('plug.fuel_log', false),
  ('plug.garage', false),
  ('plug.parts', false),
  ('plug.map_it', false),
  ('plug.tolls', false),
  ('plug.documents', false)
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('explorer-photos', 'explorer-photos', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    NULL;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profile', 'user_vehicle', 'pending_catalog_request', 'fuel_log', 'odometer_reading',
    'service_log', 'reminder', 'notification', 'trust', 'flag_allowlist', 'write_window'
  ]
  LOOP
    EXECUTE format('ALTER TABLE explorer.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON explorer.%I FROM PUBLIC, anon, authenticated', tbl);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY[
    'place', 'place_capability', 'place_evidence', 'place_change_proposal',
    'price_observation', 'price_current', 'public_station', 'public_place',
    'demand_search', 'coverage_count', 'usage_count'
  ]
  LOOP
    EXECUTE format('ALTER TABLE places.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON places.%I FROM PUBLIC, anon, authenticated', tbl);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA explorer, places TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA explorer TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA places TO service_role;
REVOKE ALL ON SCHEMA explorer, places FROM anon, authenticated;
REVOKE ALL ON FUNCTION places.parish_pcode(double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION places.parish_pcode(double precision, double precision) TO service_role;
REVOKE ALL ON FUNCTION fleet.reject_roam_plug_money_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION places.sync_public_station()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = places, fleet
AS $$
DECLARE
  st text := COALESCE(NEW.payload_json->>'status', '');
  lat_text text := COALESCE(NEW.payload_json #>> '{location,lat}', NEW.payload_json->>'lat', '');
  lng_text text := COALESCE(NEW.payload_json #>> '{location,lng}', NEW.payload_json->>'lng', '');
  lat double precision := CASE
    WHEN lat_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lat_text::double precision
    ELSE NULL
  END;
  lng double precision := CASE
    WHEN lng_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lng_text::double precision
    ELSE NULL
  END;
BEGIN
  IF st = 'verified' AND lat IS NOT NULL AND lng IS NOT NULL THEN
    INSERT INTO places.public_station (id, name, brand, lat, lng, pcode, updated_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.name, 'Station'),
      NEW.payload_json->>'brand',
      lat,
      lng,
      NEW.payload_json->>'pcode',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      pcode = EXCLUDED.pcode,
      updated_at = now();
  ELSIF st IN ('rejected', 'closed', 'duplicate') THEN
    DELETE FROM places.public_station WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_public_station ON fleet.stations;
CREATE TRIGGER sync_public_station
  AFTER INSERT OR UPDATE ON fleet.stations
  FOR EACH ROW EXECUTE FUNCTION places.sync_public_station();

INSERT INTO places.public_station (id, name, brand, lat, lng, pcode)
SELECT
  s.id,
  COALESCE(s.name, 'Station'),
  s.payload_json->>'brand',
  COALESCE(
    NULLIF(s.payload_json #>> '{location,lat}', '')::double precision,
    NULLIF(s.payload_json->>'lat', '')::double precision
  ),
  COALESCE(
    NULLIF(s.payload_json #>> '{location,lng}', '')::double precision,
    NULLIF(s.payload_json->>'lng', '')::double precision
  ),
  s.payload_json->>'pcode'
FROM fleet.stations s
WHERE COALESCE(s.payload_json->>'status', '') = 'verified'
  AND COALESCE(s.payload_json #>> '{location,lat}', s.payload_json->>'lat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND COALESCE(s.payload_json #>> '{location,lng}', s.payload_json->>'lng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON FUNCTION places.sync_public_station() FROM PUBLIC, anon, authenticated;

