-- Index merge (ungrouped parts, busy+empty proposals, tie-break) + Keep respects import listings
-- Depends on 20261107250000_parts_for_vehicle_audit_gaps.sql

ALTER TABLE public.interchange_group_merge_log
  ALTER COLUMN from_group DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.part_match_index_rules(
  p_group_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH pairs AS (
    SELECT
      pin.id AS index_id,
      pin.part_id,
      pin2.part_id AS matched_part_id,
      pin.index_type,
      pin.value_norm,
      pin.wear_sensor AS sensor_a,
      pin2.wear_sensor AS sensor_b,
      pm.interchange_group_id AS from_group,
      pm2.interchange_group_id AS to_group
    FROM public.part_index_number pin
    JOIN public.part_master pm ON pm.id = pin.part_id
    JOIN public.part_index_number pin2
      ON pin2.index_type = pin.index_type
     AND pin2.value_norm = pin.value_norm
     AND pin2.part_id <> pin.part_id
    JOIN public.part_master pm2 ON pm2.id = pin2.part_id
    WHERE pin.part_id < pin2.part_id
      AND pm.interchange_group_id IS DISTINCT FROM pm2.interchange_group_id
      AND (pm.interchange_group_id IS NOT NULL OR pm2.interchange_group_id IS NOT NULL)
      AND (
        p_group_id IS NOT NULL AND (
          pm.interchange_group_id IS NOT DISTINCT FROM p_group_id
          OR pm2.interchange_group_id IS NOT DISTINCT FROM p_group_id
        )
        OR p_group_id IS NULL AND (
          NOT EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1)
          OR EXISTS (
            SELECT 1 FROM _pm_batch_scope bs
            WHERE bs.group_id IS NOT DISTINCT FROM pm.interchange_group_id
               OR bs.group_id IS NOT DISTINCT FROM pm2.interchange_group_id
          )
        )
      )
  ),
  wear_conflicts AS (
    INSERT INTO public.part_match_conflict (
      conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
    )
    SELECT
      'index_wear_sensor',
      p.part_id,
      p.from_group,
      p.index_type || ':' || p.value_norm,
      jsonb_build_object(
        'index_type', p.index_type,
        'value', p.value_norm,
        'part_a_id', p.part_id,
        'sensor_a', p.sensor_a,
        'part_b_id', p.matched_part_id,
        'sensor_b', p.sensor_b
      ),
      'open',
      public.part_match_engine_version()
    FROM pairs p
    WHERE p.sensor_a IS DISTINCT FROM p.sensor_b
      AND NOT EXISTS (
        SELECT 1 FROM public.part_match_conflict c
        WHERE c.conflict_type = 'index_wear_sensor'
          AND c.part_id = p.part_id
          AND c.matched_key = p.index_type || ':' || p.value_norm
      )
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  merge_pairs AS (
    SELECT
      p.*,
      (p.from_group IS NULL OR p.to_group IS NULL) AS has_ungrouped,
      CASE
        WHEN p.from_group IS NULL THEN p.to_group
        WHEN p.to_group IS NULL THEN p.from_group
      END AS lone_group_id,
      CASE
        WHEN p.from_group IS NULL THEN p.part_id
        WHEN p.to_group IS NULL THEN p.matched_part_id
      END AS ungrouped_part_id
    FROM pairs p
    WHERE p.sensor_a IS NOT DISTINCT FROM p.sensor_b
      AND NOT EXISTS (
        SELECT 1 FROM public.part_match_conflict c
        WHERE c.conflict_type = 'index_merge_proposed'
          AND c.part_id = p.part_id
          AND c.matched_key = p.index_type || ':' || p.value_norm
          AND c.status = 'removed'
      )
  ),
  group_busy AS (
    SELECT ig.id AS group_id,
      (
        EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.interchange_group_id = ig.id)
        OR EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.interchange_group_id = ig.id)
      ) AS busy
    FROM public.part_interchange_group ig
    WHERE ig.id IN (
      SELECT mp.from_group FROM merge_pairs mp WHERE mp.from_group IS NOT NULL
      UNION
      SELECT mp.to_group FROM merge_pairs mp WHERE mp.to_group IS NOT NULL
    )
  ),
  merge_proposals AS (
    INSERT INTO public.part_match_conflict (
      conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
    )
    SELECT
      'index_merge_proposed',
      CASE WHEN mp.has_ungrouped THEN mp.ungrouped_part_id ELSE mp.part_id END,
      CASE WHEN mp.has_ungrouped THEN mp.lone_group_id ELSE mp.from_group END,
      mp.index_type || ':' || mp.value_norm,
      CASE
        WHEN mp.has_ungrouped THEN jsonb_build_object(
          'index_type', mp.index_type,
          'value', mp.value_norm,
          'moving_part_id', mp.ungrouped_part_id,
          'source_group_id', NULL,
          'target_group_id', mp.lone_group_id
        )
        ELSE jsonb_build_object(
          'index_type', mp.index_type,
          'value', mp.value_norm,
          'moving_part_id', mp.part_id,
          'source_group_id', mp.from_group,
          'target_group_id', mp.to_group
        )
      END,
      'open',
      public.part_match_engine_version()
    FROM merge_pairs mp
    WHERE (
      mp.from_group IS NOT NULL
      AND mp.to_group IS NOT NULL
      AND (
        (
          EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
          AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy)
        )
        OR (
          EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
          AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND NOT gb.busy)
        )
        OR (
          EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND NOT gb.busy)
          AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy)
        )
      )
    ) OR (
      mp.has_ungrouped
      AND EXISTS (
        SELECT 1 FROM group_busy gb
        WHERE gb.group_id = mp.lone_group_id AND gb.busy
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  auto_merges AS (
    (SELECT DISTINCT ON (
      least(mp.from_group, mp.to_group),
      greatest(mp.from_group, mp.to_group),
      mp.index_type,
      mp.value_norm
    )
      mp.index_id,
      mp.index_type,
      mp.value_norm,
      ig_target.id AS target_group,
      CASE WHEN ig_target.id = mp.from_group THEN mp.matched_part_id ELSE mp.part_id END AS moving_part_id,
      CASE WHEN ig_target.id = mp.from_group THEN mp.to_group ELSE mp.from_group END AS source_group
    FROM merge_pairs mp
    JOIN group_busy gb_from ON gb_from.group_id = mp.from_group
    JOIN group_busy gb_to ON gb_to.group_id = mp.to_group
    CROSS JOIN LATERAL (
      SELECT ig.id
      FROM public.part_interchange_group ig
      WHERE ig.id IN (mp.from_group, mp.to_group)
      ORDER BY ig.created_at ASC NULLS LAST, ig.id ASC
      LIMIT 1
    ) ig_target
    WHERE mp.from_group IS NOT NULL
      AND mp.to_group IS NOT NULL
      AND NOT gb_from.busy
      AND NOT gb_to.busy
    ORDER BY
      least(mp.from_group, mp.to_group),
      greatest(mp.from_group, mp.to_group),
      mp.index_type,
      mp.value_norm,
      mp.part_id)

    UNION ALL

    SELECT
      mp.index_id,
      mp.index_type,
      mp.value_norm,
      mp.lone_group_id AS target_group,
      mp.ungrouped_part_id AS moving_part_id,
      NULL::uuid AS source_group
    FROM merge_pairs mp
    JOIN group_busy gb ON gb.group_id = mp.lone_group_id AND NOT gb.busy
    WHERE mp.has_ungrouped
  ),
  moved AS (
    UPDATE public.part_master pm
    SET interchange_group_id = am.target_group
    FROM auto_merges am
    WHERE pm.id = am.moving_part_id
      AND pm.interchange_group_id IS DISTINCT FROM am.target_group
    RETURNING pm.id, am.source_group, am.target_group, am.index_type, am.value_norm, am.index_id
  )
  INSERT INTO public.interchange_group_merge_log (
    part_id, from_group, to_group, rule, matched_key, index_number_id
  )
  SELECT
    am.moving_part_id,
    am.source_group,
    am.target_group,
    'index',
    am.index_type || ':' || am.value_norm,
    am.index_id
  FROM auto_merges am
  WHERE (
      am.source_group IS DISTINCT FROM am.target_group
      OR am.source_group IS NULL
    )
    AND EXISTS (SELECT 1 FROM moved m WHERE m.id = am.moving_part_id)
    AND NOT EXISTS (
    SELECT 1 FROM public.interchange_group_merge_log l
    WHERE l.part_id = am.moving_part_id AND l.to_group = am.target_group AND l.reversed_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_derived_keep(
  p_derived_id uuid,
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d public.part_fit_derived%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived WHERE id = p_derived_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Derived fit not found'; END IF;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    pfd.interchange_group_id, pfd.vehicle_catalog_id, pfd.position, pfd.side, pfd.year_from, pfd.year_to,
    von.evidence_url,
    'auto_match_kept', pfd.id, p_actor
  FROM public.part_fit_derived pfd
  LEFT JOIN public.vehicle_oe_number von ON von.id = pfd.vehicle_oe_number_id
  WHERE pfd.id = p_derived_id
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
      AND public.part_listing.origin IS DISTINCT FROM 'import';
  PERFORM public.part_match_recompute(d.interchange_group_id, d.vehicle_catalog_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_derived_keep_batch(
  p_derived_ids uuid[],
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_found integer;
  v_pair record;
BEGIN
  IF p_derived_ids IS NULL OR array_length(p_derived_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one fit.';
  END IF;
  SELECT count(*) INTO v_found
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);
  IF v_found <> array_length(p_derived_ids, 1) THEN
    RAISE EXCEPTION 'Unknown derived fit';
  END IF;

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    evidence_url, origin, derived_fit_id, verified_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    von.evidence_url,
    'auto_match_kept', d.id, p_actor
  FROM public.part_fit_derived d
  LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = EXCLUDED.origin,
        derived_fit_id = EXCLUDED.derived_fit_id
    WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
      AND public.part_listing.origin IS DISTINCT FROM 'import';

  FOR v_pair IN
    SELECT DISTINCT d.interchange_group_id, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE d.id = ANY (p_derived_ids)
  LOOP
    PERFORM public.part_match_recompute(v_pair.interchange_group_id, v_pair.vehicle_catalog_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.part_match_conflict_keep(
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
  v_derived uuid;
  v_other uuid;
  v_group uuid;
  v_manual boolean;
  v_kept_code text;
  v_other_code text;
BEGIN
  SELECT * INTO c FROM public.part_match_conflict WHERE id = p_conflict_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN RAISE EXCEPTION 'Conflict not open'; END IF;

  IF c.conflict_type IN ('oe_ambiguous', 'index_merge_proposed', 'system_link')
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution note is required for this conflict type';
  END IF;

  IF c.conflict_type = 'index_merge_proposed' THEN
    UPDATE public.part_master pm
    SET interchange_group_id = (c.detail->>'target_group_id')::uuid
    WHERE pm.id = (c.detail->>'moving_part_id')::uuid;
    INSERT INTO public.interchange_group_merge_log (
      part_id, from_group, to_group, rule, matched_key, conflict_id, created_by
    ) VALUES (
      (c.detail->>'moving_part_id')::uuid,
      (c.detail->>'source_group_id')::uuid,
      (c.detail->>'target_group_id')::uuid,
      'index', c.matched_key, c.id, p_actor
    );
  ELSE
    v_group := c.interchange_group_id;
    SELECT ig.code INTO v_kept_code
    FROM public.part_interchange_group ig
    WHERE ig.id = v_group;
    SELECT d.id INTO v_derived
    FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_catalog_id = c.vehicle_catalog_id
    ORDER BY d.computed_at DESC
    LIMIT 1;
    IF v_derived IS NOT NULL THEN
      INSERT INTO public.part_listing (
        interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
        evidence_url, origin, derived_fit_id, verified_by
      )
      SELECT
        d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
        von.evidence_url,
        'auto_match_kept', d.id, p_actor
      FROM public.part_fit_derived d
      LEFT JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
      WHERE d.id = v_derived
      ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
        SET origin = EXCLUDED.origin,
            derived_fit_id = EXCLUDED.derived_fit_id
        WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
          AND public.part_listing.origin IS DISTINCT FROM 'import';
    END IF;

    IF c.conflict_type = 'oe_ambiguous' AND c.detail ? 'group_ids' THEN
      FOR v_other IN
        SELECT value::uuid FROM jsonb_array_elements_text(c.detail->'group_ids') AS value
      LOOP
        IF v_other = v_group THEN CONTINUE; END IF;
        SELECT EXISTS (
          SELECT 1 FROM public.part_listing pl
          WHERE pl.interchange_group_id = v_other
            AND pl.vehicle_catalog_id = c.vehicle_catalog_id
            AND pl.origin IN ('manual', 'import')
        ) INTO v_manual;
        SELECT ig.code INTO v_other_code
        FROM public.part_interchange_group ig
        WHERE ig.id = v_other;
        IF v_manual THEN
          UPDATE public.part_match_conflict oc
          SET status = 'superseded',
              resolution_note = format(
                'Manual fit exists on %s; both kept',
                coalesce(v_other_code, v_other::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        ELSE
          INSERT INTO public.part_listing_exclusion (
            interchange_group_id, vehicle_catalog_id, reason, evidence_url, source, created_by
          ) VALUES (
            v_other,
            c.vehicle_catalog_id,
            coalesce(p_note, format('Resolved by keeping %s', coalesce(v_kept_code, v_group::text))),
            NULL,
            'auto_match_removed',
            p_actor
          )
          ON CONFLICT DO NOTHING;
          UPDATE public.part_match_conflict oc
          SET status = 'removed',
              resolution_note = format(
                'Resolved by keeping %s',
                coalesce(v_kept_code, v_group::text)
              ),
              resolved_at = now(), resolved_by = p_actor
          WHERE oc.status = 'open' AND oc.conflict_type = 'oe_ambiguous'
            AND oc.interchange_group_id = v_other
            AND oc.vehicle_catalog_id = c.vehicle_catalog_id
            AND oc.vehicle_oe_number_id IS NOT DISTINCT FROM c.vehicle_oe_number_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.part_match_conflict
  SET status = 'kept', resolution_note = p_note, resolved_by = p_actor, resolved_at = now()
  WHERE id = p_conflict_id;
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_index_rules(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_index_rules(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.part_match_derived_keep(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_keep(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.part_match_derived_keep_batch(uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_keep_batch(uuid[], uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.part_match_conflict_keep(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_conflict_keep(uuid, uuid, text) TO service_role;
