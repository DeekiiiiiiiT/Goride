-- Driver Activity Wave 0: presence transition log + coverage registry + transition writes + sweeper helpers.
-- Presence history is append-only; live upserts keep destroying history until this ships.

-- ── ACT-01: fleet.driver_presence_log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet.driver_presence_log (
  id            bigserial PRIMARY KEY,
  user_id       uuid        NOT NULL,
  service_line  text        NOT NULL CHECK (service_line IN ('roam_rides', 'roam_rush')),
  is_online     boolean     NOT NULL,
  occurred_at   timestamptz NOT NULL,
  reason        text        NOT NULL CHECK (reason IN (
    'app_toggle', 'heartbeat_timeout', 'admin_force', 'logout', 'trip_forced_online'
  )),
  session_id    uuid,
  device_id     text,
  app_version   text,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT driver_presence_log_user_line_time_uidx
    UNIQUE (user_id, service_line, occurred_at)
);

CREATE INDEX IF NOT EXISTS fleet_driver_presence_log_user_time_idx
  ON fleet.driver_presence_log (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fleet_driver_presence_log_occurred_idx
  ON fleet.driver_presence_log (occurred_at);

ALTER TABLE fleet.driver_presence_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_presence_log_no_direct ON fleet.driver_presence_log;
CREATE POLICY driver_presence_log_no_direct ON fleet.driver_presence_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT ALL ON fleet.driver_presence_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE fleet.driver_presence_log_id_seq TO service_role;

CREATE OR REPLACE VIEW public.fleet_driver_presence_log AS
  SELECT * FROM fleet.driver_presence_log;
GRANT ALL ON public.fleet_driver_presence_log TO service_role;

-- ── ACT-04: fleet.activity_source_coverage ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet.activity_source_coverage (
  service_line  text        NOT NULL,
  source        text        NOT NULL,
  covered_from  timestamptz NOT NULL,
  covered_to    timestamptz,
  note          text,
  PRIMARY KEY (service_line, source, covered_from)
);

ALTER TABLE fleet.activity_source_coverage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_source_coverage_no_direct ON fleet.activity_source_coverage;
CREATE POLICY activity_source_coverage_no_direct ON fleet.activity_source_coverage
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT ALL ON fleet.activity_source_coverage TO service_role;

CREATE OR REPLACE VIEW public.fleet_activity_source_coverage AS
  SELECT * FROM fleet.activity_source_coverage;
GRANT ALL ON public.fleet_activity_source_coverage TO service_role;

-- Launch-date coverage for presence (open-ended). Sources already append-only get their own rows in Wave 1.
INSERT INTO fleet.activity_source_coverage (service_line, source, covered_from, covered_to, note)
VALUES
  ('roam_rides', 'fleet.driver_presence_log', now(), NULL, 'Wave 0 presence logging live'),
  ('roam_rush',  'fleet.driver_presence_log', now(), NULL, 'Wave 0 presence logging live')
ON CONFLICT DO NOTHING;

-- Helper: append a presence transition (idempotent on unique key)
CREATE OR REPLACE FUNCTION fleet.append_presence_transition(
  p_user_id uuid,
  p_service_line text,
  p_is_online boolean,
  p_reason text,
  p_session_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  INSERT INTO fleet.driver_presence_log (
    user_id, service_line, is_online, occurred_at, reason, session_id, payload
  ) VALUES (
    p_user_id, p_service_line, p_is_online, clock_timestamp(), p_reason, p_session_id,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (user_id, service_line, occurred_at) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION fleet.append_presence_transition TO service_role;

-- ── ACT-02: rides presence — transition-only write ──────────────────────────
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rides_upsert_driver_presence(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT, TEXT, TEXT, SMALLINT);

CREATE OR REPLACE FUNCTION public.rides_upsert_driver_presence(
  p_user_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_heading_degrees DOUBLE PRECISION DEFAULT NULL,
  p_available_for_rides BOOLEAN DEFAULT TRUE,
  p_body_type_slug TEXT DEFAULT NULL,
  p_h3_cell TEXT DEFAULT NULL,
  p_dispatch_mode TEXT DEFAULT NULL,
  p_h3_res SMALLINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, fleet, public
AS $$
DECLARE
  v_prev boolean;
BEGIN
  IF p_dispatch_mode IS NOT NULL AND p_dispatch_mode NOT IN ('haulage', 'rideshare') THEN
    RAISE EXCEPTION 'invalid_dispatch_mode';
  END IF;

  SELECT available_for_rides INTO v_prev
  FROM rides.driver_locations
  WHERE user_id = p_user_id;

  INSERT INTO rides.driver_locations (
    user_id, lat, lng, heading_degrees, available_for_rides,
    body_type_slug, h3_cell, h3_res, dispatch_mode, updated_at
  ) VALUES (
    p_user_id, p_lat, p_lng, p_heading_degrees, p_available_for_rides,
    p_body_type_slug, NULLIF(trim(p_h3_cell), ''), p_h3_res, p_dispatch_mode, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading_degrees = COALESCE(EXCLUDED.heading_degrees, rides.driver_locations.heading_degrees),
    available_for_rides = EXCLUDED.available_for_rides,
    body_type_slug = COALESCE(EXCLUDED.body_type_slug, rides.driver_locations.body_type_slug),
    h3_cell = EXCLUDED.h3_cell,
    h3_res = EXCLUDED.h3_res,
    dispatch_mode = COALESCE(EXCLUDED.dispatch_mode, rides.driver_locations.dispatch_mode),
    updated_at = NOW();

  -- Transition-only: first sighting counts as going online when available; otherwise only on change
  IF v_prev IS DISTINCT FROM p_available_for_rides THEN
    PERFORM fleet.append_presence_transition(
      p_user_id,
      'roam_rides',
      COALESCE(p_available_for_rides, FALSE),
      'app_toggle',
      NULL,
      '{}'::jsonb
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_driver_presence TO service_role;

-- ── ACT-02: courier presence — both public + delivery schemas ───────────────
CREATE OR REPLACE FUNCTION public.delivery_courier_upsert_presence(
  p_driver_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_h3_cell TEXT,
  p_h3_res INTEGER,
  p_is_online BOOLEAN DEFAULT TRUE,
  p_active_order_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, fleet, public
AS $$
DECLARE
  v_cell TEXT := NULLIF(trim(p_h3_cell), '');
  v_res SMALLINT := CASE WHEN p_h3_res IS NULL THEN NULL ELSE p_h3_res::SMALLINT END;
  v_prev boolean;
BEGIN
  IF p_driver_id IS NULL THEN
    RAISE EXCEPTION 'driver_id_required' USING ERRCODE = '22023';
  END IF;

  IF p_is_online IS TRUE THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'location_required' USING ERRCODE = '22023';
    END IF;
    IF v_cell IS NULL OR v_res IS NULL THEN
      RAISE EXCEPTION 'presence_h3_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT is_online INTO v_prev
  FROM delivery.courier_availability
  WHERE driver_id = p_driver_id;

  INSERT INTO delivery.courier_availability (
    driver_id, current_lat, current_lng, h3_cell, h3_res,
    is_online, active_order_id, last_location_update, updated_at
  ) VALUES (
    p_driver_id, p_lat, p_lng, v_cell, v_res,
    COALESCE(p_is_online, FALSE), p_active_order_id, NOW(), NOW()
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    current_lat = COALESCE(EXCLUDED.current_lat, delivery.courier_availability.current_lat),
    current_lng = COALESCE(EXCLUDED.current_lng, delivery.courier_availability.current_lng),
    h3_cell = CASE
      WHEN EXCLUDED.current_lat IS NOT NULL AND EXCLUDED.current_lng IS NOT NULL
        THEN EXCLUDED.h3_cell
      ELSE delivery.courier_availability.h3_cell
    END,
    h3_res = CASE
      WHEN EXCLUDED.current_lat IS NOT NULL AND EXCLUDED.current_lng IS NOT NULL
        THEN EXCLUDED.h3_res
      ELSE delivery.courier_availability.h3_res
    END,
    is_online = EXCLUDED.is_online,
    active_order_id = COALESCE(EXCLUDED.active_order_id, delivery.courier_availability.active_order_id),
    last_location_update = NOW(),
    updated_at = NOW();

  IF v_prev IS DISTINCT FROM COALESCE(p_is_online, FALSE) THEN
    PERFORM fleet.append_presence_transition(
      p_driver_id,
      'roam_rush',
      COALESCE(p_is_online, FALSE),
      'app_toggle',
      NULL,
      '{}'::jsonb
    );
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.delivery_courier_upsert_presence(uuid, double precision, double precision, text, smallint, boolean, uuid);
GRANT EXECUTE ON FUNCTION public.delivery_courier_upsert_presence(uuid, double precision, double precision, text, integer, boolean, uuid) TO service_role;

CREATE OR REPLACE FUNCTION delivery.delivery_courier_upsert_presence(
  p_driver_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_h3_cell TEXT,
  p_h3_res INTEGER,
  p_is_online BOOLEAN DEFAULT TRUE,
  p_active_order_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, fleet, public
AS $$
BEGIN
  PERFORM public.delivery_courier_upsert_presence(
    p_driver_id, p_lat, p_lng, p_h3_cell, p_h3_res, p_is_online, p_active_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delivery.delivery_courier_upsert_presence(uuid, double precision, double precision, text, integer, boolean, uuid) TO service_role;

-- ── ACT-03 helpers: close stale presence sessions (called by fleet cron) ────
CREATE OR REPLACE FUNCTION fleet.sweep_stale_presence(p_grace_seconds int DEFAULT 300)
RETURNS TABLE(closed_rides bigint, closed_rush bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, delivery, fleet, public
AS $$
DECLARE
  v_rides bigint := 0;
  v_rush bigint := 0;
  r record;
  cutoff timestamptz := now() - make_interval(secs => p_grace_seconds);
BEGIN
  FOR r IN
    SELECT user_id, updated_at
    FROM rides.driver_locations
    WHERE available_for_rides IS TRUE
      AND updated_at < cutoff
  LOOP
    UPDATE rides.driver_locations
    SET available_for_rides = FALSE, updated_at = now()
    WHERE user_id = r.user_id AND available_for_rides IS TRUE;

    IF FOUND THEN
      INSERT INTO fleet.driver_presence_log (
        user_id, service_line, is_online, occurred_at, reason, payload
      ) VALUES (
        r.user_id, 'roam_rides', FALSE,
        r.updated_at + make_interval(secs => p_grace_seconds),
        'heartbeat_timeout',
        jsonb_build_object('last_seen', r.updated_at, 'grace_seconds', p_grace_seconds)
      )
      ON CONFLICT (user_id, service_line, occurred_at) DO NOTHING;
      v_rides := v_rides + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT driver_id AS user_id, last_location_update AS updated_at
    FROM delivery.courier_availability
    WHERE is_online IS TRUE
      AND last_location_update < cutoff
  LOOP
    UPDATE delivery.courier_availability
    SET is_online = FALSE, updated_at = now()
    WHERE driver_id = r.user_id AND is_online IS TRUE;

    IF FOUND THEN
      INSERT INTO fleet.driver_presence_log (
        user_id, service_line, is_online, occurred_at, reason, payload
      ) VALUES (
        r.user_id, 'roam_rush', FALSE,
        r.updated_at + make_interval(secs => p_grace_seconds),
        'heartbeat_timeout',
        jsonb_build_object('last_seen', r.updated_at, 'grace_seconds', p_grace_seconds)
      )
      ON CONFLICT (user_id, service_line, occurred_at) DO NOTHING;
      v_rush := v_rush + 1;
    END IF;
  END LOOP;

  closed_rides := v_rides;
  closed_rush := v_rush;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION fleet.sweep_stale_presence(int) TO service_role;

NOTIFY pgrst, 'reload schema';
