-- Week reconciliation calculates one driver or one vehicle in the background.
-- Screens read projection_state, week_blockers, and the saved snapshots.

CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$
BEGIN
  PERFORM pgmq.create('recon_recompute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM pgmq.create('recon_close');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS recon.projection_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  unit_kind text NOT NULL CHECK (unit_kind IN ('driver_week', 'vehicle_week', 'courier_week')),
  week_key date NOT NULL,
  driver_id text,
  vehicle_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fresh', 'failed')),
  inputs_hash text,
  computed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recon.projection_state
  ADD CONSTRAINT projection_state_unit_key
  UNIQUE NULLS NOT DISTINCT (organization_id, unit_kind, week_key, driver_id, vehicle_id);

CREATE INDEX IF NOT EXISTS projection_state_week_status_idx
  ON recon.projection_state (organization_id, week_key, status);

CREATE TABLE IF NOT EXISTS recon.fuel_vehicle_week_shadow (
  organization_id text NOT NULL,
  week_key date NOT NULL,
  vehicle_id text NOT NULL,
  inputs_hash text NOT NULL,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, week_key, vehicle_id)
);

CREATE TABLE IF NOT EXISTS recon.driver_week_shadow (
  organization_id text NOT NULL,
  week_key date NOT NULL,
  driver_id text NOT NULL,
  inputs_hash text NOT NULL,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, week_key, driver_id)
);

CREATE TABLE IF NOT EXISTS recon.courier_week_result (
  organization_id text NOT NULL,
  week_key date NOT NULL,
  courier_id text NOT NULL,
  shared_cost numeric NOT NULL DEFAULT 0,
  net_payout numeric NOT NULL DEFAULT 0,
  toll_closing numeric NOT NULL DEFAULT 0,
  inputs_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, week_key, courier_id)
);

CREATE TABLE IF NOT EXISTS recon.week_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  week_key date NOT NULL,
  service_line text NOT NULL DEFAULT 'rideshare',
  driver_id text,
  code text NOT NULL,
  severity text NOT NULL,
  fingerprint text NOT NULL,
  message text,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS week_blockers_unit_uidx
  ON recon.week_blockers (organization_id, week_key, service_line, driver_id, code)
  NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS recon.close_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  week_key date NOT NULL,
  service_line text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('refresh', 'close')),
  state text NOT NULL,
  step text NOT NULL,
  started_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  error text,
  result jsonb
);

CREATE INDEX IF NOT EXISTS close_workflows_open_idx
  ON recon.close_workflows (organization_id, week_key, service_line, kind, state);

CREATE TABLE IF NOT EXISTS recon.worker_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recon.projection_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.fuel_vehicle_week_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.driver_week_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.courier_week_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.week_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.close_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.worker_alerts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON recon.projection_state TO service_role;
GRANT ALL ON recon.fuel_vehicle_week_shadow TO service_role;
GRANT ALL ON recon.driver_week_shadow TO service_role;
GRANT ALL ON recon.courier_week_result TO service_role;
GRANT ALL ON recon.week_blockers TO service_role;
GRANT ALL ON recon.close_workflows TO service_role;
GRANT ALL ON recon.worker_alerts TO service_role;

-- Nightly shadow compare needs a source value the original check did not allow.
ALTER TABLE ledger.finance_recon_drift DROP CONSTRAINT IF EXISTS finance_recon_drift_source_check;
ALTER TABLE ledger.finance_recon_drift
  ADD CONSTRAINT finance_recon_drift_source_check
  CHECK (source IN ('close_preview', 'rebuild', 'nightly', 'close', 'close_prepare', 'shadow'));

