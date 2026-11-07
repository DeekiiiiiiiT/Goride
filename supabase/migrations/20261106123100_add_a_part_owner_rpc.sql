-- Snapshot + AP-05 part-type owner RPCs + save response chassis list

CREATE OR REPLACE FUNCTION public.part_import_row_snapshot(
  p_table text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_table = 'part_master' THEN
    RETURN (SELECT to_jsonb(pm.*) FROM public.part_master pm WHERE pm.id = p_id);
  ELSIF p_table = 'part_listing' THEN
    RETURN (SELECT to_jsonb(pl.*) FROM public.part_listing pl WHERE pl.id = p_id);
  ELSIF p_table = 'part_interchange_group' THEN
    RETURN (SELECT to_jsonb(g.*) FROM public.part_interchange_group g WHERE g.id = p_id);
  ELSIF p_table = 'vehicle_oe_number' THEN
    RETURN (SELECT to_jsonb(v.*) FROM public.vehicle_oe_number v WHERE v.id = p_id);
  ELSIF p_table = 'part_oe_reference' THEN
    RETURN (SELECT to_jsonb(r.*) FROM public.part_oe_reference r WHERE r.id = p_id);
  ELSIF p_table = 'part_index_number' THEN
    RETURN (SELECT to_jsonb(i.*) FROM public.part_index_number i WHERE i.id = p_id);
  ELSIF p_table = 'part_approval' THEN
    RETURN (SELECT to_jsonb(a.*) FROM public.part_approval a WHERE a.id = p_id);
  ELSIF p_table = 'platform_component_link' THEN
    RETURN (SELECT to_jsonb(l.*) FROM public.platform_component_link l WHERE l.id = p_id);
  ELSIF p_table = 'interchange_group_merge_log' THEN
    RETURN (SELECT to_jsonb(m.*) FROM public.interchange_group_merge_log m WHERE m.id = p_id);
  ELSIF p_table = 'catalog_spec_value' THEN
    RETURN (SELECT to_jsonb(s.*) FROM public.catalog_spec_value s WHERE s.id = p_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_serve_top_brands(p_part_type_id uuid, p_limit int DEFAULT 4)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'count' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('brand', pm.manufacturer, 'count', count(*)::int) AS row
    FROM public.part_master pm
    WHERE pm.maintenance_component_id = p_part_type_id
      AND btrim(coalesce(pm.manufacturer, '')) <> ''
    GROUP BY pm.manufacturer
    ORDER BY count(*) DESC
    LIMIT greatest(1, least(coalesce(p_limit, 4), 10))
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.self_serve_top_brands(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_top_brands(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.list_self_serve_engine_families(p_q text DEFAULT '', p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'code'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', ef.id,
      'code', ef.code,
      'notes', ef.notes,
      'variantCount', (
        SELECT count(*)::int FROM public.vehicle_catalog vc WHERE vc.engine_family_id = ef.id
      )
    ) AS row
    FROM public.engine_family ef
    WHERE p_q IS NULL OR btrim(p_q) = '' OR ef.code ILIKE '%' || btrim(p_q) || '%'
    ORDER BY ef.code
    LIMIT greatest(1, least(coalesce(p_limit, 30), 50))
  ) sub;
$$;

REVOKE ALL ON FUNCTION public.list_self_serve_engine_families(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_self_serve_engine_families(text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_self_serve_part_type(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := nullif(p_input->>'id', '')::uuid;
  v_parent uuid := nullif(p_input->>'areaId', '')::uuid;
  v_name text := btrim(coalesce(p_input->>'name', ''));
  v_op text := upper(btrim(coalesce(p_input->>'opCode', '')));
  v_mode text := lower(coalesce(p_input->>'defaultFitMode', 'specific'));
  v_scheme text := lower(coalesce(p_input->>'positionScheme', 'none'));
  v_status text := lower(coalesce(p_input->>'status', 'active'));
  v_hint text := nullif(btrim(coalesce(p_input->>'editorHint', '')), '');
  v_term text := nullif(btrim(coalesce(p_input->>'tradeTerm', '')), '');
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Choose an area'; END IF;
  IF v_mode NOT IN ('specific', 'engine', 'spec') THEN RAISE EXCEPTION 'Invalid fit mode'; END IF;
  IF v_status NOT IN ('active', 'draft') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  IF v_id IS NULL THEN
    IF v_op = '' THEN RAISE EXCEPTION 'Op code is required for new types'; END IF;
    INSERT INTO public.maintenance_service_categories (
      code, name, plain_name, parent_id, is_part, op_code, kind,
      default_fit_mode, position_scheme, trade_term, editor_hint, part_type_status, sort_order
    ) VALUES (
      lower(replace(v_op, '-', '_')), v_name, v_name, v_parent, true, v_op, 'component',
      v_mode, v_scheme, v_term, v_hint, v_status, 900
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.maintenance_service_categories
    SET name = v_name,
        plain_name = v_name,
        parent_id = v_parent,
        default_fit_mode = v_mode,
        position_scheme = v_scheme,
        trade_term = v_term,
        editor_hint = v_hint,
        part_type_status = v_status,
        op_code = CASE WHEN v_op <> '' THEN v_op ELSE op_code END
    WHERE id = v_id AND is_part IS TRUE AND kind = 'component';
    IF NOT FOUND THEN RAISE EXCEPTION 'Part type not found'; END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_self_serve_part_type(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_self_serve_part_type(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.decide_part_type_request(
  p_request_id uuid,
  p_action text,
  p_actor uuid,
  p_decline_reason text DEFAULT NULL,
  p_new_type jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req record;
  v_type_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.part_type_request WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request already decided'; END IF;

  IF p_action = 'decline' THEN
    UPDATE public.part_type_request
    SET status = 'declined', decided_by = p_actor, decline_reason = nullif(btrim(coalesce(p_decline_reason, '')), ''), updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'declined');
  ELSIF p_action = 'reject' THEN
    UPDATE public.part_type_request
    SET status = 'declined', decided_by = p_actor, decline_reason = coalesce(nullif(btrim(coalesce(p_decline_reason, '')), ''), 'Rejected'), updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'declined');
  ELSIF p_action = 'create_part_type' THEN
    IF p_new_type IS NULL THEN RAISE EXCEPTION 'Part type details required'; END IF;
    v_type_id := (public.upsert_self_serve_part_type(p_new_type)->>'id')::uuid;
    UPDATE public.part_type_request
    SET status = 'approved', decided_by = p_actor, created_part_type_id = v_type_id, updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'approved', 'partTypeId', v_type_id);
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_part_type_request(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_part_type_request(uuid, text, uuid, text, jsonb) TO service_role;

-- Extend save response with chassis codes for AP9
CREATE OR REPLACE FUNCTION public.self_serve_save_chassis_list(p_input jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(DISTINCT vc.chassis_code ORDER BY vc.chassis_code), '[]'::jsonb)
  FROM (
    SELECT (elem->>'vehicleId')::uuid AS vid
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_input->'listings') = 'array' THEN p_input->'listings'
        WHEN jsonb_typeof(p_input->'vehicleIds') = 'array' THEN (
          SELECT jsonb_agg(jsonb_build_object('vehicleId', x))
          FROM jsonb_array_elements_text(p_input->'vehicleIds') AS t(x)
        )
        ELSE '[]'::jsonb
      END
    ) AS elem
    WHERE nullif(elem->>'vehicleId', '') IS NOT NULL
  ) ids
  JOIN public.vehicle_catalog vc ON vc.id = ids.vid
  WHERE btrim(coalesce(vc.chassis_code, '')) <> '';
$$;

REVOKE ALL ON FUNCTION public.self_serve_save_chassis_list(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_save_chassis_list(jsonb) TO service_role;
