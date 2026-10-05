-- Toll tag inventory: unique live tag numbers, queryable assignment windows,
-- one-transaction assign/unassign/retire, and a daily low-balance alert.
-- The job runs in the database. fleet-toll's gateway expects a user JWT, so a
-- secret-only HTTP cron would be rejected before the function sees it.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX IF NOT EXISTS fleet_toll_tags_org_number_active_uidx
  ON fleet.toll_tags (organization_id, lower(tag_number))
  WHERE coalesce(payload_json->>'status', '') <> 'Retired'
    AND tag_number IS NOT NULL
    AND organization_id IS NOT NULL;

UPDATE fleet.toll_tags
SET vehicle_id = NULLIF(payload_json->>'assignedVehicleId', '')
WHERE COALESCE(vehicle_id, '') = ''
  AND NULLIF(payload_json->>'assignedVehicleId', '') IS NOT NULL;

UPDATE fleet.toll_tags
SET payload_json = payload_json || jsonb_build_object(
  'lastBalanceSyncedAt', COALESCE(payload_json->>'lastBalanceSyncedAt', updated_at::text)
)
WHERE payload_json ? 'lastCalculatedBalance'
  AND COALESCE(payload_json->>'lastBalanceSyncedAt', '') = '';

CREATE TABLE IF NOT EXISTS fleet.toll_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  tag_id text NOT NULL,
  vehicle_id text NOT NULL,
  assigned_at timestamptz NOT NULL,
  unassigned_at timestamptz,
  CONSTRAINT toll_tag_assignments_window CHECK (unassigned_at IS NULL OR unassigned_at > assigned_at)
);

CREATE INDEX IF NOT EXISTS fleet_toll_tag_assignments_tag_idx
  ON fleet.toll_tag_assignments (tag_id, assigned_at);
CREATE INDEX IF NOT EXISTS fleet_toll_tag_assignments_vehicle_idx
  ON fleet.toll_tag_assignments (vehicle_id, assigned_at);

CREATE OR REPLACE FUNCTION fleet.try_timestamptz(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_text::timestamptz;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

INSERT INTO fleet.toll_tag_assignments (organization_id, tag_id, vehicle_id, assigned_at, unassigned_at)
SELECT
  t.organization_id,
  t.id,
  NULLIF(elem->>'vehicleId', ''),
  COALESCE(fleet.try_timestamptz(elem->>'assignedAt'), t.updated_at),
  fleet.try_timestamptz(elem->>'unassignedAt')
FROM fleet.toll_tags t
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.payload_json->'assignmentHistory', '[]'::jsonb)) elem
WHERE t.organization_id IS NOT NULL
  AND NULLIF(elem->>'vehicleId', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fleet.toll_tag_assignments a
    WHERE a.tag_id = t.id
      AND a.vehicle_id = NULLIF(elem->>'vehicleId', '')
      AND a.assigned_at = COALESCE(fleet.try_timestamptz(elem->>'assignedAt'), t.updated_at)
  );

INSERT INTO fleet.toll_tag_assignments (organization_id, tag_id, vehicle_id, assigned_at)
SELECT t.organization_id, t.id, t.vehicle_id, t.updated_at
FROM fleet.toll_tags t
WHERE t.organization_id IS NOT NULL
  AND COALESCE(t.vehicle_id, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM fleet.toll_tag_assignments a
    WHERE a.tag_id = t.id AND a.unassigned_at IS NULL
  );

