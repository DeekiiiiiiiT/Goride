-- Rev 53 S-08–S-10: asset move-to-store, atomic condition/repair, repair cost on events, next inspection RPCs.

ALTER TABLE fleet.inv_asset_event
  ADD COLUMN IF NOT EXISTS cost_jmd numeric(14, 2);

CREATE OR REPLACE VIEW public.fleet_inv_asset_event
WITH (security_invoker = true) AS SELECT * FROM fleet.inv_asset_event;
REVOKE ALL ON public.fleet_inv_asset_event FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_asset_event TO service_role;

-- ---------------------------------------------------------------------------
-- S-08: move unit back to storeroom with ledger transfer + history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_asset_move_to_store(
  p_org_id text,
  p_asset_id uuid,
  p_to_location_id uuid,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_asset record;
  v_from_loc uuid;
  v_to_loc uuid;
  v_from_label text;
  v_to_label text;
  v_on_hand numeric;
  v_xfer jsonb;
  v_title text;
  v_body text;
BEGIN
  SELECT a.* INTO v_asset
  FROM fleet.inv_asset a
  WHERE a.organization_id = p_org_id AND a.id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  SELECT l.id, COALESCE(l.name, l.code) INTO v_to_loc, v_to_label
  FROM fleet.inv_location l
  WHERE l.organization_id = p_org_id
    AND l.id = p_to_location_id
    AND l.kind = 'warehouse'
    AND l.is_active = true;
  IF v_to_loc IS NULL THEN
    RAISE EXCEPTION 'destination must be an active warehouse location';
  END IF;

  v_from_loc := v_asset.location_id;
  IF v_from_loc IS NOT NULL THEN
    SELECT COALESCE(v.license_plate, l.name, l.code, 'location')
    INTO v_from_label
    FROM fleet.inv_location l
    LEFT JOIN fleet.vehicles v ON v.id = l.vehicle_id
    WHERE l.organization_id = p_org_id AND l.id = v_from_loc;
  ELSE
    v_from_label := 'unknown';
  END IF;

  IF v_from_loc IS NOT NULL AND v_from_loc <> v_to_loc THEN
    SELECT COALESCE(sum(b.on_hand), 0) INTO v_on_hand
    FROM fleet.inv_balance b
    WHERE b.organization_id = p_org_id
      AND b.item_id = v_asset.item_id
      AND b.location_id = v_from_loc;

    IF v_on_hand >= 1 THEN
      v_xfer := fleet.inv_transfer(
        p_org_id,
        v_asset.item_id,
        v_from_loc,
        v_to_loc,
        NULL,
        NULL,
        1,
        p_idempotency_key
      );
    END IF;
  END IF;

  UPDATE fleet.inv_asset
  SET location_id = v_to_loc,
      status = 'in_store',
      updated_at = now()
  WHERE organization_id = p_org_id AND id = p_asset_id;

  v_title := format(
    'Moved from %s to %s',
    COALESCE(v_from_label, 'store'),
    COALESCE(v_to_label, p_to_location_id::text)
  );
  v_body := NULLIF(btrim(COALESCE(p_note, '')), '');

  INSERT INTO fleet.inv_asset_event (
    organization_id, asset_id, type, title, body
  )
  VALUES (
    p_org_id,
    p_asset_id,
    'move',
    v_title,
    v_body
  );

  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'to_location_id', p_to_location_id,
    'transfer', v_xfer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_asset_move_to_store(
  p_org_id text,
  p_asset_id uuid,
  p_to_location_id uuid,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
  SELECT fleet.inv_asset_move_to_store(
    p_org_id, p_asset_id, p_to_location_id, p_note, p_idempotency_key
  );
$$;

REVOKE ALL ON FUNCTION fleet.inv_asset_move_to_store(text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_asset_move_to_store(text, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fleet_inv_asset_move_to_store(text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_inv_asset_move_to_store(text, uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- S-10: condition change (status + history atomically)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_asset_set_condition(
  p_org_id text,
  p_asset_id uuid,
  p_status text,
  p_note text,
  p_actor uuid DEFAULT NULL,
  p_photo_paths text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_asset record;
BEGIN
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'note required';
  END IF;

  IF p_status IS NULL OR btrim(p_status) = '' THEN
    RAISE EXCEPTION 'status required';
  END IF;

  IF p_status NOT IN (
    'in_store', 'installed', 'in_repair', 'faulty', 'lost', 'retired', 'disposed'
  ) THEN
    RAISE EXCEPTION 'invalid asset status: %', p_status;
  END IF;

  SELECT a.* INTO v_asset
  FROM fleet.inv_asset a
  WHERE a.organization_id = p_org_id AND a.id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  UPDATE fleet.inv_asset
  SET status = p_status,
      updated_at = now()
  WHERE organization_id = p_org_id AND id = p_asset_id;

  INSERT INTO fleet.inv_asset_event (
    organization_id, asset_id, type, title, body, actor, photo_paths
  )
  VALUES (
    p_org_id,
    p_asset_id,
    'condition',
    'Condition updated',
    btrim(p_note),
    p_actor,
    COALESCE(p_photo_paths, '{}'::text[])
  );

  RETURN jsonb_build_object('asset_id', p_asset_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_asset_set_condition(
  p_org_id text,
  p_asset_id uuid,
  p_status text,
  p_note text,
  p_actor uuid DEFAULT NULL,
  p_photo_paths text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
  SELECT fleet.inv_asset_set_condition(
    p_org_id, p_asset_id, p_status, p_note, p_actor, p_photo_paths
  );
$$;

REVOKE ALL ON FUNCTION fleet.inv_asset_set_condition(text, uuid, text, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_asset_set_condition(text, uuid, text, text, uuid, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.fleet_inv_asset_set_condition(text, uuid, text, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_inv_asset_set_condition(text, uuid, text, text, uuid, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- S-10: log repair (status + history + cost_jmd atomically)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_asset_log_repair(
  p_org_id text,
  p_asset_id uuid,
  p_description text,
  p_set_status text DEFAULT 'in_repair',
  p_cost_jmd numeric DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_photo_paths text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_status text;
  v_cost numeric(14, 2);
BEGIN
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'description required';
  END IF;

  v_status := COALESCE(NULLIF(btrim(p_set_status), ''), 'in_repair');
  IF v_status NOT IN (
    'in_store', 'installed', 'in_repair', 'faulty', 'lost', 'retired', 'disposed'
  ) THEN
    RAISE EXCEPTION 'invalid asset status: %', v_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.inv_asset a
    WHERE a.organization_id = p_org_id AND a.id = p_asset_id
  ) THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  IF p_cost_jmd IS NOT NULL THEN
    v_cost := p_cost_jmd::numeric(14, 2);
  ELSE
    v_cost := NULL;
  END IF;

  UPDATE fleet.inv_asset
  SET status = v_status,
      updated_at = now()
  WHERE organization_id = p_org_id AND id = p_asset_id;

  INSERT INTO fleet.inv_asset_event (
    organization_id, asset_id, type, title, body, actor, photo_paths, cost_jmd
  )
  VALUES (
    p_org_id,
    p_asset_id,
    'repair',
    'Repair logged',
    btrim(p_description),
    p_actor,
    COALESCE(p_photo_paths, '{}'::text[]),
    v_cost
  );

  RETURN jsonb_build_object('asset_id', p_asset_id, 'status', v_status, 'cost_jmd', v_cost);
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_asset_log_repair(
  p_org_id text,
  p_asset_id uuid,
  p_description text,
  p_set_status text DEFAULT 'in_repair',
  p_cost_jmd numeric DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_photo_paths text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
  SELECT fleet.inv_asset_log_repair(
    p_org_id, p_asset_id, p_description, p_set_status, p_cost_jmd, p_actor, p_photo_paths
  );
$$;

REVOKE ALL ON FUNCTION fleet.inv_asset_log_repair(text, uuid, text, text, numeric, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_asset_log_repair(text, uuid, text, text, numeric, uuid, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.fleet_inv_asset_log_repair(text, uuid, text, text, numeric, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_inv_asset_log_repair(text, uuid, text, text, numeric, uuid, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- S-09: next check / inspection due date + history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_asset_set_next_inspection(
  p_org_id text,
  p_asset_id uuid,
  p_next_inspection_due date,
  p_note text,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
BEGIN
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'note required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.inv_asset a
    WHERE a.organization_id = p_org_id AND a.id = p_asset_id
  ) THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  UPDATE fleet.inv_asset
  SET next_inspection_due = p_next_inspection_due,
      updated_at = now()
  WHERE organization_id = p_org_id AND id = p_asset_id;

  INSERT INTO fleet.inv_asset_event (
    organization_id, asset_id, type, title, body, actor
  )
  VALUES (
    p_org_id,
    p_asset_id,
    'inspection_due',
    'Next check date updated',
    format('%s · %s', COALESCE(p_next_inspection_due::text, 'cleared'), btrim(p_note)),
    p_actor
  );

  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'next_inspection_due', p_next_inspection_due
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_asset_set_next_inspection(
  p_org_id text,
  p_asset_id uuid,
  p_next_inspection_due date,
  p_note text,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
  SELECT fleet.inv_asset_set_next_inspection(
    p_org_id, p_asset_id, p_next_inspection_due, p_note, p_actor
  );
$$;

REVOKE ALL ON FUNCTION fleet.inv_asset_set_next_inspection(text, uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_asset_set_next_inspection(text, uuid, date, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fleet_inv_asset_set_next_inspection(text, uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_inv_asset_set_next_inspection(text, uuid, date, text, uuid) TO service_role;

-- Fix cutdown inv_transfer: do not pre-consume FIFO before append (append consumes on negative legs).
CREATE OR REPLACE FUNCTION fleet.inv_transfer(
  p_org_id text,
  p_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_bin_from uuid,
  p_bin_to uuid,
  p_qty numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_cost numeric;
  v_leg uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'TRF-');
  INSERT INTO fleet.inv_movement (organization_id, ref_no, type, reference_type, idempotency_key)
  VALUES (p_org_id, v_ref, 'transfer', 'transfer', p_idempotency_key)
  RETURNING id INTO v_movement_id;

  v_leg := fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_from_location_id, p_bin_from, NULL, -p_qty, NULL
  );
  SELECT unit_cost INTO v_cost FROM fleet.inv_ledger WHERE id = v_leg;
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_to_location_id, p_bin_to, NULL, p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;
