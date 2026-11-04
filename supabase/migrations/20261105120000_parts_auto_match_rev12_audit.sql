-- Parts auto-matching Rev 12 audit (engine + read models)
-- Depends on 20261105100000_parts_auto_match_rev12_hotfix.sql




ALTER TABLE public.interchange_group_merge_log
  ALTER COLUMN from_group DROP NOT NULL;

ALTER TABLE public.interchange_group_merge_log
  DROP CONSTRAINT IF EXISTS interchange_group_merge_log_distinct;

ALTER TABLE public.interchange_group_merge_log
  ADD CONSTRAINT interchange_group_merge_log_distinct
  CHECK (from_group IS NULL OR from_group <> to_group);

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'part-match-retention-cleanup';
    PERFORM cron.schedule(
      'part-match-retention-cleanup',
      '15 4 * * 0',
      $$SELECT public.part_match_retention_cleanup();$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'part-match-retention-cleanup cron skipped: %', SQLERRM;
END $do$;


CREATE OR REPLACE FUNCTION public.part_match_archive_derived_changes(
  p_new_engine_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scoped boolean := false;
BEGIN
  BEGIN
    v_scoped := EXISTS (SELECT 1 FROM _pm_scope LIMIT 1);
  EXCEPTION WHEN undefined_table THEN
    v_scoped := false;
  END;
  IF NOT v_scoped THEN
    BEGIN
      v_scoped := EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1);
    EXCEPTION WHEN undefined_table THEN
      v_scoped := false;
    END;
  END IF;

  INSERT INTO public.part_fit_derived_archive (
    derived_id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    rule, matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
    status, engine_version, computed_at, checking_note, archive_reason, removal_cause, superseded_by_engine_version
  )
  SELECT
    d.id, d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    d.rule, d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
    d.status, d.engine_version, d.computed_at, d.checking_note,
    CASE WHEN d.engine_version IS DISTINCT FROM p_new_engine_version THEN 'changed' ELSE 'removed' END,
    CASE WHEN d.engine_version IS DISTINCT FROM p_new_engine_version THEN 'engine_version_bump' ELSE 'scope_removed' END,
    p_new_engine_version
  FROM public.part_fit_derived d
  WHERE (
    NOT v_scoped
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  ) OR (
    v_scoped AND EXISTS (
      SELECT 1 FROM _pm_scope sp
      WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
    )
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  ) OR (
    v_scoped AND NOT EXISTS (SELECT 1 FROM _pm_scope LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM _pm_batch_scope bs
      WHERE bs.group_id = d.interchange_group_id AND bs.vehicle_id = d.vehicle_catalog_id
    )
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  );
END;
$$;


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
      AND pm.interchange_group_id IS NOT NULL
      AND pm2.interchange_group_id IS NOT NULL
      AND (
        p_group_id IS NOT NULL AND (pm.interchange_group_id = p_group_id OR pm2.interchange_group_id = p_group_id)
        OR p_group_id IS NULL AND (
          NOT EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1)
          OR EXISTS (
            SELECT 1 FROM _pm_batch_scope bs
            WHERE bs.group_id IN (pm.interchange_group_id, pm2.interchange_group_id)
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
    SELECT p.*
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
    WHERE ig.id IN (SELECT from_group FROM merge_pairs UNION SELECT to_group FROM merge_pairs)
  ),
  merge_proposals AS (
    INSERT INTO public.part_match_conflict (
      conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
    )
    SELECT
      'index_merge_proposed',
      mp.part_id,
      mp.from_group,
      mp.index_type || ':' || mp.value_norm,
      jsonb_build_object(
        'index_type', mp.index_type,
        'value', mp.value_norm,
        'moving_part_id', mp.part_id,
        'source_group_id', mp.from_group,
        'target_group_id', mp.to_group
      ),
      'open',
      public.part_match_engine_version()
    FROM merge_pairs mp
    WHERE (
      (EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
        AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy))
      OR (EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
        AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND NOT gb.busy))
      OR (EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND NOT gb.busy)
        AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy))
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  empty_merges AS (
    SELECT DISTINCT ON (least(mp.from_group, mp.to_group), greatest(mp.from_group, mp.to_group), mp.index_type, mp.value_norm)
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
      ORDER BY ig.created_at NULLS LAST, ig.id
      LIMIT 1
    ) ig_target
    WHERE NOT gb_from.busy AND NOT gb_to.busy
    ORDER BY least(mp.from_group, mp.to_group), greatest(mp.from_group, mp.to_group), mp.index_type, mp.value_norm, mp.part_id
  ),
  moved AS (
    UPDATE public.part_master pm
    SET interchange_group_id = em.target_group
    FROM empty_merges em
    WHERE pm.id = em.moving_part_id
      AND pm.interchange_group_id IS DISTINCT FROM em.target_group
    RETURNING pm.id, em.source_group, em.target_group, em.index_type, em.value_norm, em.index_id
  )
  INSERT INTO public.interchange_group_merge_log (
    part_id, from_group, to_group, rule, matched_key, index_number_id
  )
  SELECT
    em.moving_part_id,
    em.source_group,
    em.target_group,
    'index',
    em.index_type || ':' || em.value_norm,
    em.index_id
  FROM empty_merges em
  WHERE em.source_group IS DISTINCT FROM em.target_group
    AND EXISTS (SELECT 1 FROM moved m WHERE m.id = em.moving_part_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.interchange_group_merge_log l
      WHERE l.part_id = em.moving_part_id AND l.to_group = em.target_group AND l.reversed_at IS NULL
    );
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
        WHERE public.part_listing.origin IS DISTINCT FROM 'manual';
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


DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness;

DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);



CREATE OR REPLACE FUNCTION public.part_match_sync_conflicts(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_engine integer := public.part_match_engine_version();
BEGIN
  UPDATE public.part_match_conflict c
  SET status = 'superseded',
      resolved_at = now(),
      resolution_note = coalesce(c.resolution_note, 'Auto-superseded by recompute')
  WHERE c.status = 'open'
    AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
    AND (p_group_id IS NULL OR c.interchange_group_id = p_group_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.vehicle_catalog_id = c.vehicle_catalog_id
          AND pl.interchange_group_id = c.interchange_group_id
          AND pl.origin IN ('manual', 'import')
      )
      OR EXISTS (
        SELECT 1 FROM public.part_listing_exclusion ex
        WHERE ex.vehicle_catalog_id = c.vehicle_catalog_id
          AND ex.interchange_group_id = c.interchange_group_id
      )
    );

  WITH ambiguous AS (
    SELECT
      von.vehicle_catalog_id,
      von.id AS vehicle_oe_number_id,
      von.oe_number_norm,
      von.position,
      von.side,
      array_agg(DISTINCT gn.interchange_group_id ORDER BY gn.interchange_group_id) AS group_ids
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN LATERAL public.part_match_group_numbers(NULL) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE (p_vehicle_id IS NULL OR von.vehicle_catalog_id = p_vehicle_id)
    GROUP BY von.vehicle_catalog_id, von.id, von.oe_number_norm, von.position, von.side
    HAVING count(DISTINCT gn.interchange_group_id) > 1
  ),
  per_group AS (
    SELECT
      a.vehicle_catalog_id,
      a.vehicle_oe_number_id,
      a.oe_number_norm,
      a.position,
      a.side,
      a.group_ids,
      g.group_id AS interchange_group_id,
      jsonb_build_object(
        'vehicle_oe_number_id', a.vehicle_oe_number_id,
        'group_ids', to_jsonb(a.group_ids),
        'position', a.position,
        'side', a.side
      ) AS detail
    FROM ambiguous a
    CROSS JOIN LATERAL unnest(a.group_ids) AS g(group_id)
  )
  UPDATE public.part_match_conflict c
  SET status = 'open',
      resolved_at = NULL,
      resolved_by = NULL,
      resolution_note = NULL,
      engine_version = v_engine,
      detail = src.detail,
      computed_at = now()
  FROM per_group src
  WHERE c.status = 'superseded'
    AND c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = src.interchange_group_id
    AND c.vehicle_catalog_id = src.vehicle_catalog_id
    AND c.vehicle_oe_number_id = src.vehicle_oe_number_id
    AND c.matched_key IS NOT DISTINCT FROM src.oe_number_norm
    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.vehicle_catalog_id = src.vehicle_catalog_id
        AND pl.interchange_group_id = src.interchange_group_id
        AND pl.origin IN ('manual', 'import')
    );

  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id,
    matched_key, detail, status, engine_version
  )
  WITH ambiguous AS (
    SELECT
      von.vehicle_catalog_id,
      von.id AS vehicle_oe_number_id,
      von.oe_number_norm,
      von.position,
      von.side,
      array_agg(DISTINCT gn.interchange_group_id ORDER BY gn.interchange_group_id) AS group_ids
    FROM public.vehicle_oe_number von
    JOIN LATERAL public.part_match_oe_chain(von.id) ch ON true
    JOIN LATERAL public.part_match_group_numbers(NULL) gn
      ON gn.norm = ch.norm AND gn.brand = ch.brand
    WHERE (p_vehicle_id IS NULL OR von.vehicle_catalog_id = p_vehicle_id)
    GROUP BY von.vehicle_catalog_id, von.id, von.oe_number_norm, von.position, von.side
    HAVING count(DISTINCT gn.interchange_group_id) > 1
  ),
  per_group AS (
    SELECT
      a.vehicle_catalog_id,
      a.vehicle_oe_number_id,
      a.oe_number_norm,
      g.group_id AS interchange_group_id,
      jsonb_build_object(
        'vehicle_oe_number_id', a.vehicle_oe_number_id,
        'group_ids', to_jsonb(a.group_ids),
        'position', a.position,
        'side', a.side
      ) AS detail
    FROM ambiguous a
    CROSS JOIN LATERAL unnest(a.group_ids) AS g(group_id)
  )
  SELECT
    'oe_ambiguous',
    pg.interchange_group_id,
    pg.vehicle_catalog_id,
    pg.vehicle_oe_number_id,
    pg.oe_number_norm,
    pg.detail,
    'open',
    v_engine
  FROM per_group pg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'oe_ambiguous'
      AND c.interchange_group_id IS NOT DISTINCT FROM pg.interchange_group_id
      AND c.vehicle_catalog_id = pg.vehicle_catalog_id
      AND c.vehicle_oe_number_id = pg.vehicle_oe_number_id
      AND c.matched_key IS NOT DISTINCT FROM pg.oe_number_norm
  );

  INSERT INTO public.part_match_conflict (
    conflict_type, platform_component_link_id, matched_key, detail, status, engine_version
  )
  SELECT
    'system_link',
    pcl.id,
    pcl.scope || ':' || pcl.maintenance_component_id::text,
    jsonb_build_object(
      'platform_component_link_id', pcl.id,
      'scope', pcl.scope,
      'maintenance_component_id', pcl.maintenance_component_id,
      'position', pcl.position,
      'side', pcl.side
    ),
    'open',
    v_engine
  FROM public.platform_component_link pcl
  WHERE pcl.scope = 'system'
    AND NOT EXISTS (
      SELECT 1 FROM public.part_match_conflict c
      WHERE c.conflict_type = 'system_link'
        AND c.platform_component_link_id = pcl.id
        AND c.matched_key IS NOT DISTINCT FROM (pcl.scope || ':' || pcl.maintenance_component_id::text)
    );
