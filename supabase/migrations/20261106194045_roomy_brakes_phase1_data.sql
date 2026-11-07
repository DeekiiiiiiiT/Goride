-- Phase 1 — Roomy brakes existing data (RB-04, RB-03, RB-02 front pads, RB-01 front OE numbers).
-- Idempotent: safe to re-run; no-op on empty/local DB when referenced rows are missing.

DO $$
DECLARE
  v_actor uuid;
  v_mc_front uuid := 'a1000000-0000-4000-8000-00000000000a'::uuid;
  v_survivor uuid := '34c02865-b6fa-4238-a3bd-f6df7dd57c89'::uuid;
  v_conflict uuid := 'e9e86e27-98da-425e-a96c-1fd8ef15f2e7'::uuid;
  v_matched_key text := '04465B1190';
  v_tpl_vehicle uuid := '7c71d591-6a4a-4763-a858-f3850129fba2'::uuid;
  v_old_groups uuid[] := ARRAY[
    '823fc249-c60f-4ad4-9ddd-154b4950353b'::uuid,
    '9ccd838f-ccd9-483e-83b9-ee84f57ded25'::uuid,
    'a63a8e10-b39f-4ffc-8f06-3848a981f308'::uuid,
    'b2e80422-265a-4cc2-bcfb-9ce04732ada8'::uuid,
    'bb7a6c81-bc1d-4c74-b3d3-578024a28cd6'::uuid
  ];
  v_target_vehicles uuid[] := ARRAY[
    '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid,
    'ddf1d527-2c5d-4665-95e5-a097a1f30dd8'::uuid,
    '3ed7c48e-76f2-4024-92f5-ac291a8dff87'::uuid
  ];
  v_tpl public.vehicle_oe_number%ROWTYPE;
  v_g uuid;
  v_from uuid;
  v_note text := 'From SB catalogue cross-reference (same as the other Roomy rows); confirm in Toyota parts catalogue';
BEGIN
  IF to_regclass('public.part_master') IS NULL
     OR to_regclass('public.part_match_conflict') IS NULL THEN
    RETURN;
  END IF;

  SELECT u.id INTO v_actor
  FROM auth.users u
  WHERE u.id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'::uuid;

  -- Ensure source_type exists (this migration can run before add_a_part_self_serve_foundation on db reset).
  IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'part_master'
        AND c.column_name = 'source_type'
    ) THEN
    ALTER TABLE public.part_master ADD COLUMN IF NOT EXISTS source_type text;
  END IF;

  -- Step A — RB-04 wrong maker (04465-B1320 part)
  UPDATE public.part_master pm
  SET
    manufacturer = 'Daihatsu',
    evidence_url = 'https://www.sbparts.jp/catalogue/723410',
    updated_at = now()
  WHERE pm.id = '2238cf51-5585-4be4-beeb-cfb10c4fe6b0'::uuid
    AND (
      pm.manufacturer IS DISTINCT FROM 'Daihatsu'
      OR pm.evidence_url IS DISTINCT FROM 'https://www.sbparts.jp/catalogue/723410'
    );

  -- Step B — RB-03 verify three maker-catalogue pads (verified_at null, or confirmed backfill)
  UPDATE public.part_master pm
  SET
    verified_at = coalesce(pm.verified_at, now()),
    verified_by = coalesce(pm.verified_by, v_actor),
    source_type = 'part_maker_catalogue',
    catalog_decision = 'confirmed',
    updated_at = now()
  WHERE pm.id IN (
    'a64eb6f6-980b-4a33-8fff-41c87f59c89e'::uuid,
    '611b284b-76cc-41b1-b257-270649e3ccbc'::uuid,
    '8bf068d9-fa98-474e-b688-eaafe6940f8c'::uuid
  )
    AND (
      pm.verified_at IS NULL
      OR pm.catalog_decision IS DISTINCT FROM 'confirmed'
    );

  -- Step C — RB-02 merge front pads into survivor (only when kept conflict + groups exist for undo via merge log)
  IF EXISTS (
      SELECT 1
      FROM public.part_match_conflict c
      WHERE c.id = v_conflict
        AND c.status = 'kept'
    )
     AND EXISTS (SELECT 1 FROM public.part_interchange_group ig WHERE ig.id = v_survivor) THEN

    FOREACH v_from IN ARRAY v_old_groups
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.part_interchange_group ig WHERE ig.id = v_from) THEN
        CONTINUE;
      END IF;

      -- One merge_log row per moved part (same as part_match_conflict_merge_same_part).
      WITH moved AS (
        UPDATE public.part_master pm
        SET
          interchange_group_id = v_survivor,
          updated_at = now()
        WHERE pm.maintenance_component_id = v_mc_front
          AND pm.interchange_group_id = v_from
          AND pm.interchange_group_id IS DISTINCT FROM v_survivor
        RETURNING pm.id
      )
      INSERT INTO public.interchange_group_merge_log (
        part_id,
        from_group,
        to_group,
        rule,
        matched_key,
        conflict_id,
        created_by
      )
      SELECT
        m.id,
        v_from,
        v_survivor,
        'oe_same_part',
        v_matched_key,
        v_conflict,
        v_actor
      FROM moved m;
    END LOOP;

    -- Recompute survivor + each old group (mirrors part_match_conflict_merge_same_part)
    FOREACH v_g IN ARRAY v_old_groups || ARRAY[v_survivor]
    LOOP
      IF EXISTS (SELECT 1 FROM public.part_interchange_group ig WHERE ig.id = v_g) THEN
        PERFORM public.part_match_recompute(v_g, NULL);
      END IF;
    END LOOP;
  END IF;

  -- Step D — RB-01 copy front pad factory number from template Roomy row to three vehicles missing it
  SELECT von.* INTO v_tpl
  FROM public.vehicle_oe_number von
  WHERE von.vehicle_catalog_id = v_tpl_vehicle
    AND von.maintenance_component_id = v_mc_front
    AND von.oe_number_norm = upper(regexp_replace('04465-B1190', '[^A-Za-z0-9]', '', 'g'))
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.vehicle_oe_number (
      vehicle_catalog_id,
      maintenance_component_id,
      "position",
      side,
      year_from,
      year_to,
      oe_brand,
      oe_number,
      oe_number_norm,
      norm_version,
      evidence_url,
      note,
      created_by,
      import_batch_id
    )
    SELECT
      tv.target_id,
      v_tpl.maintenance_component_id,
      v_tpl."position",
      v_tpl.side,
      v_tpl.year_from,
      v_tpl.year_to,
      v_tpl.oe_brand,
      v_tpl.oe_number,
      v_tpl.oe_number_norm,
      v_tpl.norm_version,
      v_tpl.evidence_url,
      v_note,
      v_actor,
      NULL::uuid
    FROM unnest(v_target_vehicles) AS tv(target_id)
    WHERE EXISTS (SELECT 1 FROM public.vehicle_catalog vc WHERE vc.id = tv.target_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.vehicle_oe_number x
        WHERE x.vehicle_catalog_id = tv.target_id
          AND x.maintenance_component_id = v_tpl.maintenance_component_id
          AND x."position" IS NOT DISTINCT FROM v_tpl."position"
          AND x.side IS NOT DISTINCT FROM v_tpl.side
          AND x.oe_number_norm = v_tpl.oe_number_norm
      );
  END IF;
END $$;
