-- Fuel log offline-first, Data layer D1/D2 (docs/fuel-log-offline-first-audit.md).
-- One row per driver phone: how many items are still waiting on that phone and since when.
-- Written only by the server (S1, the phone's report); read only by the server (S2, Fleet card + chip).
-- Same pattern as fleet.vehicle_document_check: fleet table, thin public view, service_role only.

CREATE TABLE fleet.driver_phone_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  driver_id text NOT NULL,
  device_id text NOT NULL CHECK (length(btrim(device_id)) BETWEEN 8 AND 128),
  app_version text CHECK (app_version IS NULL OR length(app_version) <= 32),
  pending_count int NOT NULL DEFAULT 0 CHECK (pending_count >= 0 AND pending_count <= 10000),
  oldest_pending_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 500),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_phone_outbox_driver_device_key UNIQUE (driver_id, device_id),
  CONSTRAINT driver_phone_outbox_oldest_matches_count CHECK (
    (pending_count = 0 AND oldest_pending_at IS NULL)
    OR (pending_count > 0 AND oldest_pending_at IS NOT NULL)
  )
);

COMMENT ON TABLE fleet.driver_phone_outbox IS
  'Items still waiting on a driver phone (fuel, tolls, check-ins). Server-only. Audit FO-14 / D1.';
COMMENT ON COLUMN fleet.driver_phone_outbox.device_id IS 'Random id the app makes once per install.';
COMMENT ON COLUMN fleet.driver_phone_outbox.oldest_pending_at IS 'Photo time of the oldest waiting item; null when nothing waits.';
COMMENT ON COLUMN fleet.driver_phone_outbox.last_seen_at IS 'When this phone last reported (server time).';

CREATE INDEX driver_phone_outbox_org_waiting_idx
  ON fleet.driver_phone_outbox (organization_id, oldest_pending_at)
  WHERE pending_count > 0;

CREATE TRIGGER driver_phone_outbox_updated_at
  BEFORE UPDATE ON fleet.driver_phone_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE fleet.driver_phone_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fleet.driver_phone_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON fleet.driver_phone_outbox TO service_role;

-- Explicit columns (a new column must be added here too).
CREATE OR REPLACE VIEW public.fleet_driver_phone_outbox AS
  SELECT
    id,
    organization_id,
    driver_id,
    device_id,
    app_version,
    pending_count,
    oldest_pending_at,
    last_error,
    last_seen_at,
    created_at,
    updated_at
  FROM fleet.driver_phone_outbox;
ALTER VIEW public.fleet_driver_phone_outbox SET (security_invoker = true);
REVOKE ALL ON public.fleet_driver_phone_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_driver_phone_outbox TO service_role;

-- S1: the phone's report, in one call. Upserts that phone's row; oldest time follows the count.
CREATE OR REPLACE FUNCTION public.driver_phone_outbox_report(
  p_organization_id text,
  p_driver_id text,
  p_device_id text,
  p_app_version text,
  p_pending_count int,
  p_oldest_pending_at timestamptz,
  p_last_error text
)
RETURNS public.fleet_driver_phone_outbox
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_count int := GREATEST(COALESCE(p_pending_count, 0), 0);
  v_row public.fleet_driver_phone_outbox;
BEGIN
  IF NULLIF(btrim(p_organization_id), '') IS NULL OR NULLIF(btrim(p_driver_id), '') IS NULL THEN
    RAISE EXCEPTION 'organization and driver are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO fleet.driver_phone_outbox AS o (
    organization_id, driver_id, device_id, app_version,
    pending_count, oldest_pending_at, last_error, last_seen_at
  ) VALUES (
    btrim(p_organization_id), btrim(p_driver_id), btrim(p_device_id), NULLIF(btrim(p_app_version), ''),
    v_count,
    CASE WHEN v_count > 0 THEN COALESCE(p_oldest_pending_at, now()) END,
    CASE WHEN v_count > 0 THEN left(NULLIF(btrim(p_last_error), ''), 500) END,
    now()
  )
  ON CONFLICT (driver_id, device_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    app_version = COALESCE(EXCLUDED.app_version, o.app_version),
    pending_count = EXCLUDED.pending_count,
    oldest_pending_at = EXCLUDED.oldest_pending_at,
    last_error = EXCLUDED.last_error,
    last_seen_at = EXCLUDED.last_seen_at;

  SELECT * INTO v_row
  FROM public.fleet_driver_phone_outbox v
  WHERE v.driver_id = btrim(p_driver_id) AND v.device_id = btrim(p_device_id);
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_phone_outbox_report(text, text, text, text, int, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_phone_outbox_report(text, text, text, text, int, timestamptz, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