CREATE OR REPLACE FUNCTION recon.enqueue_unit(
  p_org text,
  p_kind text,
  p_week date,
  p_driver text,
  p_vehicle text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_org IS NULL OR p_week IS NULL OR p_kind IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status
  FROM recon.projection_state
  WHERE organization_id = p_org
    AND unit_kind = p_kind
    AND week_key = p_week
    AND driver_id IS NOT DISTINCT FROM p_driver
    AND vehicle_id IS NOT DISTINCT FROM p_vehicle
  FOR UPDATE;

  IF v_status = 'pending' THEN
    RETURN;
  END IF;

  INSERT INTO recon.projection_state (
    organization_id, unit_kind, week_key, driver_id, vehicle_id, status, updated_at
  ) VALUES (
    p_org, p_kind, p_week, p_driver, p_vehicle, 'pending', now()
  )
  ON CONFLICT (organization_id, unit_kind, week_key, driver_id, vehicle_id)
  DO UPDATE SET status = 'pending', last_error = NULL, updated_at = now();

  PERFORM pgmq.send(
    'recon_recompute',
    jsonb_build_object(
      'organizationId', p_org,
      'unitKind', p_kind,
      'weekKey', to_char(p_week, 'YYYY-MM-DD'),
      'driverId', p_driver,
      'vehicleId', p_vehicle
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION recon.week_monday(p_day date)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  PERFORM set_config('TimeZone', 'America/Jamaica', true);
  RETURN (date_trunc('week', p_day::timestamp))::date;
END;
$$;

CREATE OR REPLACE FUNCTION recon.touch_driver_week(
  p_org text,
  p_driver text,
  p_day date,
  p_carry boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  v_week date;
BEGIN
  IF p_org IS NULL OR p_driver IS NULL OR p_day IS NULL THEN
    RETURN;
  END IF;
  v_week := recon.week_monday(p_day);
  PERFORM recon.enqueue_unit(p_org, 'driver_week', v_week, p_driver, NULL);
  IF p_carry THEN
    PERFORM recon.enqueue_unit(p_org, 'driver_week', v_week + 7, p_driver, NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION recon.touch_vehicle_week(
  p_org text,
  p_vehicle text,
  p_day date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  v_week date;
BEGIN
  IF p_org IS NULL OR p_vehicle IS NULL OR p_day IS NULL THEN
    RETURN;
  END IF;
  v_week := recon.week_monday(p_day);
  PERFORM recon.enqueue_unit(p_org, 'vehicle_week', v_week, NULL, p_vehicle);
  PERFORM recon.enqueue_unit(p_org, 'vehicle_week', v_week + 7, NULL, p_vehicle);
END;
$$;

CREATE OR REPLACE FUNCTION recon.tg_fuel_entry_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recon.touch_vehicle_week(OLD.organization_id, OLD.vehicle_id, OLD.date);
    PERFORM recon.touch_driver_week(OLD.organization_id, OLD.driver_id, OLD.date, true);
    RETURN OLD;
  END IF;
  PERFORM recon.touch_vehicle_week(NEW.organization_id, NEW.vehicle_id, NEW.date);
  PERFORM recon.touch_driver_week(NEW.organization_id, NEW.driver_id, NEW.date, true);
  IF TG_OP = 'UPDATE' AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id OR OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
    PERFORM recon.touch_vehicle_week(OLD.organization_id, OLD.vehicle_id, OLD.date);
    PERFORM recon.touch_driver_week(OLD.organization_id, OLD.driver_id, OLD.date, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fuel_entries_recon_pending ON fleet.fuel_entries;
CREATE TRIGGER fuel_entries_recon_pending
AFTER INSERT OR UPDATE OR DELETE ON fleet.fuel_entries
FOR EACH ROW EXECUTE FUNCTION recon.tg_fuel_entry_pending();

CREATE OR REPLACE FUNCTION recon.tg_trip_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  v_week date;
  v_line text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recon.touch_driver_week(OLD.organization_id, OLD.driver_id, OLD.date, true);
    v_line := OLD.service_line;
    v_week := recon.week_monday(OLD.date);
    IF v_line = 'rush_delivery' AND OLD.driver_id IS NOT NULL THEN
      PERFORM recon.enqueue_unit(OLD.organization_id, 'courier_week', v_week, OLD.driver_id, NULL);
    END IF;
    RETURN OLD;
  END IF;
  PERFORM recon.touch_driver_week(NEW.organization_id, NEW.driver_id, NEW.date, true);
  v_line := NEW.service_line;
  v_week := recon.week_monday(NEW.date);
  IF v_line = 'rush_delivery' AND NEW.driver_id IS NOT NULL THEN
    PERFORM recon.enqueue_unit(NEW.organization_id, 'courier_week', v_week, NEW.driver_id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_recon_pending ON fleet.trips;
CREATE TRIGGER trips_recon_pending
AFTER INSERT OR UPDATE OR DELETE ON fleet.trips
FOR EACH ROW EXECUTE FUNCTION recon.tg_trip_pending();

CREATE OR REPLACE FUNCTION recon.tg_toll_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recon.touch_driver_week(OLD.organization_id, OLD.driver_id, OLD.date, true);
    RETURN OLD;
  END IF;
  PERFORM recon.touch_driver_week(NEW.organization_id, NEW.driver_id, NEW.date, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS toll_ledger_recon_pending ON fleet.toll_ledger;
CREATE TRIGGER toll_ledger_recon_pending
AFTER INSERT OR UPDATE OR DELETE ON fleet.toll_ledger
FOR EACH ROW EXECUTE FUNCTION recon.tg_toll_pending();

CREATE OR REPLACE FUNCTION recon.tg_settlement_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
BEGIN
  PERFORM recon.touch_driver_week(NEW.organization_id::text, NEW.driver_id, NEW.period_anchor, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settlement_movements_recon_pending ON ledger.settlement_movements;
CREATE TRIGGER settlement_movements_recon_pending
AFTER INSERT ON ledger.settlement_movements
FOR EACH ROW EXECUTE FUNCTION recon.tg_settlement_pending();

CREATE OR REPLACE FUNCTION recon.tg_import_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  r record;
  v_week date;
BEGIN
  v_week := recon.week_monday(COALESCE(NEW.period_start, NEW.upload_date::date));
  IF v_week IS NULL THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT DISTINCT driver_id
    FROM fleet.trips
    WHERE organization_id = NEW.organization_id
      AND batch_id = NEW.id
      AND driver_id IS NOT NULL
  LOOP
    PERFORM recon.enqueue_unit(NEW.organization_id, 'driver_week', v_week, r.driver_id, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS import_batches_recon_pending ON fleet.import_batches;
CREATE TRIGGER import_batches_recon_pending
AFTER INSERT OR UPDATE OF status ON fleet.import_batches
FOR EACH ROW EXECUTE FUNCTION recon.tg_import_pending();

CREATE OR REPLACE FUNCTION recon.tg_attestation_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT driver_id
    FROM ledger.driver_financial_periods
    WHERE organization_id::text = NEW.organization_id
      AND period_anchor = NEW.week_key
  LOOP
    PERFORM recon.enqueue_unit(NEW.organization_id, 'driver_week', NEW.week_key, r.driver_id, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS source_attestations_recon_pending ON recon.source_attestations;
CREATE TRIGGER source_attestations_recon_pending
AFTER INSERT OR UPDATE ON recon.source_attestations
FOR EACH ROW EXECUTE FUNCTION recon.tg_attestation_pending();

CREATE OR REPLACE FUNCTION recon.tg_earnings_policy_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT driver_id, period_anchor
    FROM ledger.driver_financial_periods
    WHERE organization_id::text = NEW.organization_id
      AND status IS DISTINCT FROM 'closed'
  LOOP
    PERFORM recon.enqueue_unit(NEW.organization_id, 'driver_week', r.period_anchor, r.driver_id, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS earnings_policies_recon_pending ON fleet.earnings_policies;
CREATE TRIGGER earnings_policies_recon_pending
AFTER INSERT OR UPDATE ON fleet.earnings_policies
FOR EACH ROW EXECUTE FUNCTION recon.tg_earnings_policy_pending();

CREATE OR REPLACE FUNCTION public.recon_mark_week_pending(
  p_org text,
  p_week date,
  p_line text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public, ledger, fleet
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT driver_id::text AS driver_id
    FROM ledger.driver_financial_periods
    WHERE organization_id::text = p_org
      AND period_anchor = p_week
      AND driver_id IS NOT NULL
  LOOP
    PERFORM recon.enqueue_unit(p_org, 'driver_week', p_week, r.driver_id, NULL);
    IF p_line = 'rush_delivery' THEN
      PERFORM recon.enqueue_unit(p_org, 'courier_week', p_week, r.driver_id, NULL);
    END IF;
    n := n + 1;
  END LOOP;
  FOR r IN
    SELECT DISTINCT vehicle_id
    FROM fleet.fuel_entries
    WHERE organization_id = p_org
      AND date >= p_week
      AND date < p_week + 7
      AND vehicle_id IS NOT NULL
  LOOP
    PERFORM recon.enqueue_unit(p_org, 'vehicle_week', p_week, NULL, r.vehicle_id);
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.recon_mark_week_pending(text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_mark_week_pending(text, date, text) TO service_role;

CREATE OR REPLACE FUNCTION public.recon_read_recompute_batch(p_qty int, p_vt int)
RETURNS TABLE (
  msg_id bigint,
  read_ct integer,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
  FROM pgmq.read('recon_recompute', GREATEST(p_vt, 1), GREATEST(p_qty, 1)) AS r;
END;
$$;

REVOKE ALL ON FUNCTION public.recon_read_recompute_batch(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_read_recompute_batch(int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.recon_archive_recompute(p_msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
BEGIN
  RETURN pgmq.archive('recon_recompute', p_msg_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recon_archive_recompute(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_archive_recompute(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.recon_queue_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pgmq, recon, public
AS $$
DECLARE
  v_oldest double precision;
  v_failed int;
BEGIN
  BEGIN
    EXECUTE 'SELECT EXTRACT(EPOCH FROM (now() - min(enqueued_at))) FROM pgmq.q_recon_recompute'
      INTO v_oldest;
  EXCEPTION WHEN undefined_table THEN
    v_oldest := NULL;
  END;
  SELECT count(*) INTO v_failed
  FROM recon.projection_state
  WHERE status = 'failed';
  RETURN jsonb_build_object(
    'oldestSeconds', v_oldest,
    'failedUnits', COALESCE(v_failed, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recon_queue_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_queue_health() TO service_role;

CREATE OR REPLACE FUNCTION public.recon_enqueue_unit(
  p_org text,
  p_kind text,
  p_week date,
  p_driver text,
  p_vehicle text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = recon, pgmq, public
AS $$
BEGIN
  PERFORM recon.enqueue_unit(p_org, p_kind, p_week, p_driver, p_vehicle);
END;
$$;

REVOKE ALL ON FUNCTION public.recon_enqueue_unit(text, text, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recon_enqueue_unit(text, text, date, text, text) TO service_role;
