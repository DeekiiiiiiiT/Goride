-- Read-only checks for Phase 1 Roomy brakes data (run after migration on DB with seed data).

WITH
  v_mc_front AS (
    SELECT 'a1000000-0000-4000-8000-00000000000a'::uuid AS id
  ),
  v_mc_rear AS (
    SELECT 'f5a10001-0000-4000-8000-000000000002'::uuid AS id
  ),
  v_survivor AS (
    SELECT '34c02865-b6fa-4238-a3bd-f6df7dd57c89'::uuid AS id
  ),
  v_roomy_ids AS (
    SELECT unnest(ARRAY[
      '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid,
      '7c71d591-6a4a-4763-a858-f3850129fba2'::uuid,
      'ddf1d527-2c5d-4665-95e5-a097a1f30dd8'::uuid,
      '007d4cad-f47f-41d1-8354-442108af3902'::uuid,
      '3ed7c48e-76f2-4024-92f5-ac291a8dff87'::uuid
    ]) AS vehicle_catalog_id
  ),
  v_norm AS (
    SELECT upper(regexp_replace('04465-B1190', '[^A-Za-z0-9]', '', 'g')) AS oe_number_norm
  ),
  v_three AS (
    SELECT unnest(ARRAY[
      'a64eb6f6-980b-4a33-8fff-41c87f59c89e'::uuid,
      '611b284b-76cc-41b1-b257-270649e3ccbc'::uuid,
      '8bf068d9-fa98-474e-b688-eaafe6940f8c'::uuid
    ]) AS part_id
  ),
  v_conflict AS (
    SELECT 'e9e86e27-98da-425e-a96c-1fd8ef15f2e7'::uuid AS id
  ),
  front_pads AS (
    SELECT pm.*
    FROM public.part_master pm
    CROSS JOIN v_mc_front f
    WHERE pm.maintenance_component_id = f.id
  ),
  pfv AS (
    SELECT pf.interchange_group_id
    FROM public.parts_for_vehicle(
      '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid,
      (SELECT id FROM v_mc_front),
      2019
    ) pf
  )
