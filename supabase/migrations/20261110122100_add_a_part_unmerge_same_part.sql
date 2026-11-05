-- AM-01 follow-up: global group recompute after same-part merge; owner unmerge.

CREATE OR REPLACE FUNCTION public.part_match_conflict_merge_same_part(
  p_conflict_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  v_survivor uuid;
  v_other uuid;
  v_part uuid;
  v_groups uuid[] := '{}'::uuid[];
  v_g uuid;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN
    RAISE EXCEPTION 'Conflict not open';
  END IF;
  IF c.conflict_type <> 'oe_ambiguous' THEN
    RAISE EXCEPTION 'Same-part merge applies to oe_ambiguous only';
  END IF;
  IF nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;
  IF NOT c.detail ? 'group_ids' THEN
    RAISE EXCEPTION 'Conflict missing group_ids detail';
  END IF;

  v_survivor := c.interchange_group_id;

  FOR v_other IN
    SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
  LOOP
    IF v_other = v_survivor THEN
      CONTINUE;
    END IF;
    FOR v_part IN
      SELECT pm.id FROM public.part_master pm WHERE pm.interchange_group_id = v_other
    LOOP
      UPDATE public.part_master pm
      SET interchange_group_id = v_survivor
      WHERE pm.id = v_part
        AND pm.interchange_group_id IS DISTINCT FROM v_survivor;
      IF FOUND THEN
        INSERT INTO public.interchange_group_merge_log (
          part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
        ) VALUES (
          v_part, v_other, v_survivor, 'oe_same_part', c.matched_key, c.id, p_actor
        );
      END IF;
    END LOOP;
    IF NOT v_other = ANY (v_groups) THEN
      v_groups := array_append(v_groups, v_other);
    END IF;
  END LOOP;

  IF NOT v_survivor = ANY (v_groups) THEN
    v_groups := array_append(v_groups, v_survivor);
  END IF;

  UPDATE public.part_match_conflict oc
  SET status = 'superseded',
      resolution_note = format('Merged into survivor group via same-part merge: %s', coalesce(p_note, '')),
      resolved_at = now(),
      resolved_by = p_actor
  WHERE oc.status = 'open'
    AND oc.conflict_type = 'oe_ambiguous'
    AND oc.vehicle_catalog_id = c.vehicle_catalog_id
    AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id
    AND oc.id <> c.id
    AND oc.interchange_group_id = ANY (v_groups);

  UPDATE public.part_match_conflict
  SET status = 'kept',
      resolution_note = p_note,
      resolved_by = p_actor,
      resolved_at = now()
  WHERE id = p_conflict_id;

  FOREACH v_g IN ARRAY v_groups
  LOOP
    PERFORM public.part_match_recompute(v_g, NULL);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_unmerge_same_part(
  p_conflict_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.part_match_conflict%ROWTYPE;
  m public.interchange_group_merge_log%ROWTYPE;
  v_groups uuid[] := '{}'::uuid[];
  v_g uuid;
  v_moved int := 0;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'kept' THEN
    RAISE EXCEPTION 'Conflict not in kept state';
  END IF;
  IF c.conflict_type <> 'oe_ambiguous' THEN
    RAISE EXCEPTION 'Unmerge applies to oe_ambiguous only';
  END IF;

  FOR m IN
    SELECT * FROM public.interchange_group_merge_log ml
    WHERE ml.conflict_id = p_conflict_id
      AND ml.reversed_at IS NULL
      AND ml.rule = 'oe_same_part'
    FOR UPDATE
  LOOP
    UPDATE public.part_master pm
    SET interchange_group_id = m.from_group
    WHERE pm.id = m.part_id
      AND pm.interchange_group_id = m.to_group;
    IF FOUND THEN
      v_moved := v_moved + 1;
    END IF;
    UPDATE public.interchange_group_merge_log ml
    SET reversed_at = now()
    WHERE ml.id = m.id;
    IF NOT m.from_group = ANY (v_groups) THEN
      v_groups := array_append(v_groups, m.from_group);
    END IF;
    IF NOT m.to_group = ANY (v_groups) THEN
      v_groups := array_append(v_groups, m.to_group);
    END IF;
  END LOOP;

  IF v_moved = 0 THEN
    RAISE EXCEPTION 'No active same-part merge for this conflict';
  END IF;

  UPDATE public.part_match_conflict
  SET status = 'open',
      resolution_note = NULL,
      resolved_at = NULL,
      resolved_by = NULL
  WHERE id = p_conflict_id;

  UPDATE public.part_match_conflict oc
  SET status = 'open',
      resolution_note = NULL,
      resolved_at = NULL,
      resolved_by = NULL
  WHERE oc.status = 'superseded'
    AND oc.conflict_type = 'oe_ambiguous'
    AND oc.vehicle_catalog_id = c.vehicle_catalog_id
    AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id
    AND oc.interchange_group_id = ANY (v_groups);

  FOREACH v_g IN ARRAY v_groups
  LOOP
    PERFORM public.part_match_recompute(v_g, NULL);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_unmerge_same_part(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_unmerge_same_part(uuid, uuid) TO service_role;