DO $$
BEGIN
  ALTER TABLE fleet.toll_tag_assignments
    ADD CONSTRAINT toll_tag_assignments_tag_no_overlap
    EXCLUDE USING gist (
      tag_id WITH =,
      tstzrange(assigned_at, COALESCE(unassigned_at, 'infinity'), '[)') WITH &&
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE fleet.toll_tag_assignments
    ADD CONSTRAINT toll_tag_assignments_vehicle_no_overlap
    EXCLUDE USING gist (
      vehicle_id WITH =,
      tstzrange(assigned_at, COALESCE(unassigned_at, 'infinity'), '[)') WITH &&
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION fleet.toll_tag_balance_rows(p_org text)
RETURNS TABLE (
  tag_id text,
  ledger_count integer,
  balance numeric,
  usage_amount numeric,
  usage_count integer,
  span_days numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  WITH tags AS (
    SELECT id
    FROM fleet.toll_tags
    WHERE organization_id = p_org
      AND coalesce(payload_json->>'status', '') <> 'Retired'
  ),
  rows AS (
    SELECT
      l.toll_tag_id AS tag_id,
      l.amount,
      l.date,
      coalesce(nullif(l.payment_method, ''), l.payload_json->>'paymentMethod', '') AS pm,
      lower(coalesce(l.status, '')) AS st,
      coalesce(l.metadata->>'voided', l.payload_json->'metadata'->>'voided', '') AS voided
    FROM fleet.toll_ledger l
    WHERE l.organization_id = p_org
      AND l.toll_tag_id IS NOT NULL
  ),
  kept AS (
    SELECT *
    FROM rows
    WHERE st NOT IN ('voided', 'void')
      AND lower(voided) NOT IN ('true', 't')
      AND pm NOT ILIKE '%cash%'
      AND pm NOT ILIKE '%card%'
      AND pm NOT ILIKE '%fleet%'
      AND pm NOT ILIKE '%account%'
  )
  SELECT
    t.id,
    count(k.tag_id)::integer,
    CASE WHEN count(k.tag_id) = 0 THEN NULL ELSE coalesce(sum(k.amount), 0) END,
    coalesce(sum(abs(k.amount)) FILTER (WHERE k.amount < 0), 0),
    count(*) FILTER (WHERE k.amount < 0)::integer,
    CASE
      WHEN count(*) FILTER (WHERE k.amount < 0) < 2 THEN NULL
      ELSE GREATEST(1, (max(k.date) FILTER (WHERE k.amount < 0) - min(k.date) FILTER (WHERE k.amount < 0))::numeric)
    END
  FROM tags t
  LEFT JOIN kept k ON k.tag_id = t.id
  GROUP BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.fleet_toll_tag_balance_rows(p_org text)
RETURNS TABLE (
  tag_id text,
  ledger_count integer,
  balance numeric,
  usage_amount numeric,
  usage_count integer,
  span_days numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT * FROM fleet.toll_tag_balance_rows(p_org);
$$;

REVOKE ALL ON FUNCTION public.fleet_toll_tag_balance_rows(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_toll_tag_balance_rows(text) TO service_role;

CREATE OR REPLACE FUNCTION fleet.assign_toll_tag(p_org text, p_tag_id text, p_vehicle_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_tag fleet.toll_tags%ROWTYPE;
  v_vehicle fleet.vehicles%ROWTYPE;
  v_now timestamptz := now();
  v_plate text;
  v_prev text;
  v_occ text;
  v_payload jsonb;
  v_hist jsonb;
  v_vehicles jsonb := '[]'::jsonb;
  v_occ_payload jsonb;
  v_prev_payload jsonb;
  v_veh_payload jsonb;
BEGIN
  SELECT * INTO v_tag FROM fleet.toll_tags WHERE id = p_tag_id FOR UPDATE;
  IF NOT FOUND OR v_tag.organization_id IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'tag_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(v_tag.payload_json->>'status', '') = 'Retired' THEN
    RAISE EXCEPTION 'tag_retired' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_vehicle FROM fleet.vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF NOT FOUND OR v_vehicle.organization_id IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'vehicle_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_plate := coalesce(nullif(v_vehicle.license_plate, ''), nullif(v_vehicle.payload_json->>'licensePlate', ''), p_vehicle_id);
  v_payload := v_tag.payload_json;
  v_prev := nullif(v_payload->>'assignedVehicleId', '');
  v_occ := nullif(v_vehicle.payload_json->>'tollTagUuid', '');

  IF v_prev IS NOT NULL AND v_prev = p_vehicle_id AND v_occ IS NOT DISTINCT FROM p_tag_id THEN
    RETURN jsonb_build_object('tag', v_payload, 'vehicles', '[]'::jsonb);
  END IF;

  IF v_occ IS NOT NULL AND v_occ <> p_tag_id THEN
    UPDATE fleet.toll_tag_assignments
    SET unassigned_at = v_now
    WHERE tag_id = v_occ AND vehicle_id = p_vehicle_id AND unassigned_at IS NULL;

    UPDATE fleet.toll_tags t
    SET payload_json = (
          (t.payload_json - 'assignedVehicleId' - 'assignedVehicleName')
          || jsonb_build_object('updatedAt', v_now)
        ),
        vehicle_id = NULL,
        updated_at = v_now
    WHERE t.id = v_occ AND t.organization_id = p_org
    RETURNING payload_json INTO v_occ_payload;

    IF v_occ_payload IS NOT NULL THEN
      v_vehicles := v_vehicles || jsonb_build_array(jsonb_build_object('id', v_occ, 'kind', 'tag', 'payload', v_occ_payload));
    END IF;
  END IF;

  IF v_prev IS NOT NULL AND v_prev <> p_vehicle_id THEN
    UPDATE fleet.toll_tag_assignments
    SET unassigned_at = v_now
    WHERE tag_id = p_tag_id AND vehicle_id = v_prev AND unassigned_at IS NULL;

    UPDATE fleet.vehicles v
    SET payload_json = (v.payload_json - 'tollTagId' - 'tollTagUuid' - 'tollTagProvider') || jsonb_build_object('updatedAt', v_now),
        toll_tag_id = NULL,
        updated_at = v_now
    WHERE v.id = v_prev AND v.organization_id = p_org
    RETURNING payload_json INTO v_prev_payload;

    IF v_prev_payload IS NOT NULL THEN
      v_vehicles := v_vehicles || jsonb_build_array(jsonb_build_object('id', v_prev, 'kind', 'vehicle', 'payload', v_prev_payload));
    END IF;
  END IF;

  UPDATE fleet.toll_tag_assignments
  SET unassigned_at = v_now
  WHERE tag_id = p_tag_id AND unassigned_at IS NULL AND vehicle_id IS DISTINCT FROM p_vehicle_id;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.toll_tag_assignments
    WHERE tag_id = p_tag_id AND vehicle_id = p_vehicle_id AND unassigned_at IS NULL
  ) THEN
    INSERT INTO fleet.toll_tag_assignments (organization_id, tag_id, vehicle_id, assigned_at)
    VALUES (p_org, p_tag_id, p_vehicle_id, v_now);
  END IF;

  SELECT coalesce(jsonb_agg(
    CASE
      WHEN coalesce(elem->>'unassignedAt', '') = '' THEN elem || jsonb_build_object('unassignedAt', v_now)
      ELSE elem
    END
  ), '[]'::jsonb)
  INTO v_hist
  FROM jsonb_array_elements(coalesce(v_payload->'assignmentHistory', '[]'::jsonb)) elem;

  v_hist := v_hist || jsonb_build_array(jsonb_build_object(
    'vehicleId', p_vehicle_id,
    'vehicleName', v_plate,
    'assignedAt', v_now
  ));

  v_payload := v_payload || jsonb_build_object(
    'assignedVehicleId', p_vehicle_id,
    'assignedVehicleName', v_plate,
    'assignmentHistory', v_hist,
    'updatedAt', v_now
  );

  UPDATE fleet.toll_tags
  SET payload_json = v_payload,
      vehicle_id = p_vehicle_id,
      tag_number = coalesce(nullif(v_payload->>'tagNumber', ''), tag_number),
      updated_at = v_now
  WHERE id = p_tag_id;

  v_veh_payload := v_vehicle.payload_json || jsonb_build_object(
    'tollTagId', v_payload->>'tagNumber',
    'tollTagUuid', p_tag_id,
    'tollTagProvider', v_payload->>'provider',
    'updatedAt', v_now
  );

  UPDATE fleet.vehicles
  SET payload_json = v_veh_payload,
      toll_tag_id = v_payload->>'tagNumber',
      updated_at = v_now
  WHERE id = p_vehicle_id;

  v_vehicles := v_vehicles || jsonb_build_array(jsonb_build_object('id', p_vehicle_id, 'kind', 'vehicle', 'payload', v_veh_payload));

  RETURN jsonb_build_object('tag', v_payload, 'vehicles', v_vehicles);
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_assign_toll_tag(p_org text, p_tag_id text, p_vehicle_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT fleet.assign_toll_tag(p_org, p_tag_id, p_vehicle_id);
$$;

REVOKE ALL ON FUNCTION public.fleet_assign_toll_tag(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_assign_toll_tag(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION fleet.unassign_toll_tag(p_org text, p_tag_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_tag fleet.toll_tags%ROWTYPE;
  v_now timestamptz := now();
  v_vehicle_id text;
  v_payload jsonb;
  v_hist jsonb;
  v_veh_payload jsonb;
  v_vehicles jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_tag FROM fleet.toll_tags WHERE id = p_tag_id FOR UPDATE;
  IF NOT FOUND OR v_tag.organization_id IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'tag_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_payload := v_tag.payload_json;
  v_vehicle_id := nullif(v_payload->>'assignedVehicleId', '');

  IF v_vehicle_id IS NOT NULL THEN
    UPDATE fleet.toll_tag_assignments
    SET unassigned_at = v_now
    WHERE tag_id = p_tag_id AND vehicle_id = v_vehicle_id AND unassigned_at IS NULL;

    UPDATE fleet.vehicles v
    SET payload_json = (v.payload_json - 'tollTagId' - 'tollTagUuid' - 'tollTagProvider') || jsonb_build_object('updatedAt', v_now),
        toll_tag_id = NULL,
        updated_at = v_now
    WHERE v.id = v_vehicle_id AND v.organization_id = p_org
    RETURNING payload_json INTO v_veh_payload;

    IF v_veh_payload IS NOT NULL THEN
      v_vehicles := jsonb_build_array(jsonb_build_object('id', v_vehicle_id, 'kind', 'vehicle', 'payload', v_veh_payload));
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    CASE
      WHEN elem->>'vehicleId' = v_vehicle_id AND coalesce(elem->>'unassignedAt', '') = ''
        THEN elem || jsonb_build_object('unassignedAt', v_now)
      ELSE elem
    END
  ), '[]'::jsonb)
  INTO v_hist
  FROM jsonb_array_elements(coalesce(v_payload->'assignmentHistory', '[]'::jsonb)) elem;

  v_payload := (v_payload - 'assignedVehicleId' - 'assignedVehicleName') || jsonb_build_object(
    'assignmentHistory', v_hist,
    'updatedAt', v_now
  );

  UPDATE fleet.toll_tags
  SET payload_json = v_payload,
      vehicle_id = NULL,
      updated_at = v_now
  WHERE id = p_tag_id;

  RETURN jsonb_build_object('tag', v_payload, 'vehicles', v_vehicles);
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_unassign_toll_tag(p_org text, p_tag_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT fleet.unassign_toll_tag(p_org, p_tag_id);
$$;

REVOKE ALL ON FUNCTION public.fleet_unassign_toll_tag(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_unassign_toll_tag(text, text) TO service_role;

CREATE OR REPLACE FUNCTION fleet.retire_toll_tag(p_org text, p_tag_id text, p_reason text, p_expected text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_tag fleet.toll_tags%ROWTYPE;
  v_now timestamptz := now();
  v_payload jsonb;
  v_vehicle_id text;
  v_cleared jsonb;
BEGIN
  SELECT * INTO v_tag FROM fleet.toll_tags WHERE id = p_tag_id FOR UPDATE;
  IF NOT FOUND OR v_tag.organization_id IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'tag_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_payload := v_tag.payload_json;
  IF coalesce(v_payload->>'updatedAt', '') <> '' AND v_payload->>'updatedAt' IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'stale_write' USING ERRCODE = 'P0001';
  END IF;

  v_vehicle_id := nullif(v_payload->>'assignedVehicleId', '');
  IF v_vehicle_id IS NOT NULL THEN
    RAISE EXCEPTION 'tag_assigned' USING ERRCODE = 'P0001';
  END IF;

  UPDATE fleet.vehicles v
  SET payload_json = (v.payload_json - 'tollTagId' - 'tollTagUuid' - 'tollTagProvider') || jsonb_build_object('updatedAt', v_now),
      toll_tag_id = NULL,
      updated_at = v_now
  WHERE v.organization_id = p_org
    AND (v.payload_json->>'tollTagUuid') = p_tag_id;

  v_payload := v_payload || jsonb_build_object(
    'status', 'Retired',
    'retiredAt', v_now,
    'retiredReason', coalesce(nullif(p_reason, ''), 'Retired'),
    'updatedAt', v_now
  );

  UPDATE fleet.toll_tags
  SET payload_json = v_payload,
      updated_at = v_now
  WHERE id = p_tag_id;

  SELECT coalesce(jsonb_agg(v.id), '[]'::jsonb) INTO v_cleared
  FROM fleet.vehicles v
  WHERE v.organization_id = p_org AND (v.payload_json->>'tollTagUuid') IS NULL AND v.updated_at = v_now;

  RETURN jsonb_build_object('tag', v_payload, 'clearedVehicleIds', coalesce(v_cleared, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_retire_toll_tag(p_org text, p_tag_id text, p_reason text, p_expected text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT fleet.retire_toll_tag(p_org, p_tag_id, p_reason, p_expected);
$$;

REVOKE ALL ON FUNCTION public.fleet_retire_toll_tag(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_retire_toll_tag(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION fleet.scan_toll_low_balances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_org text;
  v_default numeric;
  r record;
  v_threshold numeric;
  v_balance numeric;
  v_known boolean;
  v_requested text;
  v_alert_key text;
  n integer := 0;
BEGIN
  FOR v_org IN
    SELECT DISTINCT organization_id
    FROM fleet.toll_tags
    WHERE organization_id IS NOT NULL
  LOOP
    SELECT NULLIF(s.payload_json->>'tollLowBalanceDefaultJmd', '')::numeric
      INTO v_default
    FROM fleet.organization_settings s
    WHERE s.organization_id = v_org
    ORDER BY s.updated_at DESC
    LIMIT 1;

    FOR r IN
      SELECT t.id, t.payload_json, b.ledger_count, b.balance
      FROM fleet.toll_tags t
      LEFT JOIN fleet.toll_tag_balance_rows(v_org) b ON b.tag_id = t.id
      WHERE t.organization_id = v_org
        AND coalesce(t.payload_json->>'status', '') NOT IN ('Retired', 'Inactive')
    LOOP
      v_threshold := COALESCE(NULLIF(r.payload_json->>'lowBalanceThreshold', '')::numeric, v_default, 500);
      IF COALESCE(r.ledger_count, 0) > 0 THEN
        v_balance := r.balance;
        v_known := true;
        UPDATE fleet.toll_tags
        SET payload_json = payload_json || jsonb_build_object(
              'lastCalculatedBalance', v_balance,
              'lastBalanceSyncedAt', now()
            )
        WHERE id = r.id;
      ELSIF (r.payload_json->>'lastCalculatedBalance') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        v_balance := (r.payload_json->>'lastCalculatedBalance')::numeric;
        v_known := true;
      ELSE
        v_balance := NULL;
        v_known := false;
      END IF;

      v_requested := coalesce(r.payload_json->>'topupRequestedAt', '');
      v_alert_key := 'alert:toll-low:' || v_org || ':' || r.id;

      IF v_known AND v_balance IS NOT NULL AND v_balance < v_threshold AND v_requested = '' THEN
        BEGIN
          INSERT INTO public.kv_store_37f42386 (key, value)
          VALUES (
            v_alert_key,
            jsonb_build_object(
              'id', 'toll-low:' || r.id,
              'orgId', v_org,
              'organizationId', v_org,
              'type', 'toll_low_balance',
              'severity', CASE WHEN v_balance <= 0 THEN 'warning' ELSE 'info' END,
              'title', 'Toll tag needs a top-up',
              'body', 'Tag ' || coalesce(r.payload_json->>'tagNumber', r.id)
                || ' is at J$' || trim(to_char(v_balance, 'FM999999990.00'))
                || ', under the J$' || trim(to_char(v_threshold, 'FM999999990')) || ' alert.',
              'createdAt', now(),
              'read', false
            )
          )
          ON CONFLICT (key) DO NOTHING;
        EXCEPTION
          WHEN undefined_table THEN NULL;
        END;
        n := n + 1;
      ELSE
        BEGIN
          DELETE FROM public.kv_store_37f42386 WHERE key = v_alert_key;
        EXCEPTION
          WHEN undefined_table THEN NULL;
        END;
        IF v_known AND v_balance IS NOT NULL AND v_balance >= v_threshold AND v_requested <> '' THEN
          UPDATE fleet.toll_tags
          SET payload_json = payload_json - 'topupRequestedAt'
          WHERE id = r.id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_scan_toll_low_balances()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT fleet.scan_toll_low_balances();
$$;

REVOKE ALL ON FUNCTION public.fleet_scan_toll_low_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_scan_toll_low_balances() TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('fleet-toll-low-balance');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'fleet-toll-low-balance',
      '15 11 * * *',
      $job$SELECT fleet.scan_toll_low_balances();$job$
    );
  END IF;
END
$cron$;
