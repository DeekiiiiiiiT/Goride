-- Fleet inventory kit versions and rules (audit §5.1). Stage D-1 (P9 / D10) + D-2 (P10).

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY version_id
      ORDER BY sort_order, (line_type <> 'item'), id
    ) AS new_sort_order
  FROM fleet.kit_template_line
)
UPDATE fleet.kit_template_line AS ktl
SET sort_order = ranked.new_sort_order
FROM ranked
WHERE ktl.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS kit_template_line_version_sort_uidx
  ON fleet.kit_template_line (version_id, sort_order);

-- P10: fleet-wide serial uniqueness (stricter than existing per-item index inv_asset_org_item_serial_uidx)
CREATE UNIQUE INDEX IF NOT EXISTS inv_asset_org_serial_uidx
  ON fleet.inv_asset (organization_id, serial_number)
  WHERE serial_number IS NOT NULL;

-- At most one draft / one production row per kit template
CREATE UNIQUE INDEX IF NOT EXISTS kit_template_version_one_draft_uidx
  ON fleet.kit_template_version (template_id)
  WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS kit_template_version_one_production_uidx
  ON fleet.kit_template_version (template_id)
  WHERE status = 'production';

-- D-3 (P13) + D-4: save kit template draft lines (service_role only)
CREATE OR REPLACE FUNCTION fleet.inv_save_kit_draft(
  p_org_id text,
  p_template_id uuid,
  p_lines jsonb,
  p_change_note text,
  p_author uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_template_org text;
  v_draft_id uuid;
  v_next_version integer;
  v_line jsonb;
  v_line_type text;
  v_item_id uuid;
  v_qty numeric;
  v_required boolean;
  v_blocks boolean;
  v_sort integer;
  v_line_count integer;
  v_seen_item_ids uuid[] := '{}';
  v_seen_linked_types text[] := '{}';
  v_item_org text;
  v_item_archived timestamptz;
  v_install_position text;
  v_variant_note text;
  v_version integer;
BEGIN
  IF p_org_id IS NULL OR btrim(p_org_id) = '' THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  SELECT organization_id INTO v_template_org
  FROM fleet.kit_template
  WHERE id = p_template_id
  FOR UPDATE;

  IF v_template_org IS NULL THEN
    RAISE EXCEPTION 'kit template not found';
  END IF;
  IF v_template_org <> p_org_id THEN
    RAISE EXCEPTION 'kit template not found for organization';
  END IF;

  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(COALESCE(p_lines, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'kit draft lines must be a non-empty array';
  END IF;

  v_line_count := jsonb_array_length(p_lines);
  v_sort := 0;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_sort := v_sort + 1;
    v_line_type := lower(coalesce(v_line->>'line_type', 'item'));

    IF v_line_type NOT IN ('item', 'linked_toll_tag', 'linked_fuel_card') THEN
      RAISE EXCEPTION 'invalid kit line type at position %', v_sort;
    END IF;

    IF v_line->>'item_id' IS NOT NULL AND v_line->>'item_id' <> '' THEN
      BEGIN
        v_item_id := (v_line->>'item_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'invalid item_id at position %', v_sort;
      END;
    ELSE
      v_item_id := NULL;
    END IF;

    IF v_line_type = 'item' THEN
      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'item_id required for item line at position %', v_sort;
      END IF;

      SELECT organization_id, archived_at
      INTO v_item_org, v_item_archived
      FROM fleet.inv_item
      WHERE id = v_item_id;

      IF v_item_org IS NULL THEN
        RAISE EXCEPTION 'item not found at position %', v_sort;
      END IF;
      IF v_item_org <> p_org_id THEN
        RAISE EXCEPTION 'item belongs to another fleet at position %', v_sort;
      END IF;
      IF v_item_archived IS NOT NULL THEN
        RAISE EXCEPTION 'archived item at position %', v_sort;
      END IF;

      IF v_item_id = ANY (v_seen_item_ids) THEN
        RAISE EXCEPTION 'duplicate item on kit draft at position %', v_sort;
      END IF;
      v_seen_item_ids := array_append(v_seen_item_ids, v_item_id);
    ELSE
      IF v_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'linked kit line must not include item_id at position %', v_sort;
      END IF;

      IF v_line_type = ANY (v_seen_linked_types) THEN
        RAISE EXCEPTION 'duplicate line at position %', v_sort;
      END IF;
      v_seen_linked_types := array_append(v_seen_linked_types, v_line_type);
    END IF;

    IF v_line ? 'qty_required' AND v_line->>'qty_required' IS NOT NULL AND v_line->>'qty_required' <> '' THEN
      v_qty := (v_line->>'qty_required')::numeric;
    ELSIF v_line ? 'qty' AND v_line->>'qty' IS NOT NULL AND v_line->>'qty' <> '' THEN
      v_qty := (v_line->>'qty')::numeric;
    ELSE
      RAISE EXCEPTION 'qty must be positive at position %', v_sort;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'qty must be positive at position %', v_sort;
    END IF;
  END LOOP;

  SELECT id INTO v_draft_id
  FROM fleet.kit_template_version
  WHERE template_id = p_template_id
    AND status = 'draft'
  LIMIT 1;

  IF v_draft_id IS NULL THEN
    SELECT coalesce(max(version), 0) + 1 INTO v_next_version
    FROM fleet.kit_template_version
    WHERE template_id = p_template_id;

    INSERT INTO fleet.kit_template_version (
      organization_id, template_id, version, status, change_note, author
    ) VALUES (
      p_org_id, p_template_id, v_next_version, 'draft', p_change_note, p_author
    )
    RETURNING id, version INTO v_draft_id, v_version;
  ELSE
    UPDATE fleet.kit_template_version
    SET change_note = p_change_note,
        author = p_author
    WHERE id = v_draft_id
    RETURNING version INTO v_version;
  END IF;

  DELETE FROM fleet.kit_template_line
  WHERE version_id = v_draft_id;

  v_sort := 0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_sort := v_sort + 1;
    v_line_type := lower(coalesce(v_line->>'line_type', 'item'));

    IF v_line ? 'qty_required' AND v_line->>'qty_required' IS NOT NULL AND v_line->>'qty_required' <> '' THEN
      v_qty := (v_line->>'qty_required')::numeric;
    ELSE
      v_qty := (v_line->>'qty')::numeric;
    END IF;

    v_required := coalesce((v_line->>'required')::boolean, true);
    v_blocks := coalesce((v_line->>'blocks_road_clearance')::boolean, false);
    v_install_position := nullif(btrim(v_line->>'install_position'), '');
    v_variant_note := nullif(btrim(v_line->>'variant_note'), '');

    IF v_line_type = 'item' THEN
      v_item_id := (v_line->>'item_id')::uuid;
      INSERT INTO fleet.kit_template_line (
        organization_id, version_id, line_type, item_id,
        qty_required, required, blocks_road_clearance, install_position, variant_note, sort_order
      ) VALUES (
        p_org_id, v_draft_id, v_line_type, v_item_id,
        v_qty, v_required, v_blocks, v_install_position, v_variant_note, v_sort
      );
    ELSE
      INSERT INTO fleet.kit_template_line (
        organization_id, version_id, line_type, item_id,
        qty_required, required, blocks_road_clearance, install_position, variant_note, sort_order
      ) VALUES (
        p_org_id, v_draft_id, v_line_type, NULL,
        v_qty, v_required, v_blocks, v_install_position, v_variant_note, v_sort
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'template_id', p_template_id,
    'version_id', v_draft_id,
    'version', v_version,
    'status', 'draft',
    'line_count', v_line_count,
    'change_note', p_change_note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_save_kit_draft(
  p_org_id text,
  p_template_id uuid,
  p_lines jsonb,
  p_change_note text,
  p_author uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_save_kit_draft(
  p_org_id, p_template_id, p_lines, p_change_note, p_author
); $$;

REVOKE ALL ON FUNCTION fleet.inv_save_kit_draft(text, uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_save_kit_draft(text, uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_save_kit_draft(text, uuid, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_inv_save_kit_draft(text, uuid, jsonb, text, uuid) TO service_role;

-- D-4 (P13): publish kit draft → production (service_role only)
DROP FUNCTION IF EXISTS public.fleet_inv_publish_kit_version(text, uuid, uuid, text);
DROP FUNCTION IF EXISTS fleet.inv_publish_kit_version(text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION fleet.inv_publish_kit_version(
  p_org_id text,
  p_template_id uuid,
  p_version_id uuid,
  p_move_vehicles boolean,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_template_org text;
  v_version_status text;
  v_version_template uuid;
  v_version_num integer;
  v_line_count integer;
  v_vehicles_on_template integer;
  v_vehicles_moved integer;
BEGIN
  IF p_org_id IS NULL OR btrim(p_org_id) = '' THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  SELECT organization_id INTO v_template_org
  FROM fleet.kit_template
  WHERE id = p_template_id
  FOR UPDATE;

  IF v_template_org IS NULL THEN
    RAISE EXCEPTION 'kit template not found';
  END IF;
  IF v_template_org <> p_org_id THEN
    RAISE EXCEPTION 'kit template not found for organization';
  END IF;

  SELECT ktv.status, ktv.template_id, ktv.version
  INTO v_version_status, v_version_template, v_version_num
  FROM fleet.kit_template_version ktv
  WHERE ktv.id = p_version_id
    AND ktv.organization_id = p_org_id;

  IF v_version_status IS NULL
     OR v_version_template IS DISTINCT FROM p_template_id
     OR v_version_status <> 'draft' THEN
    RAISE EXCEPTION 'version is not a draft';
  END IF;

  SELECT count(*) INTO v_line_count
  FROM fleet.kit_template_line
  WHERE version_id = p_version_id;

  IF v_line_count < 1 THEN
    RAISE EXCEPTION 'version is not a draft';
  END IF;

  SELECT count(*) INTO v_vehicles_on_template
  FROM fleet.vehicle_kit
  WHERE organization_id = p_org_id
    AND template_id = p_template_id;

  UPDATE fleet.kit_template_version
  SET status = 'archived'
  WHERE template_id = p_template_id
    AND organization_id = p_org_id
    AND status = 'production';

  UPDATE fleet.kit_template_version
  SET status = 'production',
      published_at = now()
  WHERE id = p_version_id;

  IF p_move_vehicles THEN
    UPDATE fleet.vehicle_kit
    SET version_id = p_version_id,
        updated_at = now()
    WHERE organization_id = p_org_id
      AND template_id = p_template_id;

    GET DIAGNOSTICS v_vehicles_moved = ROW_COUNT;
  ELSE
    v_vehicles_moved := 0;
  END IF;

  RETURN jsonb_build_object(
    'version_id', p_version_id,
    'version', v_version_num,
    'vehicles_moved', v_vehicles_moved,
    'vehicles_on_template', v_vehicles_on_template
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_publish_kit_version(
  p_org_id text,
  p_template_id uuid,
  p_version_id uuid,
  p_move_vehicles boolean,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.inv_publish_kit_version(
  p_org_id, p_template_id, p_version_id, p_move_vehicles, p_idempotency_key
); $$;

REVOKE ALL ON FUNCTION fleet.inv_publish_kit_version(text, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_inv_publish_kit_version(text, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_publish_kit_version(text, uuid, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_inv_publish_kit_version(text, uuid, uuid, boolean, text) TO service_role;