END;
$$;



DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);


CREATE OR REPLACE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text,
  evidence_url text,
  match_reason_code text,
  match_reason_params jsonb,
  match_status text,
  fit_source text,
  via text,
  part_badge_code text,
  part_badge_params jsonb,
  derived_id uuid,
  side text,
  wva text,
  checking_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cat AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.platform_id,
      vc.engine_family_id,
      vc.chassis_code,
      vc.engine_code,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id
    FROM public.vehicle_platform p
    JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id
       OR p.id = mine.parent_id
       OR p.parent_id = cat.platform_id
       OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT
      pl.interchange_group_id AS group_id,
      pl.vehicle_catalog_id AS listed_id,
      pl.position,
      pl.side,
      pl.origin,
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url,
      pl.id AS listing_id
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT public.part_listing_exclusion_blocks(
      pl.interchange_group_id, cat.id, pl.position, pl.side, cat.match_year
    )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 2
        WHEN listings.fit_scope = 'powertrain'
          AND listings.listed_engine IS NOT NULL
          AND listings.listed_engine = cat.engine_family_id
          AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family))
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position, side)
      group_id,
      listing_tier,
      position,
      side,
      origin,
      fit_scope,
      listed_label,
      evidence_url,
      listing_id
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, side, listing_tier ASC, listed_id
  ),
  listing_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      bg.fit_scope,
      'listing'::text AS rule_source,
      bg.position,
      bg.group_id AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        ELSE bg.listing_tier
      END AS tier,
      bg.listed_label AS source_make,
      bg.evidence_url,
      CASE WHEN bg.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END AS fit_source,
      CASE bg.listing_tier
        WHEN 1 THEN 'direct'
        WHEN 2 THEN 'sister'
        WHEN 3 THEN 'engine'
        ELSE 'direct'
      END AS via,
      'live'::text AS match_status,
      'listed_direct'::text AS match_reason_code,
      jsonb_build_object('part_listing_id', bg.listing_id) AS match_reason_params,
      bg.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        JOIN cat ON true
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  derived_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 1 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'direct'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    JOIN cat ON cat.id = d.vehicle_catalog_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
  ),
  tier1_fits AS (
    SELECT d.interchange_group_id, d.position, d.side, d.status AS match_status,
           d.reason_code, d.reason_params, 'derived'::text AS fit_source, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE public.parts_auto_match_enabled() AND d.status IN ('live', 'needs_checking')
    UNION ALL
    SELECT pl.interchange_group_id, pl.position, pl.side, 'live'::text,
           'listed_direct'::text, jsonb_build_object('part_listing_id', pl.id),
           CASE WHEN pl.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END,
           pl.vehicle_catalog_id
    FROM public.part_listing pl
    WHERE public.parts_auto_match_enabled()
  ),
  tier1_on_car AS (
    SELECT t.* FROM tier1_fits t JOIN cat ON cat.id = t.vehicle_catalog_id
  ),
  link_tier3_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      t1.position,
      t1.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 3 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      t1.fit_source,
      'platform_link'::text AS via,
      CASE
        WHEN l.scope = 'system' OR t1.match_status = 'needs_checking' THEN 'needs_checking'
        ELSE 'live'
      END AS match_status,
      'via_platform_link'::text AS match_reason_code,
      jsonb_build_object(
        'link_id', l.id,
        'platform_code', vp.code,
        'source_vehicle_id', src.id,
        'source_tier', 1
      ) AS match_reason_params,
      t1.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM public.platform_component_link l
    JOIN cat ON true
    JOIN public.vehicle_catalog src
      ON src.platform_id = CASE
        WHEN cat.platform_id = l.platform_a_id THEN l.platform_b_id
        ELSE l.platform_a_id
      END
    JOIN public.vehicle_platform vp ON vp.id = src.platform_id
    JOIN tier1_fits t1 ON t1.vehicle_catalog_id = src.id
    JOIN public.part_master pm ON pm.interchange_group_id = t1.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND cat.platform_id IN (l.platform_a_id, l.platform_b_id)
      AND l.maintenance_component_id = pm.maintenance_component_id
      AND public.part_side_covers(l.position, l.side, t1.position, t1.side)
      AND NOT public.part_listing_exclusion_blocks(
        t1.interchange_group_id, cat.id, t1.position, t1.side, cat.match_year
      )
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)

      AND (
        cat.match_year IS NULL
        OR (
          cat.platform_id = l.platform_a_id
          AND (l.platform_a_year_from IS NULL OR cat.match_year >= l.platform_a_year_from)
          AND (l.platform_a_year_to IS NULL OR cat.match_year <= l.platform_a_year_to)
        )
        OR (
          cat.platform_id = l.platform_b_id
          AND (l.platform_b_year_from IS NULL OR cat.match_year >= l.platform_b_year_from)
          AND (l.platform_b_year_to IS NULL OR cat.match_year <= l.platform_b_year_to)
        )
      )
  ),
  sister_derived AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      2 AS tier,
      (src.make || ' ' || src.model) AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'sister'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.vehicle_catalog src ON src.id = d.vehicle_catalog_id
    JOIN cat ON true
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND d.vehicle_catalog_id <> cat.id
      AND src.platform_id IN (SELECT id FROM family)
      AND lower(src.make || ' ' || src.model) <> lower(cat.make || ' ' || cat.model)
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        d.interchange_group_id, cat.id, d.position, d.side, cat.match_year
      )
      AND (
        d.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= d.year_from
      )
      AND (
        d.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= d.year_to
      )
  ),
  hits AS (
    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM sister_derived
    UNION ALL
    SELECT * FROM link_tier3_hits
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  ),
  badges AS (
    SELECT
      m.part_id,
      CASE WHEN m.rule = 'index' THEN 'index_badge' END AS part_badge_code,
      jsonb_build_object(
        'index_type', m.matched_key,
        'merge_log_id', m.id
      ) AS part_badge_params
    FROM public.interchange_group_merge_log m
    WHERE m.reversed_at IS NULL
  ),
  ranked AS (
    SELECT DISTINCT ON (h.part_id, h."position", h.side)
      h.*
    FROM hits h
    ORDER BY h.part_id, h."position", h.side, h.tier ASC, h.rule_source
  )
  SELECT
    h.tier,
    h.part_id,
    h.part_name,
    h.oem_part_number,
    h.manufacturer,
    h.part_kind,
    h.fit_scope,
    h.rule_source,
    h.position,
    h.interchange_group_id,
    h.maintenance_component_id,
    h.category_id,
    sister.names AS sister_names,
    h.source_make,
    COALESCE(oem_ref.reference_oem, h.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, h.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      WHERE f.part_id = h.part_id AND f.outcome = 'fit'
    ), 0) AS confirmed_installs,
    h.description,
    h.evidence_url,
    h.match_reason_code,
    h.match_reason_params,
    h.match_status,
    h.fit_source,
    h.via,
    b.part_badge_code,
    b.part_badge_params,
    h.derived_id,
    h.side,
    h.wva,
    h.checking_note
  FROM ranked h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id
  LEFT JOIN badges b ON b.part_id = h.part_id;