SELECT * FROM (
  SELECT
    'front_pads_one_group'::text AS check_name,
    (
      (SELECT count(*) FROM front_pads) = 7
      AND (SELECT count(DISTINCT fp.interchange_group_id) FROM front_pads fp) = 1
      AND (SELECT fp.interchange_group_id FROM front_pads fp LIMIT 1) = (SELECT id FROM v_survivor)
    ) AS pass,
    format(
      'front_pad_rows=%s distinct_groups=%s group_id=%s (expect 7 rows, 1 group, survivor)',
      (SELECT count(*)::text FROM front_pads),
      (SELECT count(DISTINCT fp.interchange_group_id)::text FROM front_pads fp),
      (SELECT fp.interchange_group_id::text FROM front_pads fp LIMIT 1)
    ) AS detail

  UNION ALL

  SELECT
    'roomy_sees_one_group'::text,
    (
      (SELECT count(*) FROM pfv) >= 7
      AND (SELECT count(DISTINCT pfv.interchange_group_id) FROM pfv) = 1
    ),
    format(
      'parts_for_vehicle rows=%s distinct_group=%s',
      (SELECT count(*)::text FROM pfv),
      (SELECT count(DISTINCT pfv.interchange_group_id)::text FROM pfv)
    )

  UNION ALL

  SELECT
    'maker_fixed'::text,
    coalesce(
      (SELECT upper(trim(coalesce(pm.manufacturer, ''))) = 'DAIHATSU'
       FROM public.part_master pm
       WHERE pm.id = '2238cf51-5585-4be4-beeb-cfb10c4fe6b0'::uuid),
      false
    ),
    coalesce(
      (SELECT format('manufacturer=%s', coalesce(pm.manufacturer, 'NULL'))
       FROM public.part_master pm
       WHERE pm.id = '2238cf51-5585-4be4-beeb-cfb10c4fe6b0'::uuid),
      'part missing'
    )

  UNION ALL

  SELECT
    'three_verified'::text,
    (
      (SELECT count(*) FROM public.part_master pm
       JOIN v_three t ON t.part_id = pm.id
       WHERE pm.verified_at IS NOT NULL
         AND pm.source_type = 'part_maker_catalogue'
         AND pm.catalog_decision = 'confirmed') = 3
      AND NOT EXISTS (
        SELECT 1
        FROM public.part_master pm
        CROSS JOIN v_mc_front f
        CROSS JOIN v_mc_rear r
        WHERE pm.maintenance_component_id IN (f.id, r.id)
          AND pm.id NOT IN (SELECT part_id FROM v_three)
          AND (
            pm.verified_at IS NOT NULL
            OR pm.catalog_decision = 'confirmed'
          )
      )
    ),
    format(
      'confirmed_three=%s other_brake_verified=%s',
      (SELECT count(*)::text
       FROM public.part_master pm
       JOIN v_three t ON t.part_id = pm.id
       WHERE pm.verified_at IS NOT NULL
         AND pm.source_type = 'part_maker_catalogue'
         AND pm.catalog_decision = 'confirmed'),
      (SELECT count(*)::text
       FROM public.part_master pm
       CROSS JOIN v_mc_front f
       CROSS JOIN v_mc_rear r
       WHERE pm.maintenance_component_id IN (f.id, r.id)
         AND pm.id NOT IN (SELECT part_id FROM v_three)
         AND (
           pm.verified_at IS NOT NULL
           OR pm.catalog_decision = 'confirmed'
         ))
    )

  UNION ALL

  SELECT
    'roomy_oe_numbers'::text,
    NOT EXISTS (
      SELECT 1
      FROM v_roomy_ids v
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.vehicle_oe_number von
        CROSS JOIN v_mc_front f
        CROSS JOIN v_norm n
        WHERE von.vehicle_catalog_id = v.vehicle_catalog_id
          AND von.maintenance_component_id = f.id
          AND von.oe_number_norm = n.oe_number_norm
      )
    ),
    (SELECT string_agg(
      v.vehicle_catalog_id::text || ':' || coalesce(
        (SELECT count(*)::text
         FROM public.vehicle_oe_number von
         CROSS JOIN v_mc_front f
         CROSS JOIN v_norm n
         WHERE von.vehicle_catalog_id = v.vehicle_catalog_id
           AND von.maintenance_component_id = f.id
           AND von.oe_number_norm = n.oe_number_norm),
        '0'
      ),
      '; ' ORDER BY v.vehicle_catalog_id
     )
     FROM v_roomy_ids v
    )

  UNION ALL

  SELECT
    'no_new_open_conflicts'::text,
    NOT EXISTS (
      SELECT 1
      FROM public.part_match_conflict c
      WHERE c.status = 'open'
        AND c.matched_key = '04465B1190'
    ),
    (SELECT count(*)::text || ' open oe_ambiguous rows for 04465B1190'
     FROM public.part_match_conflict c
     WHERE c.status = 'open'
       AND c.matched_key = '04465B1190')

  UNION ALL

  SELECT
    'merge_logged'::text,
    (SELECT count(*) FROM public.interchange_group_merge_log ml
     CROSS JOIN v_conflict c
     WHERE ml.conflict_id = c.id
       AND ml.reversed_at IS NULL) = 5,
    (SELECT count(*)::text || ' log rows (expect 5)'
     FROM public.interchange_group_merge_log ml
     CROSS JOIN v_conflict c
     WHERE ml.conflict_id = c.id
       AND ml.reversed_at IS NULL)

  UNION ALL

  SELECT
    'rear_untouched'::text,
    (
      SELECT count(DISTINCT pm.interchange_group_id)
      FROM public.part_master pm
      CROSS JOIN v_mc_rear r
      WHERE pm.maintenance_component_id = r.id
        AND upper(trim(coalesce(pm.oem_part_number, ''))) IN ('04495-B2400', 'ADT34155')
    ) = 2,
    (SELECT string_agg(pm.oem_part_number || '->' || pm.interchange_group_id::text, ', ' ORDER BY pm.oem_part_number)
     FROM public.part_master pm
     CROSS JOIN v_mc_rear r
     WHERE pm.maintenance_component_id = r.id
       AND upper(trim(coalesce(pm.oem_part_number, ''))) IN ('04495-B2400', 'ADT34155')
    )
) checks
ORDER BY check_name;