$$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.part_match_health(p_vehicle_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'engineVersion', public.part_match_engine_version(),
    'normVersion', public.part_norm_position_version(),
    'enabled', public.parts_auto_match_enabled(),
    'derived', jsonb_build_object(
      'live', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'live' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'needsChecking', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'needs_checking' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id)),
      'suppressed', (SELECT count(*) FROM public.part_fit_derived d WHERE d.status = 'suppressed' AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
    ),
    'tierBreakdown', (
      SELECT coalesce(jsonb_object_agg(t.tier::text, t.cnt), '{}'::jsonb)
      FROM (
        SELECT pf.tier, count(*) AS cnt
        FROM public.vehicle_catalog vc
        CROSS JOIN LATERAL public.parts_for_vehicle(vc.id, NULL, vc.production_start_year) pf
        WHERE p_vehicle_id IS NULL OR vc.id = p_vehicle_id
        GROUP BY pf.tier
      ) t
    ),
    'openConflicts', (
      SELECT coalesce(jsonb_object_agg(conflict_type, cnt), '{}'::jsonb)
      FROM (
        SELECT c.conflict_type, count(*) AS cnt
        FROM public.part_match_conflict c
        WHERE c.status = 'open'
          AND (p_vehicle_id IS NULL OR c.vehicle_catalog_id = p_vehicle_id)
        GROUP BY c.conflict_type
      ) x
    ),
    'lastRun', (
      SELECT to_jsonb(l) FROM (
        SELECT run_id, kind, started_at, finished_at, error, duration_ms, rows_scanned
        FROM public.part_match_recompute_log
        ORDER BY started_at DESC
        LIMIT 1
      ) l
    ),
    'errorCount24h', (
      SELECT count(*) FROM public.part_match_recompute_log l
      WHERE l.error IS NOT NULL AND l.started_at > now() - interval '24 hours'
    ),
    'unresolvedPositionReports', (
      SELECT count(*) FROM public.part_norm_position_backfill_report r WHERE r.resolved_at IS NULL
    )
  );
$$;




CREATE OR REPLACE FUNCTION public.part_match_retention_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.part_match_recompute_log
  WHERE started_at < now() - interval '90 days';
  DELETE FROM public.part_match_recompute_checkpoint
  WHERE started_at < now() - interval '90 days';
  DELETE FROM public.part_fit_derived_archive
  WHERE computed_at < now() - interval '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_retention_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_retention_cleanup() TO service_role;



CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.part_norm_position_backfill_report r
    SET resolved_at = now(), resolved_by = NEW.verified_by
    WHERE r.resolved_at IS NULL
      AND r.listing_id = NEW.id
      AND (OLD.position IS DISTINCT FROM NEW.position OR OLD.side IS DISTINCT FROM NEW.side);
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT n.interchange_group_id AS gid, n.vehicle_catalog_id AS vid FROM new_rows n
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT o.interchange_group_id AS gid, o.vehicle_catalog_id AS vid FROM old_rows o
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;
